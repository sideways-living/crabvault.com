import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
  } catch {
    // Scheduled/service call — allowed
  }

  const db = base44.asServiceRole;
  const { force } = await req.json().catch(() => ({}));
  const allDocs = await db.entities.Document.filter({ processing_status: 'completed', is_deleted: false }, '-created_date', 200);
  const docsNeedingPreviews = allDocs.filter(d => (force || !d.preview_url) && d.file_url);

  let generated = 0;
  const imageTypes = ['jpg', 'jpeg', 'png', 'gif', 'webp'];

  const batchSize = 5;
  for (let i = 0; i < docsNeedingPreviews.length; i += batchSize) {
    const batch = docsNeedingPreviews.slice(i, i + batchSize);
    const results = await Promise.allSettled(batch.map(async (doc) => {
      // Only images can be previewed — PDFs stay as null (shown as icon in UI)
      const isImage = imageTypes.includes(doc.file_type?.toLowerCase());
      if (!isImage) return false;

      await db.entities.Document.update(doc.id, { preview_url: doc.file_url });
      console.log(`Set preview for ${doc.id} (${doc.title})`);
      return true;
    }));

    generated += results.filter(r => r.status === 'fulfilled' && r.value).length;
    results.forEach((r, idx) => {
      if (r.status === 'rejected') console.error(`Failed for ${batch[idx].id}: ${r.reason?.message}`);
    });
  }

  return Response.json({
    message: `Generated ${generated}/${docsNeedingPreviews.length} previews`,
    generated,
    total: docsNeedingPreviews.length,
  });
});