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

  // Pre-creation dedup (handles restarts but not race conditions)
  const existing = await db.entities.Document.filter({ original_filename: filename });
  const active = existing.filter(d =>
    !['completed', 'failed'].includes(d.processing_status) && !d.is_deleted
  );
  if (active.length > 0) {
    console.log(`⚠️  Duplicate rejected: ${filename} already exists as ${active[0].processing_status}`);
    return Response.json({ success: true, document_id: active[0].id, filename, duplicate: true });
  }

  // Upload the file
  const { file_url } = await db.integrations.Core.UploadFile({ file });

  const doc = await db.entities.Document.create({
    title: filename.replace(/\.[^/.]+$/, ''),
    file_url,
    original_filename: filename,
    file_type: fileType,
    processing_status: 'pending',
  });

  // Post-creation dedup: handle race conditions where multiple requests arrived simultaneously
  // Give a small window for concurrent requests to also create, then resolve
  await new Promise(r => setTimeout(r, 500));
  const postCheck = await db.entities.Document.filter({ original_filename: filename });
  const activeNow = postCheck
    .filter(d => !['completed', 'failed'].includes(d.processing_status) && !d.is_deleted)
    .sort((a, b) => new Date(a.created_date) - new Date(b.created_date)); // oldest first

  if (activeNow.length > 1) {
    // We're not the oldest — delete self and return the winner
    if (activeNow[0].id !== doc.id) {
      console.log(`⚠️  Race condition dedup: deleting ${doc.id}, keeping ${activeNow[0].id}`);
      await db.entities.Document.delete(doc.id);
      return Response.json({ success: true, document_id: activeNow[0].id, filename, duplicate: true });
    }
    // We're the oldest — delete the younger duplicates
    for (const dup of activeNow.slice(1)) {
      console.log(`⚠️  Race condition dedup: deleting younger duplicate ${dup.id}`);
      await db.entities.Document.delete(dup.id);
    }
  }

  return Response.json({ success: true, document_id: doc.id, filename });
});