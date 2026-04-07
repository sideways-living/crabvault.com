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
    // Scheduled/service call — allowed
  }

  const db = base44.asServiceRole;
  const { force } = await req.json().catch(() => ({}));
  const allDocs = await db.entities.Document.filter({ processing_status: 'completed', is_deleted: false }, '-created_date', 200);
  const docsNeedingPreviews = allDocs.filter(d => (force || !d.preview_url) && d.file_url);

  let generated = 0;
  const imageTypes = ['jpg', 'jpeg', 'png', 'gif', 'webp'];

  // Process in parallel batches of 3
  const batchSize = 3;
  for (let i = 0; i < docsNeedingPreviews.length; i += batchSize) {
    const batch = docsNeedingPreviews.slice(i, i + batchSize);
    const results = await Promise.allSettled(batch.map(async (doc) => {
      if (!doc.file_url) return false;
      const encodedUrl = encodeURIComponent(doc.file_url);
      const isPdf = doc.file_type === 'pdf' || doc.file_url.toLowerCase().includes('.pdf');
      const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(doc.file_type?.toLowerCase());
      let previewUrl;
      if (isPdf) {
        previewUrl = `https://image.thum.io/get/width/400/page/1/${doc.file_url}`;
      } else if (isImage) {
        previewUrl = `https://images.weserv.nl/?url=${encodedUrl}&w=400&output=jpg&q=70`;
      } else {
        previewUrl = doc.file_url;
      }

      if (previewUrl) {
        await db.entities.Document.update(doc.id, { preview_url: previewUrl });
        console.log(`Set preview for ${doc.id} (${doc.title})`);
        return true;
      }
      return false;
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