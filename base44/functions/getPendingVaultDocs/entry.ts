import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  // Validate API key (same key used by the watcher)
  const apiKey = req.headers.get('x-api-key');
  if (!apiKey || apiKey !== Deno.env.get('INGEST_API_KEY')) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const base44 = createClientFromRequest(req);
  const db = base44.asServiceRole;

  const [docs, folders] = await Promise.all([
    db.entities.Document.filter({ processing_status: 'completed' }),
    db.entities.Folder.list(),
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

  for (const d of docs) {
    if (d.is_deleted || !d.file_url) continue;

    const currentFolderPath = d.folder_id ? getFolderPath(d.folder_id) : '';

    if (!d.synced_to_vault) {
      // Not yet synced — normal pending
      documents.push({
        id: d.id,
        title: d.title,
        original_filename: d.original_filename,
        file_url: d.file_url,
        file_type: d.file_type,
        folder_path: currentFolderPath,
        needs_move: false,
        old_vault_path: null,
      });
    } else if (d.vault_path) {
      // Already synced — check if folder has changed
      // vault_path is relative like "Receipts/Woolworths/file.pdf"
      const vaultDir = d.vault_path.includes('/') || d.vault_path.includes('\\')
        ? '/' + d.vault_path.replace(/\\/g, '/').split('/').slice(0, -1).join('/')
        : '';
      const normalizedVaultDir = vaultDir.replace(/\/+$/, '');
      const normalizedCurrentDir = currentFolderPath.replace(/\/+$/, '');

      if (normalizedVaultDir !== normalizedCurrentDir) {
        documents.push({
          id: d.id,
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

  return Response.json({ documents });
});