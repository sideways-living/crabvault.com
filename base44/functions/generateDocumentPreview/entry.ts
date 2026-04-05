import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
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
    if (['jpg', 'png'].includes(doc.file_type)) {
      previewUrl = doc.file_url;
    }

    // For PDFs, generate a preview image using the file as reference
    if (doc.file_type === 'pdf' && doc.file_url) {
      try {
        const result = await base44.integrations.Core.GenerateImage({
          prompt: `Create a clean, professional thumbnail preview of a PDF document. Show the document icon with a subtle gradient background representing a business document. Include a small piece of visible text to indicate content. Colors: blue and gray tones.`,
          existing_image_urls: [doc.file_url]
        });
        previewUrl = result.url;
      } catch (err) {
        console.error('Failed to generate PDF preview:', err.message);
        // Fallback: use a generic PDF icon image
        previewUrl = null;
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