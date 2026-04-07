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
  const allDocs = await db.entities.Document.filter({ processing_status: 'completed', is_deleted: false }, '-created_date', 200);
  const docsNeedingPreviews = allDocs.filter(d => !d.preview_url && d.file_url);

  let generated = 0;
  const imageTypes = ['jpg', 'jpeg', 'png', 'gif', 'webp'];

  for (const doc of docsNeedingPreviews) {
    try {
      let previewUrl = null;

      if (imageTypes.includes(doc.file_type?.toLowerCase())) {
        // Use the image directly as the preview
        previewUrl = doc.file_url;
      } else {
        // Generate a visual preview from the actual document file
        const result = await db.integrations.Core.GenerateImage({
          prompt: `Create a clean, accurate visual thumbnail/preview of this document. Show the actual content and layout as it appears in the document. Use portrait orientation with white background. Make it look like a real document screenshot.`,
          existing_image_urls: [doc.file_url],
        });
        previewUrl = result.url;
      }

      if (previewUrl) {
        await db.entities.Document.update(doc.id, { preview_url: previewUrl });
        generated++;
        console.log(`Generated preview for ${doc.id} (${doc.title})`);
      }
    } catch (err) {
      console.error(`Failed to generate preview for ${doc.id}: ${err.message}`);
    }
  }

  return Response.json({
    message: `Generated ${generated}/${docsNeedingPreviews.length} previews`,
    generated,
    total: docsNeedingPreviews.length,
  });
});