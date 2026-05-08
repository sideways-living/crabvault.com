import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const apiKey = req.headers.get('x-api-key');
  if (!apiKey || apiKey !== Deno.env.get('INGEST_API_KEY')) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { documentId, vaultFilePath, source } = await req.json();
  if (!documentId) {
    return Response.json({ error: 'documentId required' }, { status: 400 });
  }

  const base44 = createClientFromRequest(req);
  const db = base44.asServiceRole;

  const entity = source === 'crab_document' ? db.entities.CrabDocument : db.entities.Document;

  await entity.update(documentId, {
    synced_to_vault: true,
    vault_path: vaultFilePath || undefined,
  });

  return Response.json({ success: true });
});