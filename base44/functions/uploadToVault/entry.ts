import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { documentId, vaultPath, proposedPath } = await req.json();
    
    if (!documentId || !vaultPath) {
      return Response.json({ error: 'documentId and vaultPath required' }, { status: 400 });
    }

    // Fetch the document
    const doc = await base44.entities.Document.filter({ id: documentId });
    if (!doc.length) {
      return Response.json({ error: 'Document not found' }, { status: 404 });
    }
    const document = doc[0];

    // Check if vault is accessible
    try {
      await Deno.stat(vaultPath);
    } catch (err) {
      return Response.json({
        error: 'Cryptomator vault not connected',
        guidance: 'Please mount your Cryptomator vault and ensure the path is correct.'
      }, { status: 503 });
    }

    // Generate filename based on document type
    let filename = document.original_filename || document.title;
    
    if (document.ai_data?.is_receipt) {
      const ai = document.ai_data;
      const dateStr = ai.transaction_date || document.document_date || document.scan_date || '20000101';
      const storeName = ai.store_brand || 'Unknown';
      const location = ai.store_location || '';
      const txType = ai.transaction_type || 'purchase';
      
      const typeLabel = txType.charAt(0).toUpperCase() + txType.slice(1);
      const locationStr = location ? ` ${location}` : '';
      filename = `${dateStr} - ${storeName}${locationStr} - ${typeLabel} Receipt.pdf`;
    }

    // Build full path: DocVault -> folder field -> filename
    const docVaultBase = `${vaultPath}/DocVault`;
    const folderPath = proposedPath ? `${docVaultBase}/${proposedPath}` : docVaultBase;
    
    // Handle duplicate filenames
    let finalPath = `${folderPath}/${filename}`;
    let counter = 1;
    const baseNameWithoutExt = filename.replace(/\.[^/.]+$/, '');
    const ext = filename.match(/\.[^/.]+$/)?.[0] || '';
    
    try {
      await Deno.stat(finalPath);
      // File exists, add counter
      while (true) {
        const newFilename = `${baseNameWithoutExt} (${counter})${ext}`;
        finalPath = `${folderPath}/${newFilename}`;
        try {
          await Deno.stat(finalPath);
          counter++;
        } catch {
          break; // Path doesn't exist, use this one
        }
      }
    } catch {
      // Path doesn't exist, use original
    }

    // Create directory structure
    await Deno.mkdir(folderPath, { recursive: true });

    // Download and write file
    const fileResponse = await fetch(document.file_url);
    if (!fileResponse.ok) {
      return Response.json({ error: 'Failed to download file' }, { status: 500 });
    }

    const fileBuffer = await fileResponse.arrayBuffer();
    await Deno.writeFile(finalPath, new Uint8Array(fileBuffer));

    // Update document with vault path and mark as synced
    const vaultPathRelative = finalPath.replace(vaultPath, '').replace(/^\//, '');
    await base44.entities.Document.update(documentId, {
      vault_path: vaultPathRelative,
      synced_to_vault: true
    });

    return Response.json({
      success: true,
      filename: filename,
      path: finalPath,
      relativePath: vaultPathRelative
    });
  } catch (error) {
    console.error('Upload error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});