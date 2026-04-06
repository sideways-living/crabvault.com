import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // Allow scheduled calls (no user) or admin calls
  try {
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
  } catch {
    // Called from automation scheduler — use service role
  }

  const db = base44.asServiceRole;

  // Reset any docs stuck in 'processing' for more than 10 minutes back to 'pending'
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  const stuckDocs = await db.entities.Document.filter({
    processing_status: 'processing',
  }, '-updated_date', 50);
  const reallyStuck = stuckDocs.filter(d =>
    new Date(d.updated_date) < tenMinutesAgo
  );
  if (reallyStuck.length > 0) {
    await Promise.all(reallyStuck.map(d =>
      db.entities.Document.update(d.id, { processing_status: 'pending' })
    ));
    console.log(`Reset ${reallyStuck.length} stuck document(s) back to pending`);
  }

  // Fetch only next 5 pending documents to avoid timeout
  const pending = await db.entities.Document.filter({
    processing_status: 'pending',
  }, 'created_date', 5);

  if (pending.length === 0) {
    return Response.json({ message: 'No pending documents', processed: 0 });
  }

  const categories = await db.entities.Category.list();
  const folders = await db.entities.Folder.list();
  const categoryList = categories.map(c => `${c.id}: ${c.name} - ${c.description || ''}`).join('\n');
  const folderList = folders.map(f => `${f.id}: ${f.path || f.name}`).join('\n');

  // Fetch recent learning logs to guide AI decisions
  const allLogs = await db.entities.LearningLog.list('-created_date', 50);
  const learningSummary = allLogs.length > 0
    ? `\nPAST USER DECISIONS (use these as examples to guide your output):\n` +
      allLogs.map(l => {
        const parts = [];
        if (l.original_title && l.new_title && l.original_title !== l.new_title)
          parts.push(`- Renamed: "${l.original_title}" → "${l.new_title}"`);
        if (l.vendor_name) parts.push(`  Vendor: ${l.vendor_name}`);
        if (l.document_date) parts.push(`  Date: ${l.document_date}`);
        if (l.is_receipt) parts.push(`  Type: receipt`);
        if (l.new_folder_id) {
          const f = folders.find(f => f.id === l.new_folder_id);
          if (f) parts.push(`  Folder chosen: ${f.path || f.name}`);
        }
        return parts.join('\n');
      }).filter(Boolean).join('\n')
    : '';

  // Ensure a root "Receipts" folder exists
  let receiptsFolder = folders.find(f =>
    f.name.toLowerCase() === 'receipts' && !f.parent_folder_id
  );
  if (!receiptsFolder) {
    receiptsFolder = await db.entities.Folder.create({
      name: 'Receipts',
      path: '/Receipts',
    });
  }

  let processedCount = 0;

  for (const doc of pending) {
    await db.entities.Document.update(doc.id, { processing_status: 'processing' });

    // Step 1: OCR — extract text from PDF if not already searchable
    let extractedText = doc.extracted_text || '';
    if (doc.file_type === 'pdf' && !doc.is_searchable_pdf && doc.file_url) {
      const ocrResult = await db.integrations.Core.InvokeLLM({
        prompt: 'Extract ALL text content from this PDF document. Return the full verbatim text, preserving structure where possible. Do not summarise — return the raw extracted text only.',
        file_urls: [doc.file_url],
        response_json_schema: {
          type: 'object',
          properties: {
            extracted_text: { type: 'string' },
          },
        },
      });
      extractedText = ocrResult.extracted_text || '';
      await db.entities.Document.update(doc.id, {
        extracted_text: extractedText,
        is_searchable_pdf: true,
      });
    }

    // Step 2: Analyse, categorise, assign vault path
    const prompt = `Analyse this document and return a JSON response.
${learningSummary}

Document Naming Format: <date> - <person/entity> - <description> - <reference>

RULES:
- Date: The date FROM WITHIN the document (e.g., letter written date, not receipt date stamp). Format as YYYYMMDD.
- Person/Entity: For letters, use addressee in format "FirstName, MiddleName, SURNAME". For business documents (invoices, bills), use the entity name (e.g., "AGL Energy", "702.50 Lorimer St Docklands").
- Description: 1-5 words describing content (e.g., "Medical Report", "Phone Bill", "Service Invoice").
- Reference: Any invoice/reference/follow-up number. Omit if none exists.

Examples:
- "20240315 - John, Paul, SMITH - Medical Report - REF12345"
- "20240410 - AGL Energy - Electricity Bill - ACC987654"
- "20241101 - Jane, Marie, JOHNSON - Admission Letter"

=== RECEIPT DETECTION (VERY IMPORTANT) ===
A document IS a receipt if it contains ANY of: till/POS printout, store name + items + prices, transaction total, payment method (cash/card/eftpos), receipt/transaction number, barcode at bottom of page, "Thank you for shopping", subtotal/GST lines, or any retail purchase confirmation.
Do NOT require all fields — even a partial till receipt with just a store name and total qualifies.
When in doubt, set is_receipt: true.

1. RECEIPT (retail purchase, payment confirmation, till receipt):
    - is_receipt: true
    - Extract the exact transaction date → format as YYYYMMDD
    - Extract vendor_name / store_brand (clean name, e.g. "Woolworths", "Bunnings") — no Pty Ltd etc.
    - Extract store_location (suburb/city and state if visible, e.g. "Docklands VIC")
    - Extract transaction_type: "purchase", "return", or "exchange"
    - Extract tender_type: one of cash, mastercard, visa, amex, eftpos, gift_voucher, exchange_voucher, other
    - Extract amount (total as a number, e.g. 42.50)
    - Extract last_four_digits of card/voucher if shown (string, e.g. "4321"), otherwise null
    - Extract transaction_time in HH:MM 24-hour format if shown, otherwise null
    - Extract items: an array of ALL line items purchased/returned, each with name, quantity, unit_price, total_price (use null for any fields not visible)
    - Extract subtotal (amount before tax, as a number) if shown, otherwise null
    - Extract tax_amount (GST/VAT amount, as a number) if shown, otherwise null
    - Extract receipt_number (till/transaction/receipt reference number shown on receipt), otherwise null
    - suggested_title: "YYYYMMDD - StoreName Location - Receipt" (e.g. "20240315 - Woolworths Docklands VIC - Receipt")
    - folder_id: use the receipts folder structure from the folder list below
    - In summary list ALL items + prices and total.

2. LETTER / DOCUMENT ABOUT A PERSON:
   - is_receipt: false
   - Extract: document date (YYYYMMDD), addressee name (format as "FirstName, MiddleName, SURNAME" - uppercase surname), 1-5 word description of content, any reference/letter number.
   - suggested_title: "YYYYMMDD - FirstName, MiddleName, SURNAME - Description - Reference" (omit Reference if none). E.g. "20240315 - John, Paul, SMITH - Medical Report - MR2024001" or "20240410 - Jane, Marie, JOHNSON - Admission Letter"

3. INVOICE / BILL / BUSINESS DOCUMENT:
   - is_receipt: false
   - Extract: document date (YYYYMMDD), entity/company issuing it or subject matter (e.g., "AGL Energy", property address), 1-5 word description, document/invoice/reference number.
   - suggested_title: "YYYYMMDD - EntityName - Description - InvoiceNumber" (e.g. "20240410 - AGL Energy - Electricity Bill - ACC987654" or "20251001 - 702.50 Lorimer St Docklands - Backsplash Quote - QT16628")

4. ALL OTHER DOCUMENTS:
   - is_receipt: false
   - Extract document date if present (YYYYMMDD), key subject or person, and a 1-5 word description.
   - suggested_title: "YYYYMMDD - Subject - Description - ReferenceIfAny" or simple descriptive title if no clear date/subject

Also provide for ALL documents:
- summary: 2-3 sentence summary
- category_id: best match from this list (or null):
${categoryList}
- folder_id: best match from this list (or null). For receipts, pick the best matching receipt subfolder if one exists:
${folderList}
- tags: 3-5 relevant tags
- document_date: best guess at document date (YYYY-MM-DD) or null

Document title: ${doc.title}
Filename: ${doc.original_filename || ''}
${extractedText ? `Content preview:\n${extractedText.substring(0, 3000)}` : ''}`;

    // Only include image file if it's a supported format (png, jpeg, gif, webp)
    const supportedImageFormats = ['png', 'jpeg', 'jpg', 'gif', 'webp'];
    const fileExt = doc.file_type?.toLowerCase();
    const isUnsupportedImage = doc.file_type && !['pdf', 'docx', 'xlsx', 'pptx', 'txt'].includes(fileExt) && !supportedImageFormats.includes(fileExt);
    
    const result = await db.integrations.Core.InvokeLLM({
      prompt,
      file_urls: doc.file_url && !isUnsupportedImage ? [doc.file_url] : undefined,
      response_json_schema: {
        type: 'object',
        properties: {
          is_receipt: { type: 'boolean' },
          vendor_name: { type: 'string' },
          store_brand: { type: 'string' },
          store_location: { type: 'string' },
          transaction_date: { type: 'string' },
          transaction_type: { type: 'string' },
          tender_type: { type: 'string' },
          amount: { type: 'number' },
          last_four_digits: { type: 'string' },
          transaction_time: { type: 'string' },
          subtotal: { type: 'number' },
          tax_amount: { type: 'number' },
          receipt_number: { type: 'string' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                quantity: { type: 'number' },
                unit_price: { type: 'number' },
                total_price: { type: 'number' },
              },
            },
          },
          suggested_title: { type: 'string' },
          summary: { type: 'string' },
          category_id: { type: 'string' },
          folder_id: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          document_date: { type: 'string' },
        },
      },
    });

    let targetFolderId = result.folder_id || doc.folder_id || undefined;
    let vaultPath = doc.vault_path;

    // NOTE: Transaction record is created at user review/confirmation stage, not here

    if (result.is_receipt && (result.store_brand || result.vendor_name)) {
      const vendorName = (result.store_brand || result.vendor_name).trim();

      let vendorFolder = folders.find(f =>
        f.parent_folder_id === receiptsFolder.id &&
        f.name.toLowerCase() === vendorName.toLowerCase()
      );
      if (!vendorFolder) {
        vendorFolder = await db.entities.Folder.create({
          name: vendorName,
          parent_folder_id: receiptsFolder.id,
          path: `/Receipts/${vendorName}`,
        });
      }
      targetFolderId = vendorFolder.id;

      // Auto-assign vault path if the vendor folder has one
      const folder = folders.find(f => f.id === targetFolderId);
      if (folder?.vault_path) {
        const filename = (result.suggested_title || doc.title);
        vaultPath = `${folder.vault_path}/${filename}`;
      }
    }

    // Determine category from folder structure
    let categoryTag = null;
    if (targetFolderId) {
      let folder = folders.find(f => f.id === targetFolderId);
      
      // For root-level Receipts/Business Cards
      if (folder && !folder.parent_folder_id) {
        categoryTag = folder.name;
      } else if (folder) {
        // For 2nd level folders (under Documents/Images/Movies)
        let parent = folder;
        while (parent && parent.parent_folder_id) {
          parent = folders.find(f => f.id === parent.parent_folder_id);
        }
        if (parent && ['documents', 'images', 'movies'].includes(parent.name.toLowerCase())) {
          categoryTag = folder.name;
        } else if (parent) {
          categoryTag = parent.name;
        }
      }
    }

    const tags = result.tags || [];
    if (categoryTag && !tags.includes(categoryTag)) {
      tags.push(categoryTag);
    }

    await db.entities.Document.update(doc.id, {
      title: result.suggested_title || doc.title,
      summary: result.summary,
      category_id: result.category_id || undefined,
      folder_id: targetFolderId,
      tags: tags,
      document_date: result.transaction_date || result.document_date || undefined,
      processing_status: 'needs_review',
      vault_path: vaultPath || undefined,
      ai_data: result,
    });

    // Generate preview image
    if (!doc.preview_url) {
      try {
        await db.functions.invoke('generateDocumentPreview', { documentId: doc.id });
      } catch (err) {
        console.error(`Failed to generate preview for ${doc.id}:`, err);
      }
    }

    processedCount++;
  }

  return Response.json({
    message: `Processed ${processedCount} document(s)`,
    processed: processedCount,
  });
});