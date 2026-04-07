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

    // Generate a low-res preview URL via free proxy services
    let previewUrl = null;
    if (doc.file_url) {
      const encodedUrl = encodeURIComponent(doc.file_url);
      const isPdf = doc.file_type === 'pdf' || doc.file_url.toLowerCase().includes('.pdf');
      const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(doc.file_type?.toLowerCase());
      if (isPdf) {
        // thum.io renders the first page of a PDF as a PNG image
        previewUrl = `https://image.thum.io/get/width/400/page/1/${doc.file_url}`;
      } else if (isImage) {
        previewUrl = `https://images.weserv.nl/?url=${encodedUrl}&w=400&output=jpg&q=70`;
      } else {
        previewUrl = doc.file_url; // fallback for other types
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