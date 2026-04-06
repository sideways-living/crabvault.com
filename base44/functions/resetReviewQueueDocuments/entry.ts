import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();

  if (user?.role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = base44.asServiceRole;

  // Fetch all documents in needs_review
  const docs = await db.entities.Document.filter({
    processing_status: 'needs_review',
  }, '-created_date', 500);

  if (docs.length === 0) {
    return Response.json({ message: 'No documents in review queue', reset: 0 });
  }

  // Reset each document: clear AI data and set back to pending
  await Promise.all(docs.map(doc =>
    db.entities.Document.update(doc.id, {
      processing_status: 'pending',
      ai_data: null,
      summary: null,
      tags: [],
      category_id: null,
      folder_id: null,
      vault_path: null,
      document_date: null,
      extracted_text: null,
      is_searchable_pdf: false,
    })
  ));

  return Response.json({
    message: `Reset ${docs.length} document(s) in review queue back to pending`,
    reset: docs.length,
  });
});