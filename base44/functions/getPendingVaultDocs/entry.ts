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

  // Only docs not yet synced that have a file_url
  const pending = docs.filter(d => !d.synced_to_vault && d.file_url && !d.is_deleted);

  // Build folder id → path map
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

  const documents = pending.map(d => ({
    id: d.id,
    title: d.title,
    original_filename: d.original_filename,
    file_url: d.file_url,
    file_type: d.file_type,
    folder_path: d.folder_id ? getFolderPath(d.folder_id) : '',
  }));

  return Response.json({ documents });
});