import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405 });
  }

  const base44 = createClientFromRequest(req);
  const body = await req.json();
  const { watcher_type, version, details } = body;

  if (!watcher_type) {
    return Response.json({ error: 'Missing watcher_type' }, { status: 400 });
  }

  try {
    const existing = await base44.asServiceRole.entities.WatcherStatus.filter({
      watcher_type,
    });

    const now = new Date().toISOString();

    if (existing.length > 0) {
      await base44.asServiceRole.entities.WatcherStatus.update(existing[0].id, {
        last_heartbeat: now,
        status: 'running',
        version: version || existing[0].version,
        details: details || existing[0].details,
      });
    } else {
      await base44.asServiceRole.entities.WatcherStatus.create({
        watcher_type,
        last_heartbeat: now,
        status: 'running',
        version,
        details,
      });
    }

    return Response.json({ success: true, timestamp: now });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});