import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();

  if (user?.role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = base44.asServiceRole;

  // Get all completed docs from the last 2 hours
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const completed = await db.entities.Document.filter({
    processing_status: 'completed',
  }, '-created_date', 500);

  const recent = completed.filter(d => new Date(d.created_date) > new Date(twoHoursAgo));

  let reset = 0;
  for (const doc of recent) {
    await db.entities.Document.update(doc.id, { processing_status: 'pending' });
    reset++;
  }

  return Response.json({
    message: `Reset ${reset} recently completed document(s) back to pending`,
    reset,
  });
});