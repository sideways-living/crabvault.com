import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Extracts full text from a CrabDocument using the AI vision model
 * and stores it in the extracted_text field.
 *
 * Body: { document_id: string }
 */

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const user = await base44.auth.me();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  if (!body.document_id) {
    return Response.json({ error: 'document_id required' }, { status: 400 });
  }

  const db = base44.asServiceRole;
  const docs = await db.entities.CrabDocument.filter({ id: body.document_id });
  const doc = docs[0];

  if (!doc) {
    return Response.json({ error: 'Document not found' }, { status: 404 });
  }

  if (!doc.file_url) {
    return Response.json({ error: 'No file URL on document' }, { status: 400 });
  }

  const ext = (doc.file_type || '').toLowerCase();
  const isVisual = ['pdf', 'jpg', 'jpeg', 'png', 'heic', 'webp'].includes(ext);

  if (!isVisual) {
    return Response.json({ error: 'File type not supported for text extraction' }, { status: 400 });
  }

  const result = await db.integrations.Core.InvokeLLM({
    prompt: `Extract ALL text content from this document verbatim. Include every word, number, date, address, and label you can read. Do not summarise — output the raw text as it appears in the document. Preserve line breaks with newlines where meaningful.`,
    file_urls: [doc.file_url],
    response_json_schema: {
      type: 'object',
      properties: {
        extracted_text: { type: 'string' },
      },
    },
  });

  const text = result.extracted_text || '';
  await db.entities.CrabDocument.update(doc.id, { extracted_text: text });

  console.log(`✅ Extracted ${text.length} chars from doc ${doc.id}`);

  return Response.json({ document_id: doc.id, chars_extracted: text.length, success: true });
});