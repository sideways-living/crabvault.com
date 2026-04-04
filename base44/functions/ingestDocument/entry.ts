import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  // Validate API key
  const apiKey = req.headers.get('x-api-key');
  if (apiKey !== Deno.env.get('INGEST_API_KEY')) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get('file');
  const filename = formData.get('filename') || file?.name || 'document';

  if (!file) {
    return Response.json({ error: 'No file provided' }, { status: 400 });
  }

  const base44 = createClientFromRequest(req);
  const db = base44.asServiceRole;

  // Upload the file
  const { file_url } = await db.integrations.Core.UploadFile({ file });

  const ext = filename.split('.').pop().toLowerCase();
  const fileType = ['pdf', 'docx', 'xlsx', 'pptx', 'txt', 'jpg', 'jpeg', 'png'].includes(ext) ? ext : 'other';

  // Create document record as pending (processQueuedDocuments will handle AI)
  const doc = await db.entities.Document.create({
    title: filename.replace(/\.[^/.]+$/, ''),
    file_url,
    original_filename: filename,
    file_type: fileType,
    processing_status: 'pending',
  });

  return Response.json({ success: true, document_id: doc.id, filename });
});