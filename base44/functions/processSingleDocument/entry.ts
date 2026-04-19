import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

async function processDoc(db, doc) {
  const logTask = async (task, status = 'in_progress', details = '') => {
    await db.entities.ProcessingLog.create({ document_id: doc.id, task, status, details });
  };

  await db.entities.Document.update(doc.id, { processing_status: 'processing' });
  await logTask('Starting document processing');

  try {
    await logTask('AI analysis & categorization', 'in_progress');

    const categories = await db.entities.Category.list();
    const folders = await db.entities.Folder.list();
    const categoryList = categories.map(c => `${c.id}: ${c.name}`).join('\n');
    const folderList = folders.map(f => `${f.id}: ${f.path || f.name}`).join('\n');

    const allLogs = await db.entities.LearningLog.list('-created_date', 20);
    const learningSummary = allLogs.length > 0
      ? `\nRECENT USER DECISIONS:\n` + allLogs.slice(0, 5).map(l => `- ${l.action_type}: ${l.original_title} → ${l.new_title || ''}`).join('\n')
      : '';

    const fileUrl = doc.file_url || null;
    const isVisual = fileUrl && ['png','jpg','jpeg','gif','webp','pdf'].includes(doc.file_type?.toLowerCase());

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
- summary: 2-3 sentences including store name, date, amount, and 2-3 key items purchased. Use the extracted items to enrich the summary.

IMAGE ORIENTATION: If this is an image, determine whether the text/content is rotated. Return rotation_degrees as the number of clockwise degrees needed to make the document read correctly upright. Must be 0, 90, 180, or 270. If already upright or this is not an image, return 0.

${categoryList ? 'Categories:\n' + categoryList : ''}
${folderList ? '\nFolders:\n' + folderList : ''}

Document: ${doc.title}
Filename: ${doc.original_filename || ''}
${doc.extracted_text ? `Previously extracted text:\n${doc.extracted_text.substring(0, 1500)}` : ''}`,
      file_urls: isVisual ? [fileUrl] : undefined,
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
          rotation_degrees: { type: 'number' },
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

    // Save receipt transaction if detected
    if (result.is_receipt && result.transaction_date) {
      const existing = await db.entities.Transaction.filter({ document_id: doc.id });
      const txnData = {
        document_id: doc.id,
        store_brand: result.store_brand,
        store_location: result.store_location,
        transaction_date: result.transaction_date,
        transaction_time: result.transaction_time,
        transaction_type: result.transaction_type,
        tender_type: result.tender_type,
        amount: result.amount,
        subtotal: result.subtotal,
        tax_amount: result.tax_amount,
        last_four_digits: result.last_four_digits,
        receipt_number: result.receipt_number,
        items: result.items || [],
      };
      if (existing.length > 0) {
        await db.entities.Transaction.update(existing[0].id, txnData);
      } else {
        await db.entities.Transaction.create(txnData);
      }
    }

    // Update document metadata
    await db.entities.Document.update(doc.id, {
      title: result.suggested_title || doc.title,
      summary: result.summary,
      category_id: result.category_id || doc.category_id,
      folder_id: result.folder_id || doc.folder_id,
      tags: result.tags || [],
      document_date: result.document_date,
      processing_status: 'needs_review',
      ai_data: { ...result, rotation_degrees: result.rotation_degrees || 0 },
    });

    await logTask('Document ready for review', 'completed');

    return { documentId: doc.id, title: result.suggested_title || doc.title, success: true };

  } catch (error) {
    await logTask('Processing failed', 'failed', error.message);
    await db.entities.Document.update(doc.id, { processing_status: 'failed' });
    return { documentId: doc.id, error: error.message, success: false };
  }
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
  } catch {
    // Scheduled automation call — allow through
  }

  const db = base44.asServiceRole;

  // Get up to 2 pending documents
  const pending = await db.entities.Document.filter({ processing_status: 'pending' }, 'created_date', 4);

  if (pending.length === 0) {
    return Response.json({ message: 'No pending documents', processed: 0 });
  }

  const results = [];
  for (const doc of pending) {
    results.push(await processDoc(db, doc));
  }

  return Response.json({ message: `Processed ${results.length} document(s)`, results });
});