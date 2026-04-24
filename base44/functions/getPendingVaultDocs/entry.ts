import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  // Validate API key (same key used by the watcher)
  const apiKey = req.headers.get('x-api-key');
  if (!apiKey || apiKey !== Deno.env.get('INGEST_API_KEY')) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const base44 = createClientFromRequest(req);
  const db = base44.asServiceRole;

  const [docs, folders, crabDocs] = await Promise.all([
    db.entities.Document.filter({ processing_status: 'completed' }),
    db.entities.Folder.list(),
    db.entities.CrabDocument.filter({ processing_status: 'completed' }),
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

  // Regular Documents
  for (const d of docs) {
    if (d.is_deleted || !d.file_url) continue;

    const currentFolderPath = d.folder_id ? getFolderPath(d.folder_id) : '';

    if (!d.synced_to_vault) {
      documents.push({
        id: d.id,
        source: 'document',
        title: d.title,
        original_filename: d.original_filename,
        file_url: d.file_url,
        file_type: d.file_type,
        folder_path: currentFolderPath,
        needs_move: false,
        old_vault_path: null,
      });
    } else if (d.vault_path) {
      const normalizedVaultPath = d.vault_path.replace(/\\/g, '/').replace(/^\//, '');
      const vaultParts = normalizedVaultPath.split('/');
      const vaultDirParts = vaultParts.slice(0, -1);
      const vaultDir = vaultDirParts.length ? '/' + vaultDirParts.join('/') : '';
      const normalizedCurrentDir = currentFolderPath.replace(/\/+$/, '');

      if (vaultDir !== normalizedCurrentDir) {
        documents.push({
          id: d.id,
          source: 'document',
          title: d.title,
          original_filename: d.original_filename,
          file_url: d.file_url,
          file_type: d.file_type,
          folder_path: currentFolderPath,
          needs_move: true,
          old_vault_path: d.vault_path,
        });
      }
    }
  }

  // CrabDocuments — vault_path is already the full relative path (e.g. /documents/SMITH John/file.pdf)
  for (const d of crabDocs) {
    if (d.is_deleted || !d.file_url || d.synced_to_vault) continue;

    // Use vault_path as folder_path (strip filename to get directory)
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

  return Response.json({ documents });
});