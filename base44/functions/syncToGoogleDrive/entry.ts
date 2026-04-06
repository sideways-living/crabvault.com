import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const VAULT_ROOT_FOLDER_ID = Deno.env.get('GDRIVE_VAULT_FOLDER_ID');

// Find or create a Drive folder by name under a parent folder ID
// Caches the result back on the Folder entity to avoid repeated API calls
async function getOrCreateDriveFolder(name, parentDriveFolderId, accessToken) {
  // Search for existing folder with this name under the parent
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
      `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentDriveFolderId}' in parents and trashed=false`
    )}&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const searchData = await searchRes.json();
  if (searchData.files?.length > 0) {
    return searchData.files[0].id;
  }

  // Create the folder
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentDriveFolderId],
    }),
  });
  const created = await createRes.json();
  return created.id;
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
  } catch {
    // Called from automation — allow via service role
  }

  const db = base44.asServiceRole;
  const body = await req.json();
  const documentId = body.documentId || body.event?.entity_id || body.data?.id;

  if (!documentId) {
    return Response.json({ error: 'documentId required' }, { status: 400 });
  }

  if (!VAULT_ROOT_FOLDER_ID) {
    return Response.json({ error: 'GDRIVE_VAULT_FOLDER_ID secret not set' }, { status: 500 });
  }

  const docs = await db.entities.Document.filter({ id: documentId });
  if (!docs.length) {
    return Response.json({ error: 'Document not found' }, { status: 404 });
  }
  const doc = docs[0];

  if (!doc.file_url) {
    return Response.json({ error: 'Document has no file_url' }, { status: 400 });
  }

  if (doc.synced_to_vault) {
    return Response.json({ message: 'Already synced', synced: false });
  }

  const { accessToken } = await db.connectors.getConnection('googledrive');

  // Determine target filename
  const filename = doc.title
    ? `${doc.title}.${doc.file_type || 'pdf'}`
    : (doc.original_filename || `${doc.id}.pdf`);

  // Walk folder hierarchy to get/create Drive folder chain
  let targetDriveFolderId = VAULT_ROOT_FOLDER_ID;

  if (doc.folder_id) {
    const allFolders = await db.entities.Folder.list();

    // Build ancestor chain from root → current folder
    const chain = [];
    let current = allFolders.find(f => f.id === doc.folder_id);
    while (current) {
      chain.unshift(current);
      current = current.parent_folder_id
        ? allFolders.find(f => f.id === current.parent_folder_id)
        : null;
    }

    // Walk chain, creating Drive folders as needed, caching drive_folder_id
    let parentDriveId = VAULT_ROOT_FOLDER_ID;
    for (const folder of chain) {
      if (folder.drive_folder_id) {
        parentDriveId = folder.drive_folder_id;
      } else {
        const driveId = await getOrCreateDriveFolder(folder.name, parentDriveId, accessToken);
        await db.entities.Folder.update(folder.id, { drive_folder_id: driveId });
        parentDriveId = driveId;
      }
    }
    targetDriveFolderId = parentDriveId;
  }

  // Download file from Base44 storage
  const fileRes = await fetch(doc.file_url);
  if (!fileRes.ok) {
    return Response.json({ error: 'Failed to download file from storage' }, { status: 500 });
  }
  const fileBuffer = await fileRes.arrayBuffer();

  const mimeType = doc.file_type === 'pdf' ? 'application/pdf'
    : doc.file_type === 'jpg' || doc.file_type === 'jpeg' ? 'image/jpeg'
    : doc.file_type === 'png' ? 'image/png'
    : 'application/octet-stream';

  // Upload to Google Drive (multipart)
  const boundary = '-------314159265358979323846';
  const metadata = JSON.stringify({ name: filename, parents: [targetDriveFolderId] });
  const metaPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`;
  const filePart = `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`;
  const endPart = `\r\n--${boundary}--`;

  const metaBytes = new TextEncoder().encode(metaPart);
  const filePartBytes = new TextEncoder().encode(filePart);
  const endBytes = new TextEncoder().encode(endPart);
  const fileBytes = new Uint8Array(fileBuffer);

  const body2 = new Uint8Array(metaBytes.length + filePartBytes.length + fileBytes.length + endBytes.length);
  let offset = 0;
  body2.set(metaBytes, offset); offset += metaBytes.length;
  body2.set(filePartBytes, offset); offset += filePartBytes.length;
  body2.set(fileBytes, offset); offset += fileBytes.length;
  body2.set(endBytes, offset);

  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: body2,
    }
  );

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    return Response.json({ error: `Drive upload failed: ${err}` }, { status: 500 });
  }

  const uploaded = await uploadRes.json();

  // Mark document as synced
  await db.entities.Document.update(doc.id, {
    synced_to_vault: true,
    vault_path: uploaded.webViewLink || uploaded.id,
  });

  return Response.json({
    success: true,
    driveFileId: uploaded.id,
    filename,
    webViewLink: uploaded.webViewLink,
  });
});