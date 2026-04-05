import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();

  if (!user || user.role !== 'admin') {
    return Response.json({ error: 'Admin access required' }, { status: 403 });
  }

  // Move all completed documents back to review queue
  const completed = await base44.entities.Document.filter({ processing_status: 'completed', is_deleted: false });
  
  await Promise.all(
    completed.map(doc => 
      base44.entities.Document.update(doc.id, { processing_status: 'needs_review' })
    )
  );

  return Response.json({ 
    message: `Moved ${completed.length} document(s) from completed to review queue`,
    count: completed.length 
  });
});