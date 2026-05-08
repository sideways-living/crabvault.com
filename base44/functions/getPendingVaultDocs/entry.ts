import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const apiKey = req.headers.get('x-api-key');
  if (!apiKey || apiKey !== Deno.env.get('INGEST_API_KEY')) {
    return Response.json({ documents: [] }, { status: 200 });
  }

  const base44 = createClientFromRequest(req);
  const db = base44.asServiceRole;

  const [docs, folders, crabDocs] = await Promise.all([
    db.entities.Document.filter({ processing_status: 'completed', synced_to_vault: false }),
    db.entities.Folder.list(),
    db.entities.CrabDocument.filter({ synced_to_vault: false, is_deleted: false }),
  ]);

  const folderMap = Object.fromEntries(folders.map(f => [f.id, f]));

  function getFolderPath(folderId) {
    const parts = [];
    let current = folderMap[folderId];
    while (current) {
      parts.unshift(current.name);
      current = current.parent_folder_id ? folderMap[current.parent_folder_id] : null;
    }
    return parts.length ? '/' + parts.join('/') : '';
  }

  const documents = [];

  // Regular Documents — already filtered to completed + not synced
  for (const d of docs) {
    if (d.is_deleted || !d.file_url) continue;
    const folderPath = d.folder_id ? getFolderPath(d.folder_id) : '';
    documents.push({
      id: d.id,
      source: 'document',
      title: d.title,
      original_filename: d.original_filename,
      file_url: d.file_url,
      file_type: d.file_type,
      folder_path: folderPath,
      needs_move: false,
      old_vault_path: null,
    });
  }

  // CrabDocuments — vault_path is the full relative path (e.g. /crabs/John SMITH/documents/file.pdf)
  for (const d of crabDocs) {
    if (!d.file_url) continue;

    // Derive folder from vault_path (strip the filename)
    const vp = (d.vault_path || '').replace(/\\/g, '/');
    const folderPath = vp.includes('/') ? vp.substring(0, vp.lastIndexOf('/')) : '';

    documents.push({
      id: d.id,
      source: 'crab_document',
      title: d.title,
      original_filename: d.original_filename,
      file_url: d.file_url,
      file_type: d.file_type,
      folder_path: folderPath,
      needs_move: false,
      old_vault_path: null,
    });
  }

  console.log(`📦  Returning ${documents.length} doc(s) for vault sync (${crabDocs.length} crab, ${docs.length} regular)`);
  return Response.json({ documents });
});