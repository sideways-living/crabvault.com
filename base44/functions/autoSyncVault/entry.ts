import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();

  if (user?.role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = base44.asServiceRole;

  // Get vault path from environment or settings
  const vaultPath = Deno.env.get('VAULT_PATH') || 'F:\\';
  
  // Check if vault is mounted/accessible
  try {
    await Deno.stat(vaultPath);
  } catch (err) {
    return Response.json({
      error: 'Cryptomator vault not connected',
      vaultPath,
      details: err.message
    }, { status: 503 });
  }

  // Fetch all completed, non-deleted documents that haven't been synced yet
  const docs = await db.entities.Document.filter({
    processing_status: 'completed',
    is_deleted: false,
    synced_to_vault: false
  }, '-created_date', 10);

  if (docs.length === 0) {
    return Response.json({ success: true, synced: 0, message: 'No documents to sync' });
  }

  const synced = [];
  const failed = [];

  for (const doc of docs) {
    try {
      if (!doc.vault_path || !doc.file_url) {
        failed.push({ id: doc.id, reason: 'Missing vault_path or file_url' });
        continue;
      }

      // Construct full vault file path
      const fullVaultPath = `${vaultPath}${doc.vault_path.startsWith('/') ? '' : '/'}${doc.vault_path}`;
      
      // Download file from cloud storage
      const fileResponse = await fetch(doc.file_url);
      if (!fileResponse.ok) {
        failed.push({ id: doc.id, reason: 'Failed to download file' });
        continue;
      }

      const fileBuffer = await fileResponse.arrayBuffer();

      // Create directory structure if needed
      const lastSlash = Math.max(fullVaultPath.lastIndexOf('/'), fullVaultPath.lastIndexOf('\\'));
      const dirPath = fullVaultPath.substring(0, lastSlash);
      await Deno.mkdir(dirPath, { recursive: true });
      
      // Write file to vault
      await Deno.writeFile(fullVaultPath, new Uint8Array(fileBuffer));

      // Mark document as synced
      await db.entities.Document.update(doc.id, { synced_to_vault: true });
      synced.push(doc.id);
      console.log(`Synced ${doc.id} to ${fullVaultPath}`);
    } catch (err) {
      console.error(`Sync failed for doc ${doc.id}:`, err.message);
      failed.push({ id: doc.id, reason: err.message });
    }
  }

  return Response.json({
    success: true,
    synced: synced.length,
    failed: failed.length,
    failed_docs: failed.slice(0, 5) // Return first 5 failures only
  });
});