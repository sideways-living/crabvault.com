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
    if (['jpg', 'png', 'gif'].includes(doc.file_type)) {
      previewUrl = doc.file_url;
    }

    // For document types, generate AI preview images
    const documentPrompts = {
      pdf: 'Create a clean, professional thumbnail of a PDF document. Show a document icon with blue and gray tones, subtle gradient background, and a hint of visible text.',
      docx: 'Create a clean thumbnail of a Word document (.docx). Show a document icon with blue tones, lined paper pattern, and a pen symbol.',
      doc: 'Create a clean thumbnail of a Word document (.doc). Show a document icon with blue tones, lined paper pattern, and a pen symbol.',
      xlsx: 'Create a clean thumbnail of an Excel spreadsheet. Show a spreadsheet grid icon with green tones, cells visible, and data indicators.',
      xls: 'Create a clean thumbnail of an Excel spreadsheet. Show a spreadsheet grid icon with green tones, cells visible, and data indicators.',
      pptx: 'Create a clean thumbnail of a PowerPoint presentation. Show a presentation slide icon with orange/red tones, slides stacked, and a projection symbol.',
      ppt: 'Create a clean thumbnail of a PowerPoint presentation. Show a presentation slide icon with orange/red tones, slides stacked, and a projection symbol.'
    };

    if (documentPrompts[doc.file_type]) {
      try {
        const result = await base44.integrations.Core.GenerateImage({
          prompt: documentPrompts[doc.file_type]
        });
        previewUrl = result.url;
      } catch (err) {
        console.error(`Failed to generate ${doc.file_type} preview:`, err.message);
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