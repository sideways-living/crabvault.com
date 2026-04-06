import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const user = await base44.auth.me();
  if (user?.role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = base44.asServiceRole;

  // Find all documents that are receipt-flagged (have a Transaction record or are in a Receipts folder)
  const [allDocs, allFolders, allTransactions] = await Promise.all([
    db.entities.Document.list(),
    db.entities.Folder.list(),
    db.entities.Transaction.list(),
  ]);

  // Get folder IDs under the Receipts root
  const receiptsRoot = allFolders.find(f => f.name.toLowerCase() === 'receipts' && !f.parent_folder_id);
  const receiptFolderIds = new Set();
  if (receiptsRoot) {
    receiptFolderIds.add(receiptsRoot.id);
    allFolders.forEach(f => {
      if (f.parent_folder_id === receiptsRoot.id) receiptFolderIds.add(f.id);
    });
  }

  // Document IDs that already have a transaction
  const txDocIds = new Set(allTransactions.map(t => t.document_id));

  // Target: docs in receipt folders OR with a transaction record, that are completed/needs_review/failed
  const targets = allDocs.filter(d =>
    (receiptFolderIds.has(d.folder_id) || txDocIds.has(d.id)) &&
    ['completed', 'needs_review', 'failed', 'processing'].includes(d.processing_status)
  );

  // Delete existing transactions for these docs so they get recreated fresh
  const txToDelete = allTransactions.filter(t => targets.some(d => d.id === t.document_id));
  await Promise.all(txToDelete.map(t => db.entities.Transaction.delete(t.id)));

  // Reset docs to pending
  await Promise.all(targets.map(d =>
    db.entities.Document.update(d.id, {
      processing_status: 'pending',
      ai_data: null,
      summary: null,
      tags: [],
    })
  ));

  return Response.json({ queued: targets.length });
});