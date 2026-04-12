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

  // Fetch pending documents — 1 at a time to avoid timeouts
  const pending = await db.entities.Document.filter({
    processing_status: 'pending',
  }, 'created_date', 1);

  const allDocs = [...pending];

  if (allDocs.length === 0) {
    return Response.json({ message: 'No documents to process', processed: 0 });
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

  for (const doc of allDocs) {
    await db.entities.Document.update(doc.id, { processing_status: 'processing' });

    // Use previously extracted text if available
    const extractedText = doc.extracted_text || '';

    // Analyse, categorise, assign vault path
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

=== PREPAID / RECHARGE VOUCHER (CHECK THIS FIRST — OVERRIDES RECEIPT LOGIC) ===
A document IS a prepaid/recharge voucher if it contains ANY of: the words "prepaid voucher", "recharge voucher", "top-up voucher", a "Voucher Number" or "PIN" field followed by a string of 8-10 digits, or is clearly a mobile credit top-up slip (e.g. Telstra, Optus, Boost, Woolworths Mobile). These are NEVER receipts — even if they show a purchase total.
If matched:
- is_recharge_voucher: true
- is_receipt: false
- suggested_title format: "YYYYMMDD - StoreName Recharge Voucher - TRANSACTIONTYPE"
  - Date: from the voucher (YYYYMMDD)
  - StoreName: store brand, first letter uppercase rest lowercase (e.g. "Woolworths", "Boost", "Telstra")
  - TRANSACTIONTYPE: in ALL CAPS (e.g. "PURCHASE", "RECHARGE", "TOP-UP")
  - Example: "20240315 - Boost Recharge Voucher - PURCHASE"
- summary: brief description (e.g. "Boost prepaid $30 recharge voucher, PIN: 1234567890")
- tags: include "recharge", "voucher", "phone"
- folder_id: find the folder whose path contains "phone vouchers" (case-insensitive) from the list below

=== RECEIPT DETECTION (VERY IMPORTANT) ===
A document IS a receipt if it contains ANY of: till/POS printout, store name + items + prices, transaction total, payment method (cash/card/eftpos), receipt/transaction number, barcode at bottom of page, "Thank you for shopping", subtotal/GST lines, or any retail purchase confirmation.
Do NOT require all fields — even a partial till receipt with just a store name and total qualifies.
When in doubt, set is_receipt: true.

1. RECEIPT (retail purchase, payment confirmation, till receipt):
    - is_receipt: true
    - is_recharge_voucher: false
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
    - suggested_title format: "YYYYMMDD - StoreName Location - $XXX.XX Receipt" for purchases (e.g. "20240315 - Woolworths Docklands VIC - $42.50 Receipt"), or "YYYYMMDD - StoreName Location - $XXX.XX Exchange Receipt" / "YYYYMMDD - StoreName Location - $XXX.XX Refund Receipt" for exchange/refund. Use the receipt date (not scan date), store name and location from the receipt, and total amount formatted as $XXX.XX. Omit the type word for purchases.
    - folder_id: use the receipts folder structure from the folder list below
    - summary: Brief 1-2 sentence description (e.g. "Woolworths grocery purchase, $65.76 total, paid by Mastercard"). Do NOT list items in the summary — they belong in the items array.
    - items: CRITICAL — extract EVERY line item from the receipt into this array. Each item must have name, quantity, unit_price, total_price. If a field isn't visible use null. Do not skip items.

2. LETTER / DOCUMENT ABOUT A PERSON:
   - is_receipt: false
   - is_recharge_voucher: false
   - Extract: document date (YYYYMMDD), addressee name (format as "FirstName, MiddleName, SURNAME" - uppercase surname), 1-5 word description of content, any reference/letter number.
   - suggested_title: "YYYYMMDD - FirstName, MiddleName, SURNAME - Description - Reference" (omit Reference if none). E.g. "20240315 - John, Paul, SMITH - Medical Report - MR2024001" or "20240410 - Jane, Marie, JOHNSON - Admission Letter"

3. INVOICE / BILL / BUSINESS DOCUMENT:
   - is_receipt: false
   - is_recharge_voucher: false
   - Extract: document date (YYYYMMDD), entity/company issuing it or subject matter (e.g., "AGL Energy", property address), 1-5 word description, document/invoice/reference number.
   - suggested_title: "YYYYMMDD - EntityName - Description - InvoiceNumber" (e.g. "20240410 - AGL Energy - Electricity Bill - ACC987654" or "20251001 - 702.50 Lorimer St Docklands - Backsplash Quote - QT16628")

4. ALL OTHER DOCUMENTS:
   - is_receipt: false
   - is_recharge_voucher: false
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
${extractedText ? `Content preview:\n${extractedText.substring(0, 1500)}` : ''}`;

    // Only pass file_url for images — PDFs/docs rely on extracted_text to avoid LLM timeouts
    const imageFormats = ['png', 'jpeg', 'jpg', 'gif', 'webp'];
    const fileExt = doc.file_type?.toLowerCase();
    const isImage = imageFormats.includes(fileExt);

    let result = null;
    const maxRetries = 1;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        result = await db.integrations.Core.InvokeLLM({
          prompt,
          file_urls: (isImage && doc.file_url) ? [doc.file_url] : undefined,
          response_json_schema: {
            type: 'object',
            properties: {
              is_receipt: { type: 'boolean' },
              is_recharge_voucher: { type: 'boolean' },
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
        console.log(`AI analysis succeeded for ${doc.id} on attempt ${attempt}`);
        break;
      } catch (err) {
        lastError = err.message;
        console.warn(`AI analysis attempt ${attempt}/${maxRetries} failed for ${doc.id}: ${err.message}`);
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }

    if (!result) {
      console.error(`AI analysis failed for ${doc.id} after ${maxRetries} attempts: ${lastError}`);
      await db.entities.Document.update(doc.id, {
        processing_status: 'failed',
        notes: `AI analysis failed after ${maxRetries} attempts: ${lastError}`
      });
      await db.entities.ProcessingLog.create({
        document_id: doc.id,
        task: 'AI Analysis',
        status: 'failed',
        details: `LLM invocation failed: ${lastError}`
      });
      processedCount++;
      continue;
    }

    let targetFolderId = result.folder_id || doc.folder_id || undefined;
    let vaultPath = doc.vault_path;

    // NOTE: Transaction record is created at user review/confirmation stage, not here

    if (result.is_recharge_voucher) {
      // Recharge vouchers always go to Documents/Infrastructure/Phone Vouchers
      const phoneVouchersFolder = folders.find(f =>
        (f.path || f.name).toLowerCase().includes('phone vouchers')
      );
      if (phoneVouchersFolder) {
        targetFolderId = phoneVouchersFolder.id;
        if (phoneVouchersFolder.vault_path) {
          vaultPath = `${phoneVouchersFolder.vault_path}/${result.suggested_title || doc.title}`;
        }
      }
    } else if (result.is_receipt && (result.store_brand || result.vendor_name)) {
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

      if (folder && !folder.parent_folder_id) {
        categoryTag = folder.name;
      } else if (folder) {
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

    processedCount++;
  }

  return Response.json({
    message: `Processed ${processedCount} document(s)`,
    processed: processedCount,
  });
});