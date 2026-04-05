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

  const allDocs = await db.entities.Document.list();
  const pending = allDocs.filter(d => d.processing_status === 'pending');

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

Classify and name this document using one of the following rules:

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
    - Extract items: an array of all line items purchased/returned, each with name, quantity, unit_price, total_price (use null for any fields not visible)
    - suggested_title: "YYYYMMDD - StoreName Location - TransactionType Receipt" (capitalize transaction_type: Purchase, Return, Exchange). E.g. "20240315 - Woolworths Docklands VIC - Purchase Receipt" or "20240315 - Bunnings Parramatta NSW - Exchange Receipt"
    - In summary list ALL items + prices and total.

2. QUOTE / INVOICE / PURCHASE ORDER / ESTIMATE (a formal business document with a number, subject, and vendor):
   - is_receipt: false
   - Extract: document date (YYYYMMDD), the subject/entity the document is about (e.g. a property address, person name, project), vendor/company issuing it, document type (Quote/Invoice/PO/Estimate), document number if present, and a very short description (3-6 words).
   - suggested_title MUST follow: "YYYYMMDD - Subject - VendorName DocumentType Number ShortDescription"
     e.g. "20251001 - 702.50 Lorimer St Docklands - Frameless Impressions Backsplash Quote 16628"
   - Omit document number if not found. Keep subject concise but specific.

3. ALL OTHER DOCUMENTS:
   - is_receipt: false
   - Extract document date if present (YYYYMMDD), key subject or person, and a short description.
   - If a clear date and subject exist: suggested_title = "YYYYMMDD - Subject - ShortDescription"
   - Otherwise: suggested_title = a clean, descriptive title

Also provide for ALL documents:
- summary: 2-3 sentence summary
- category_id: best match from this list (or null):
${categoryList}
- folder_id: best match from this list (or null). For receipts, leave null — folder will be handled separately:
${folderList}
- tags: 3-5 relevant tags
- document_date: best guess at document date (YYYY-MM-DD) or null

Document title: ${doc.title}
Filename: ${doc.original_filename || ''}
${extractedText ? `Content preview:\n${extractedText.substring(0, 3000)}` : ''}`;

    const result = await db.integrations.Core.InvokeLLM({
      prompt,
      file_urls: doc.file_url ? [doc.file_url] : undefined,
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

      const freshFolders = await db.entities.Folder.list();
      let vendorFolder = freshFolders.find(f =>
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
      // Non-receipt: auto-suggest vault path from folder
      const allFolders = await db.entities.Folder.list();
      const folder = allFolders.find(f => f.id === targetFolderId);
      if (folder?.vault_path) {
        const filename = (result.suggested_title || doc.title);
        vaultPath = `${folder.vault_path}/${filename}`;
      }
    }

    await db.entities.Document.update(doc.id, {
      title: result.suggested_title || doc.title,
      summary: result.summary,
      category_id: result.category_id || undefined,
      folder_id: targetFolderId,
      tags: result.tags || [],
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