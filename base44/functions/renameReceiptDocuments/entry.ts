import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
  } catch {
    // service role call — allowed
  }

  const db = base44.asServiceRole;

  // Fetch all completed, non-deleted documents
  const allDocs = await db.entities.Document.filter(
    { processing_status: 'completed', is_deleted: false },
    '-created_date',
    500
  );

  // Filter to receipts only (have ai_data.is_receipt = true)
  const receipts = allDocs.filter(d => d.ai_data?.is_receipt === true);

  if (receipts.length === 0) {
    return Response.json({ message: 'No receipt documents found', updated: 0 });
  }

  const formatAmount = (amount) => {
    if (amount == null || isNaN(amount)) return null;
    return '$' + Number(amount).toFixed(2);
  };

  const buildTitle = (aiData) => {
    const date = aiData.transaction_date || aiData.document_date || '';
    const storeName = (aiData.store_brand || aiData.vendor_name || '').trim();
    const location = (aiData.store_location || '').trim();
    const storeAndLocation = [storeName, location].filter(Boolean).join(' ');
    const amount = formatAmount(aiData.amount);
    const transactionType = (aiData.transaction_type || 'purchase').toLowerCase();

    if (!date || !storeAndLocation || !amount) return null; // not enough data

    let typeWord = '';
    if (transactionType === 'exchange') typeWord = 'Exchange ';
    else if (transactionType === 'return' || transactionType === 'refund') typeWord = 'Refund ';

    return `${date} - ${storeAndLocation} - ${amount} ${typeWord}Receipt`.trim();
  };

  let updated = 0;
  let skipped = 0;

  for (const doc of receipts) {
    const newTitle = buildTitle(doc.ai_data);
    if (!newTitle) {
      skipped++;
      console.log(`Skipped ${doc.id} (${doc.title}) — missing ai_data fields`);
      continue;
    }

    if (newTitle === doc.title) {
      skipped++;
      continue;
    }

    await db.entities.Document.update(doc.id, { title: newTitle });
    console.log(`Renamed: "${doc.title}" → "${newTitle}"`);
    updated++;
  }

  return Response.json({
    message: `Renamed ${updated} receipt(s), skipped ${skipped}`,
    updated,
    skipped,
    total: receipts.length,
  });
});