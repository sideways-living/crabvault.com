import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Processes pending CrabDocument records using AI.
 * Picks up documents with processing_status = 'pending' and runs AI analysis
 * to extract title, category, document date, and summary.
 * Sets status to 'needs_review' when done so user can confirm.
 */

async function processDoc(db, doc) {
  console.log(`🔄 Processing CrabDocument: ${doc.id} — ${doc.title}`);

  await db.entities.CrabDocument.update(doc.id, { processing_status: 'processing' });

  const fileUrl = doc.file_url || null;
  const ext = (doc.file_type || '').toLowerCase();
  const isVisual = fileUrl && ['pdf', 'jpg', 'jpeg', 'png', 'heic', 'webp'].includes(ext);

  // Fetch linked crab names for context
  let crabContext = '';
  if (doc.crab_ids?.length) {
    const crabs = await db.entities.Crab.filter({ id: doc.crab_ids[0] });
    if (crabs[0]) {
      crabContext = `\nThis document belongs to: ${crabs[0].full_name || crabs[0].surname}`;
    }
  }

  const result = await db.integrations.Core.InvokeLLM({
    prompt: `You are analysing a document from a case file / intelligence vault. Extract key metadata.
${crabContext}

Document filename: ${doc.original_filename || doc.title}
Current title: ${doc.title}

Please analyse this document and return structured data:
- suggested_title: A clean, descriptive title. Format: "YYYY-MM-DD - Description" if you can identify a date, otherwise just a clean description. Keep it concise.
- summary: 2-3 sentence summary of what this document is and its key details.
- category: One of: correspondence, evidence, receipt, id, legal, medical, financial, other
- document_date: The date of the document in YYYY-MM-DD format if identifiable, otherwise null.
- tags: Array of relevant keyword tags (e.g. ["passport", "identity", "uk"])

Be precise. If this is an ID document, include the ID type. If it's correspondence, note who it's from/to.`,
    file_urls: isVisual ? [fileUrl] : undefined,
    response_json_schema: {
      type: 'object',
      properties: {
        suggested_title: { type: 'string' },
        summary: { type: 'string' },
        category: { type: 'string' },
        document_date: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
      },
    },
  });

  await db.entities.CrabDocument.update(doc.id, {
    title: result.suggested_title || doc.title,
    summary: result.summary || '',
    category: result.category || doc.category || 'other',
    document_date: result.document_date || doc.document_date || null,
    tags: result.tags || [],
    processing_status: 'needs_review',
  });

  console.log(`✅ Processed: ${doc.id} → "${result.suggested_title}"`);
  return { documentId: doc.id, title: result.suggested_title, success: true };
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
  } catch {
    // Scheduled automation — allow through
  }

  const db = base44.asServiceRole;

  const body = await req.json().catch(() => ({}));

  // If a specific document_id is provided, process just that one
  if (body.document_id) {
    const docs = await db.entities.CrabDocument.filter({ id: body.document_id });
    if (!docs[0]) {
      return Response.json({ error: 'Document not found' }, { status: 404 });
    }
    const result = await processDoc(db, docs[0]);
    return Response.json({ processed: 1, results: [result] });
  }

  // Otherwise pick up to 5 pending documents
  const pending = await db.entities.CrabDocument.filter({ processing_status: 'pending' }, 'created_date', 5);

  if (pending.length === 0) {
    return Response.json({ message: 'No pending CrabDocuments', processed: 0 });
  }

  const results = [];
  for (const doc of pending) {
    results.push(await processDoc(db, doc));
  }

  return Response.json({ message: `Processed ${results.length} document(s)`, results });
});