import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Allow calls from authenticated users OR from service-role (batch/automation)
    try {
      const user = await base44.auth.me();
      if (!user) throw new Error('no user');
    } catch {
      // service role call — allowed
    }

    const { documentId } = await req.json();
    if (!documentId) {
      return Response.json({ error: 'documentId required' }, { status: 400 });
    }

    const doc = await base44.entities.Document.get(documentId);
    if (!doc) {
      return Response.json({ error: 'Document not found' }, { status: 404 });
    }

    let previewUrl = null;

    // For image files, use the file URL directly as preview
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(doc.file_type)) {
      previewUrl = doc.file_url;
    } else if (doc.file_url) {
      // For PDFs and other docs, generate a visual preview from the actual document
      try {
        const result = await base44.asServiceRole.integrations.Core.GenerateImage({
          prompt: `Create a clean, accurate visual thumbnail/preview of this document. Show the actual content and layout as it appears in the document. Use portrait orientation with white background. Make it look like a real document screenshot.`,
          existing_image_urls: [doc.file_url],
        });
        previewUrl = result.url;
      } catch (err) {
        console.error(`Failed to generate preview for ${doc.file_type}:`, err.message);
      }
    }

    // Update document with preview URL if generated
    if (previewUrl) {
      await base44.entities.Document.update(documentId, { preview_url: previewUrl });
    }

    return Response.json({ success: true, preview_url: previewUrl });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});