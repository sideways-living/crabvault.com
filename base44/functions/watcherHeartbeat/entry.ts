import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405 });
  }

  // Validate API key (same key as ingest)
  const apiKey = req.headers.get('x-api-key');
  if (apiKey !== Deno.env.get('INGEST_API_KEY')) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // createClientFromRequest + asServiceRole works for external (non-user) requests
  // because the app ID is injected via the BASE44_APP_ID env var at runtime
  const base44 = createClientFromRequest(req);
  const db = base44.asServiceRole;

  const body = await req.json();
  const { watcher_type, version, details } = body;

  if (!watcher_type) {
    return Response.json({ error: 'Missing watcher_type' }, { status: 400 });
  }

  try {
    const existing = await db.entities.WatcherStatus.filter({ watcher_type });
    const now = new Date().toISOString();

    if (existing.length > 0) {
      await db.entities.WatcherStatus.update(existing[0].id, {
        last_heartbeat: now,
        status: 'running',
        version: version || existing[0].version,
        details: details || existing[0].details,
      });
    } else {
      await db.entities.WatcherStatus.create({
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