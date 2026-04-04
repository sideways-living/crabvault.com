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

    const prompt = `Analyse this document and return a JSON response.

First determine if this document is a RECEIPT (a purchase receipt, invoice, payment confirmation, etc.).

If it IS a receipt:
- Extract: transaction_date (YYYY-MM-DD), vendor_name (clean company name, e.g. "Woolworths", "Amazon", "Shell")
- suggested_title should follow the format: "YYYYMMDD - Vendor - Receipt" (e.g. "20240315 - Woolworths - Receipt")
- is_receipt: true
- In the summary, list ALL items purchased (name and price if available), e.g. "Receipt from Bunnings on 15 Mar 2024. Items: Spade $29.98, Garden Gloves $12.00, Potting Mix $8.50. Total: $50.48."

If it is NOT a receipt:
- is_receipt: false
- suggested_title: a clean, descriptive title for the document

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
${doc.extracted_text ? `Content preview:\n${doc.extracted_text.substring(0, 3000)}` : ''}`;

    const result = await db.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          is_receipt: { type: 'boolean' },
          vendor_name: { type: 'string' },
          transaction_date: { type: 'string' },
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

    if (result.is_receipt && result.vendor_name) {
      const vendorName = result.vendor_name.trim();

      // Reload folders to catch any just-created ones
      const freshFolders = await db.entities.Folder.list();

      // Find or create a vendor subfolder under Receipts
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
      if (!vaultPath && vendorFolder.vault_path) {
        const filename = (result.suggested_title || doc.title) + '.' + (doc.original_filename?.split('.').pop() || 'pdf');
        vaultPath = `${vendorFolder.vault_path}/${filename}`;
      }
    } else if (!vaultPath && targetFolderId) {
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
      processing_status: 'completed',
      vault_path: vaultPath || undefined,
    });

    processedCount++;
  }

  return Response.json({
    message: `Processed ${processedCount} document(s)`,
    processed: processedCount,
  });
});