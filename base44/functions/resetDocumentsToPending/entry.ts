import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Reset all documents that are not pending back to pending for initial processing
    const allDocs = await base44.entities.Document.list();
    const docsToReset = allDocs.filter(d => 
      d.processing_status !== 'pending' && 
      d.processing_status !== 'completed' && 
      !d.is_deleted
    );

    const resetCount = docsToReset.length;
    
    for (const doc of docsToReset) {
      await base44.entities.Document.update(doc.id, {
        processing_status: 'pending',
        ai_data: undefined,
        summary: undefined,
        extracted_text: undefined,
        vault_path: undefined,
        synced_to_vault: false
      });
    }

    return Response.json({
      success: true,
      reset: resetCount,
      message: `Reset ${resetCount} document(s) back to pending status`
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});