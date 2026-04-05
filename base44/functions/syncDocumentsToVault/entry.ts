import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { vaultPath } = await req.json();
    if (!vaultPath) {
      return Response.json({ error: 'vaultPath required' }, { status: 400 });
    }

    // Check if vault is mounted/accessible
    try {
      await Deno.stat(vaultPath);
    } catch (err) {
      return Response.json({
        error: 'Cryptomator vault not connected',
        vaultPath,
        guidance: 'Please mount your Cryptomator vault and ensure the path is correct. Steps: 1) Open Cryptomator 2) Unlock your vault 3) Check that the mount path matches the configured vault path',
        mounted: false
      }, { status: 503 });
    }

    // Fetch all completed, non-deleted documents that haven't been synced yet
    const docs = await base44.entities.Document.filter({
      processing_status: 'completed',
      is_deleted: false,
      synced_to_vault: false
    }, '-created_date', 100);

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
        const fullVaultPath = `${vaultPath}/${doc.vault_path}`;
        
        // Download file from cloud storage
        const fileResponse = await fetch(doc.file_url);
        if (!fileResponse.ok) {
          failed.push({ id: doc.id, reason: 'Failed to download file' });
          continue;
        }

        const fileBuffer = await fileResponse.arrayBuffer();

        // Write to local Cryptomator vault
        // Note: This assumes the vault is mounted locally via Cryptomator
        // In production, you'd use a mounted volume or API to write to the vault
        await Deno.mkdir(`${fullVaultPath}`, { recursive: true });
        const filename = doc.original_filename || doc.title;
        await Deno.writeFile(`${fullVaultPath}/${filename}`, new Uint8Array(fileBuffer));

        // Mark document as synced
        await base44.entities.Document.update(doc.id, { synced_to_vault: true });
        synced.push(doc.id);
      } catch (err) {
        console.error(`Sync failed for doc ${doc.id}:`, err.message);
        failed.push({ id: doc.id, reason: err.message });
      }
    }

    return Response.json({
      success: true,
      synced: synced.length,
      failed: failed.length,
      failed_docs: failed
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});