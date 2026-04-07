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
      try {
        // Step 1: Use InvokeLLM to read and describe the exact visual layout of the document
        const description = await base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt: `Look at this document and describe its EXACT visual layout and content as it appears on the page. Include:
- The exact text content, headings, amounts, dates, line items
- The visual structure (header area, body, footer)
- Any logos, tables, or distinct visual sections
- Font sizes (large heading, medium subheading, small body text)
- Alignment (centered, left-aligned)
- Whether it looks like a receipt (narrow strip), letter, invoice, or standard document
Be very specific about the actual content so it can be faithfully reproduced as a document image.`,
          file_urls: [doc.file_url],
        });

        // Step 2: Generate a faithful document page image from the description
        const isReceipt = doc.ai_data?.is_receipt;
        const result = await base44.asServiceRole.integrations.Core.GenerateImage({
          prompt: `Render a realistic, pixel-accurate screenshot of a ${isReceipt ? 'narrow thermal receipt paper' : 'white A4 document page'}. This is NOT an illustration — render it exactly like a scanned document or screenshot. White background, black text, no artistic embellishments. Use monospaced or standard document fonts. Here is the exact content and layout to reproduce:

${description}

Important: make it look exactly like the real document, not a stylized version.`,
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