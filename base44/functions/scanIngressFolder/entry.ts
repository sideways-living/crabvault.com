import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const SUPPORTED = ['.pdf', '.docx', '.xlsx', '.pptx', '.txt', '.jpg', '.jpeg', '.png'];

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405 });
  }

  const apiKey = req.headers.get('x-api-key');
  if (apiKey !== Deno.env.get('INGEST_API_KEY')) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const base44 = createClientFromRequest(req);
  const db = base44.asServiceRole;

  const body = await req.json();
  const { files } = body; // array of { name, size_bytes, modified_iso }

  if (!files || !Array.isArray(files)) {
    return Response.json({ error: 'Missing files array' }, { status: 400 });
  }

  // Filter to supported extensions only
  const supportedFiles = files.filter(f => {
    const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase();
    return SUPPORTED.includes(ext);
  });

  // Fetch all documents from DB (paginated)
  const allDocs = [];
  const pageSize = 200;
  let skip = 0;
  while (true) {
    const page = await db.entities.Document.filter({}, '-created_date', pageSize, skip);
    allDocs.push(...page);
    if (page.length < pageSize) break;
    skip += pageSize;
    await new Promise(r => setTimeout(r, 300));
  }

  // Build lookup by original_filename (lowercase)
  const docsByFilename = new Map();
  for (const doc of allDocs) {
    if (doc.original_filename) {
      const key = doc.original_filename.toLowerCase();
      if (!docsByFilename.has(key)) docsByFilename.set(key, []);
      docsByFilename.get(key).push(doc);
    }
  }

  // Categorise each ingress file
  const missing = [];
  const found = [];
  const duplicates = [];
  const unsupported = files.filter(f => {
    const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase();
    return !SUPPORTED.includes(ext);
  });

  for (const file of supportedFiles) {
    const key = file.name.toLowerCase();
    const matches = docsByFilename.get(key) || [];
    if (matches.length === 0) {
      missing.push(file);
    } else if (matches.length > 1) {
      duplicates.push({ file, docs: matches });
    } else {
      found.push({ file, doc: matches[0] });
    }
  }

  // Save a snapshot to DB for the UI to read
  const now = new Date().toISOString();
  const existingSnapshots = await db.entities.IngressScan.filter({});
  if (existingSnapshots.length > 0) {
    await db.entities.IngressScan.update(existingSnapshots[0].id, {
      scanned_at: now,
      total_ingress: files.length,
      total_supported: supportedFiles.length,
      total_missing: missing.length,
      total_found: found.length,
      total_duplicates: duplicates.length,
      total_unsupported: unsupported.length,
      missing_files: missing,
      duplicate_files: duplicates.map(d => ({ file: d.file, doc_ids: d.docs.map(x => x.id), doc_statuses: d.docs.map(x => x.processing_status) })),
      found_files: found.map(f => ({ name: f.file.name, doc_id: f.doc.id, status: f.doc.processing_status })),
    });
  } else {
    await db.entities.IngressScan.create({
      scanned_at: now,
      total_ingress: files.length,
      total_supported: supportedFiles.length,
      total_missing: missing.length,
      total_found: found.length,
      total_duplicates: duplicates.length,
      total_unsupported: unsupported.length,
      missing_files: missing,
      duplicate_files: duplicates.map(d => ({ file: d.file, doc_ids: d.docs.map(x => x.id), doc_statuses: d.docs.map(x => x.processing_status) })),
      found_files: found.map(f => ({ name: f.file.name, doc_id: f.doc.id, status: f.doc.processing_status })),
    });
  }

  return Response.json({
    success: true,
    scanned_at: now,
    total_ingress: files.length,
    total_supported: supportedFiles.length,
    total_missing: missing.length,
    total_found: found.length,
    total_duplicates: duplicates.length,
    total_unsupported: unsupported.length,
    missing_files: missing,
  });
});