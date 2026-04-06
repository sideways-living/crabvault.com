import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();

  if (user?.role !== 'admin') {
    return Response.json({ error: 'Forbidden: Admin only' }, { status: 403 });
  }

  const db = base44.asServiceRole;

  // Fetch all pending documents
  const pending = await db.entities.Document.filter({
    processing_status: 'pending',
  });

  if (pending.length === 0) {
    return Response.json({ message: 'No pending documents', reset: 0 });
  }

  // Reset each one: clear AI data, summary, tags, folder, category, vault path
  await Promise.all(pending.map(doc =>
    db.entities.Document.update(doc.id, {
      ai_data: null,
      summary: null,
      tags: [],
      folder_id: null,
      category_id: null,
      vault_path: null,
      processing_status: 'pending',
    })
  ));

  return Response.json({
    message: `Reset ${pending.length} pending document(s) for reprocessing`,
    reset: pending.length,
  });
});