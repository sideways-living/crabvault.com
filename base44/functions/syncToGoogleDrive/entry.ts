import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
  } catch {
    // Automation call — use service role
  }

  const db = base44.asServiceRole;

  // Fetch completed docs that have been synced to vault but not yet uploaded to Drive
  const docs = await db.entities.Document.filter({
    processing_status: 'completed',
    synced_to_vault: true,
  }, '-updated_date', 10);

  if (docs.length === 0) {
    return Response.json({ success: true, uploaded: 0, message: 'No documents to sync to Drive' });
  }

  const { accessToken } = await db.asServiceRole.connectors.getConnection('googledrive');
  const vaultFolderId = Deno.env.get('GDRIVE_VAULT_FOLDER_ID');

  if (!vaultFolderId) {
    return Response.json({
      error: 'GDRIVE_VAULT_FOLDER_ID not configured',
      details: 'Set the Google Drive folder ID in app secrets'
    }, { status: 500 });
  }

  const uploaded = [];
  const failed = [];

  for (const doc of docs) {
    try {
      if (!doc.file_url) {
        failed.push({ id: doc.id, reason: 'No file_url' });
        continue;
      }

      // Download file
      const fileRes = await fetch(doc.file_url);
      if (!fileRes.ok) {
        failed.push({ id: doc.id, reason: 'Download failed' });
        continue;
      }

      const fileBuffer = await fileRes.arrayBuffer();
      const filename = doc.title || doc.original_filename || `doc-${doc.id}`;

      // Upload to Google Drive
      const formData = new FormData();
      formData.append('metadata', JSON.stringify({
        name: filename,
        parents: [vaultFolderId],
        mimeType: 'application/octet-stream'
      }));
      formData.append('file', new Blob([fileBuffer], { type: 'application/octet-stream' }), filename);

      const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}` },
        body: formData,
      });

      if (!uploadRes.ok) {
        failed.push({ id: doc.id, reason: `Drive upload failed: ${uploadRes.status}` });
        continue;
      }

      uploaded.push(doc.id);
      console.log(`Uploaded ${filename} to Google Drive`);
    } catch (err) {
      console.error(`Sync failed for ${doc.id}:`, err.message);
      failed.push({ id: doc.id, reason: err.message });
    }
  }

  return Response.json({
    success: true,
    uploaded: uploaded.length,
    failed: failed.length,
    failed_docs: failed.slice(0, 5)
  });
});