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
      let previewUrl = null;

      if (imageTypes.includes(doc.file_type?.toLowerCase())) {
        previewUrl = doc.file_url;
      } else {
        const description = await db.integrations.Core.InvokeLLM({
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

        const isReceipt = doc.ai_data?.is_receipt;
        const result = await db.integrations.Core.GenerateImage({
          prompt: `Render a realistic, pixel-accurate screenshot of a ${isReceipt ? 'narrow thermal receipt paper' : 'white A4 document page'}. This is NOT an illustration — render it exactly like a scanned document or screenshot. White background, black text, no artistic embellishments. Use monospaced or standard document fonts. Here is the exact content and layout to reproduce:\n\n${description}\n\nImportant: make it look exactly like the real document, not a stylized version.`,
        });
        previewUrl = result.url;
      }

      if (previewUrl) {
        await db.entities.Document.update(doc.id, { preview_url: previewUrl });
        console.log(`Generated preview for ${doc.id} (${doc.title})`);
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