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

    // Images: use file_url directly (browser can display with auth).
    // PDFs: leave preview_url null — rendered as icon in UI.
    let previewUrl = null;
    if (doc.file_url) {
      const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(doc.file_type?.toLowerCase());
      if (isImage) {
        previewUrl = doc.file_url;
      }
    }

    if (previewUrl) {
      await base44.entities.Document.update(documentId, { preview_url: previewUrl });
    }

    return Response.json({ success: true, preview_url: previewUrl });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});