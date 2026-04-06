import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();

  if (user?.role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = base44.asServiceRole;

  // Reset all needs_review docs to pending
  const docs = await db.entities.Document.filter({
    processing_status: 'needs_review',
  }, '-created_date', 100);

  for (const doc of docs) {
    await db.entities.Document.update(doc.id, {
      processing_status: 'pending',
      ai_data: null,
      summary: null,
      tags: [],
      folder_id: null,
      category_id: null,
      vault_path: null,
      document_date: null,
    });
  }

  return Response.json({ reset: docs.length });
});