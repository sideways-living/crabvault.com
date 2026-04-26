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

  // Parse filename for document type hints
  const filename = (doc.original_filename || doc.title || '').toLowerCase();
  const categoryHints = {
    'medicare': 'Medicare Card',
    'driving': 'Drivers Licence',
    'passport': 'Passport',
    'birth': 'Birth Certificate',
    'license': 'Drivers Licence',
    'licence': 'Drivers Licence',
  };
  
  let categoryHint = null;
  for (const [keyword, cat] of Object.entries(categoryHints)) {
    if (filename.includes(keyword)) {
      categoryHint = cat;
      break;
    }
  }

  // Detect if filename suggests both sides (e.g., "both", "front and back", "both sides")
  const bothSidesHint = /both|both.?sides|front.?and.?back/.test(filename);

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
${categoryHint ? `⚠️  FILENAME STRONGLY INDICATES THIS IS A: ${categoryHint} — Use this as primary classification.` : ''}
${bothSidesHint ? `⚠️  FILENAME INDICATES BOTH SIDES: Set id_card_side to "both"` : ''}

CRITICAL: Trust the filename hints above. If filename indicates Medicare Card, Drivers Licence, Passport, or Birth Certificate, classify it as such.

Please analyse this document and return structured data:
- suggested_title: A clean, descriptive title. For ID documents with both sides, note "(both sides)". Format: "YYYY-MM-DD - Description" if you can identify a date, otherwise just a clean description. Keep it concise.
- summary: 2-3 sentence summary of what this document is and its key details.
- category: One of: correspondence, evidence, receipt, Medicare Card, Drivers Licence, Passport, Birth Certificate, id, legal, medical, financial, Pay Slip, other. PRIORITIZE filename hints.
- id_card_side: If this is an ID document, specify "front", "back", or "both" based on the document content or filename hints. Otherwise null. If filename hints at "both", use "both".
- is_payslip: Boolean - true if this is a payslip/pay advice/salary statement
- pay_period_end_date: If payslip, the end date of the pay period in YYYY-MM-DD format, otherwise null
- pay_date: If payslip, the actual pay/payment date in YYYY-MM-DD format, otherwise null
- document_date: The date of the document in YYYY-MM-DD format if identifiable, otherwise null. For payslips, use the later of pay_date or pay_period_end_date.
- tags: Array of relevant keyword tags (e.g. ["passport", "identity", "medicare"])

MOST IMPORTANT: If the filename strongly indicates a specific document type (Medicare, Passport, Drivers Licence, Birth Certificate), use that as the category even if the visual analysis is unclear.`,
    file_urls: isVisual ? [fileUrl] : undefined,
    response_json_schema: {
      type: 'object',
      properties: {
        suggested_title: { type: 'string' },
        summary: { type: 'string' },
        category: { type: 'string' },
        id_card_side: { type: ['string', 'null'] },
        is_payslip: { type: 'boolean' },
        pay_period_end_date: { type: ['string', 'null'] },
        pay_date: { type: ['string', 'null'] },
        document_date: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
      },
    },
  });

  // For payslips, force category to "Pay Slip" and ensure document_date uses the correct logic
  let finalCategory = result.category || doc.category || 'other';
  let finalDocDate = result.document_date || doc.document_date || null;
  let finalIdCardSide = result.id_card_side || null;
  
  if (result.is_payslip) {
    finalCategory = 'Pay Slip';
    // Use the later of pay_period_end_date or pay_date for document_date
    if (result.pay_period_end_date && result.pay_date) {
      finalDocDate = result.pay_period_end_date > result.pay_date ? result.pay_period_end_date : result.pay_date;
    } else if (result.pay_period_end_date) {
      finalDocDate = result.pay_period_end_date;
    } else if (result.pay_date) {
      finalDocDate = result.pay_date;
    }
  }
  
  const updatePayload = {
    title: result.suggested_title || doc.title,
    summary: result.summary || '',
    category: finalCategory,
    document_date: finalDocDate,
    tags: result.tags || [],
    processing_status: 'needs_review',
  };

  // Only set id_card_side if category is "id" and side was detected
  if (finalCategory === 'id' && finalIdCardSide) {
    updatePayload.id_card_side = finalIdCardSide;
  }

  await db.entities.CrabDocument.update(doc.id, updatePayload);

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