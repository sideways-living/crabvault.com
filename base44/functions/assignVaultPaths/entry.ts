import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();

  if (user?.role !== 'admin') {
    return Response.json({ error: 'Forbidden: Admin only' }, { status: 403 });
  }

  const db = base44.asServiceRole;

  // Fetch all completed docs without vault paths
  const completed = await db.entities.Document.filter({
    processing_status: 'completed',
  }, '-created_date', 500);

  const noVaultPath = completed.filter(d => !d.vault_path);

  if (noVaultPath.length === 0) {
    return Response.json({ message: 'All completed documents already have vault paths', updated: 0 });
  }

  // Fetch folders for path lookup
  const folders = await db.entities.Folder.list();

  let updated = 0;

  for (const doc of noVaultPath) {
    let vaultPath = null;

    if (doc.folder_id) {
      const folder = folders.find(f => f.id === doc.folder_id);
      if (folder?.vault_path) {
        const ext = doc.original_filename ? doc.original_filename.split('.').pop() : (doc.file_type || 'pdf');
        const filename = doc.title || doc.original_filename || doc.id;
        vaultPath = `${folder.vault_path}/${filename}.${ext}`;
      }
    }

    // Always assign a path, even without a folder
    if (!vaultPath) {
      const ext = doc.original_filename ? doc.original_filename.split('.').pop() : (doc.file_type || 'pdf');
      const filename = doc.title || doc.original_filename || doc.id;
      vaultPath = `/${filename}.${ext}`;
    }

    // Update document
    await db.entities.Document.update(doc.id, { vault_path: vaultPath });
    updated++;
  }

  return Response.json({
    message: `Assigned vault paths to ${updated} document(s)`,
    updated,
    skipped: 0,
  });
});