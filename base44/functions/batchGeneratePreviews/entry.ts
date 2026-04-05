import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // Admin-only access
  try {
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
  } catch {
    // Scheduled/service call
  }

  const db = base44.asServiceRole;
  const allDocs = await db.entities.Document.list();
  const docsNeedingPreviews = allDocs.filter(d => !d.preview_url);

  let generated = 0;
  for (const doc of docsNeedingPreviews) {
    try {
      await db.functions.invoke('generateDocumentPreview', { documentId: doc.id });
      generated++;
    } catch (err) {
      console.error(`Failed to generate preview for ${doc.id}:`, err);
    }
  }

  return Response.json({
    message: `Generated ${generated}/${docsNeedingPreviews.length} previews`,
    generated,
    total: docsNeedingPreviews.length,
  });
});