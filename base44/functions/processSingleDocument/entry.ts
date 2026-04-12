import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
  } catch {
    // Scheduled automation call
  }

  const db = base44.asServiceRole;

  // Get the first pending document
  const pending = await db.entities.Document.filter({ processing_status: 'pending' }, 'created_date', 1);
  
  if (pending.length === 0) {
    return Response.json({ message: 'No pending documents', processed: 0 });
  }

  const doc = pending[0];

  const logTask = async (task, status = 'in_progress', details = '') => {
    await db.entities.ProcessingLog.create({
      document_id: doc.id,
      task,
      status,
      details,
    });
  };

  await db.entities.Document.update(doc.id, { processing_status: 'processing' });
  await logTask('Starting document processing');

  try {
    // Step 1: Generate preview first
    await logTask('Generating preview image', 'in_progress');
    try {
      await db.functions.invoke('generateDocumentPreview', { documentId: doc.id });
      await logTask('Preview generated', 'completed');
    } catch (err) {
      await logTask('Preview generation', 'failed', err.message);
    }

    // Step 2: OCR extraction
    let extractedText = doc.extracted_text || '';
    if (doc.file_type === 'pdf' && !doc.is_searchable_pdf && doc.file_url) {
      await logTask('Extracting text from PDF', 'in_progress');
      const ocrResult = await db.integrations.Core.InvokeLLM({
        prompt: 'Extract ALL text content from this PDF document. Return the full verbatim text, preserving structure where possible. Do not summarise — return the raw extracted text only.',
        file_urls: [doc.file_url],
        response_json_schema: {
          type: 'object',
          properties: { extracted_text: { type: 'string' } },
        },
      });
      extractedText = ocrResult.extracted_text || '';
      await db.entities.Document.update(doc.id, {
        extracted_text: extractedText,
        is_searchable_pdf: true,
      });
      await logTask('Text extraction completed', 'completed');
    }

    // Step 3: AI analysis
    await logTask('AI analysis & categorization', 'in_progress');
    const categories = await db.entities.Category.list();
    const folders = await db.entities.Folder.list();
    const categoryList = categories.map(c => `${c.id}: ${c.name}`).join('\n');
    const folderList = folders.map(f => `${f.id}: ${f.path || f.name}`).join('\n');

    const allLogs = await db.entities.LearningLog.list('-created_date', 50);
    const learningSummary = allLogs.length > 0
      ? `\nRECENT USER DECISIONS:\n` + allLogs.slice(0, 5).map(l => `- ${l.action_type}: ${l.original_title} → ${l.new_title || ''}`).join('\n')
      : '';

    const result = await db.integrations.Core.InvokeLLM({
      prompt: `Analyse this document and return JSON.
${learningSummary}

Document Naming: <date> - <entity> - <description> - <reference>

For RECEIPTS specifically, the title format is:
- Purchase: "YYYYMMDD - StoreName Location - $XXX.XX Receipt" (e.g. "20240315 - Woolworths Docklands VIC - $42.50 Receipt")
- Exchange: "YYYYMMDD - StoreName Location - $XXX.XX Exchange Receipt"
- Refund: "YYYYMMDD - StoreName Location - $XXX.XX Refund Receipt"
Use the receipt date (not scan date), store name and location from the receipt, and total amount formatted as $XXX.XX.

For RECEIPTS, MUST extract:
- store_brand: clean store name (e.g. "Woolworths", "Bunnings")
- store_location: suburb/city and state (e.g. "Docklands VIC")
- transaction_date: YYYYMMDD format
- transaction_time: HH:MM 24h if shown, else null
- transaction_type: purchase / return / exchange
- tender_type: cash / mastercard / visa / amex / eftpos / gift_voucher / exchange_voucher / other
- amount: total as number (e.g. 42.50)
- subtotal: before tax, as number, or null
- tax_amount: GST/VAT as number, or null
- last_four_digits: last 4 of card/voucher if shown, or null
- receipt_number: till/transaction/receipt reference, or null
- items: ARRAY of ALL line items — each with name, quantity, unit_price, total_price (null if not visible). Do NOT skip items. This is CRITICAL.
- summary: 2-3 sentences including store name, date, amount, and 2-3 key items purchased (e.g. "Woolworths Docklands VIC on 15 Mar 2024. Purchased milk, bread, vegetables, and other groceries. Total: $42.50"). Use the extracted items to enrich the summary.

${categoryList ? 'Categories:\n' + categoryList : ''}
${folderList ? '\nFolders:\n' + folderList : ''}

Document: ${doc.title}
Filename: ${doc.original_filename || ''}
${extractedText ? `Content:\n${extractedText.substring(0, 1500)}` : ''}`,
      file_urls: (['png','jpg','jpeg','gif','webp'].includes(doc.file_type?.toLowerCase()) && doc.file_url) ? [doc.file_url] : undefined,
      response_json_schema: {
        type: 'object',
        properties: {
          is_receipt: { type: 'boolean' },
          suggested_title: { type: 'string' },
          summary: { type: 'string' },
          category_id: { type: 'string' },
          folder_id: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          document_date: { type: 'string' },
          vendor_name: { type: 'string' },
          store_brand: { type: 'string' },
          store_location: { type: 'string' },
          transaction_date: { type: 'string' },
          transaction_time: { type: 'string' },
          transaction_type: { type: 'string' },
          tender_type: { type: 'string' },
          amount: { type: 'number' },
          subtotal: { type: 'number' },
          tax_amount: { type: 'number' },
          last_four_digits: { type: 'string' },
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
        },
      },
    });
    await logTask('AI analysis completed', 'completed');

    // Step 4: Update document
    await logTask('Updating document metadata', 'in_progress');
    let targetFolderId = result.folder_id || doc.folder_id;
    let vaultPath = doc.vault_path;

    const tags = result.tags || [];
    await db.entities.Document.update(doc.id, {
      title: result.suggested_title || doc.title,
      summary: result.summary,
      category_id: result.category_id,
      folder_id: targetFolderId,
      tags,
      document_date: result.document_date,
      processing_status: 'needs_review',
      vault_path: vaultPath,
      ai_data: result,
    });
    await logTask('Document ready for review', 'completed');

    return Response.json({
      message: 'Document processed successfully',
      documentId: doc.id,
      title: result.suggested_title || doc.title,
    });

  } catch (error) {
    await logTask('Processing failed', 'failed', error.message);
    await db.entities.Document.update(doc.id, { processing_status: 'failed' });
    return Response.json({ error: error.message, documentId: doc.id }, { status: 500 });
  }
});