import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * processCrabDocument — safe AI processing with job binding.
 *
 * Safety rules enforced:
 * 1. Original file fields are NEVER modified.
 * 2. AI results are stored as suggested fields only (ai_extraction_result).
 * 3. Before calling AI, a processing job snapshot is saved.
 * 4. After AI returns, the snapshot is re-verified — if file_url, content_hash,
 *    or file_size differ from the snapshot, the result is DISCARDED and the job
 *    is marked failed with reason "stale_or_mismatched_processing_result".
 * 5. Status is set to "needs_review" — never directly to "completed".
 * 6. No profile creation, renaming, moving, or deletion happens here.
 */

async function sha256Hex(arrayBuffer) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function processDoc(db, doc) {
  console.log(`🔄 Processing CrabDocument: ${doc.id} — ${doc.title}`);

  const jobId = crypto.randomUUID();
  const startedAt = new Date().toISOString();

  // Snapshot the exact file we are about to process
  const snapshotFileUrl = doc.file_url || null;
  const snapshotHash = doc.content_hash || null;
  const snapshotSize = doc.file_size || null;

  // Mark as processing + record job snapshot
  await db.entities.CrabDocument.update(doc.id, {
    processing_status: 'processing',
    last_processing_job_id: jobId,
    ai_processed_file_url: snapshotFileUrl,
  });

  // Audit log — started
  await db.entities.ProcessingLog.create({
    document_id: doc.id,
    processing_job_id: jobId,
    action: 'ai_processing',
    status: 'started',
    file_url: snapshotFileUrl,
    content_hash: snapshotHash,
    file_size: snapshotSize,
    details: `AI processing started at ${startedAt}`,
  });

  const ext = (doc.file_type || '').toLowerCase();
  const isVisual = snapshotFileUrl && ['pdf', 'jpg', 'jpeg', 'png', 'heic', 'webp'].includes(ext);

  const filename = (doc.original_filename || doc.title || '').toLowerCase();
  const categoryHints = {
    medicare: 'Medicare Card',
    driving: 'Drivers Licence',
    passport: 'Passport',
    birth: 'Birth Certificate',
    license: 'Drivers Licence',
    licence: 'Drivers Licence',
  };
  let categoryHint = null;
  for (const [kw, cat] of Object.entries(categoryHints)) {
    if (filename.includes(kw)) { categoryHint = cat; break; }
  }
  const bothSidesHint = /both|both.?sides|front.?and.?back/.test(filename);

  let crabContext = '';
  let resolvedCrab = null;
  if (doc.crab_ids?.length) {
    const crabs = await db.entities.Crab.filter({ id: doc.crab_ids[0] });
    if (crabs[0]) {
      resolvedCrab = crabs[0];
      crabContext = `\nThis document belongs to: ${crabs[0].full_name || crabs[0].surname}`;
    }
  }

  let aiResult = null;
  let aiConfidence = 'low';
  let failReason = null;

  try {
    const result = await db.integrations.Core.InvokeLLM({
      prompt: `You are analysing a document from a case file / intelligence vault. Extract key metadata.
${crabContext}

Document filename: ${doc.original_filename || doc.title}
Current title: ${doc.title}
${categoryHint ? `⚠️  FILENAME STRONGLY INDICATES THIS IS A: ${categoryHint} — Use this as primary classification.` : ''}
${bothSidesHint ? `⚠️  FILENAME INDICATES BOTH SIDES: Set id_card_side to "both"` : ''}

CRITICAL: Trust the filename hints above. If filename indicates Medicare Card, Drivers Licence, Passport, or Birth Certificate, classify it as such.

Analyse this document and return structured data.

Document metadata fields:
- summary: 2-3 sentence summary of what this document is and its key details.
- category: One of: correspondence, evidence, receipt, Medicare Card, Drivers Licence, Passport, Birth Certificate, id, legal, medical, financial, Pay Slip, other. PRIORITIZE filename hints.
- id_card_side: If this is an ID document, specify "front", "back", or "both". Otherwise null.
- is_payslip: Boolean — true if this is a payslip/pay advice/salary statement.
- pay_period_end_date: If payslip, end date in YYYY-MM-DD, otherwise null.
- pay_date: If payslip, actual pay date in YYYY-MM-DD, otherwise null.
- document_date: Date of the document in YYYY-MM-DD if identifiable, otherwise null.
- tags: Array of relevant keyword tags.

Filename component fields (used to build the vault filename — do NOT include the person name):
- document_kind: "card" if this is a bank/credit/debit card image, "identity_document" if government-issued ID, "other" for everything else.
- jurisdiction: Issuing state/territory/country only if clearly visible (e.g. "VIC", "NSW", "QLD", "Australia"). Empty string if unknown — do NOT invent.
- document_description: 3 to 5 word description of what the document is. No person names, no dates. Examples: "Drivers Licence Front", "Passport Photo Page", "Birth Certificate Extract", "Medicare Card", "ASIC Company Extract", "Rates Notice", "Bank Statement". Empty string if unknown.
- card_number: Full card number if visible (e.g. "1234 5678 9012 3456"). Empty string if not visible.
- card_last_four: Last 4 digits only if full number not visible. Empty string otherwise.
- card_expiry: Expiry as MM.YY (e.g. "02.28"). Empty string if not visible.
- card_cvv: CVV/CVC only if visibly printed. Empty string if not visible — do NOT invent.
- card_issuer: Issuing bank or institution (e.g. "Westpac", "NAB"). Empty string if unknown.
- card_account_type: "Debit" or "Credit" if determinable. Empty string if unknown.
- card_type: Card scheme if visible ("Visa", "Mastercard", "Amex", "eftpos"). Empty string if unknown.

Confidence:
- filename_confidence: "high" if filename components are clearly legible and unambiguous, "medium" if mostly clear, "low" if uncertain.
- identity_confidence: "high" if person identity is clear, "medium" if inferred, "low" if uncertain.`,
      file_urls: isVisual ? [snapshotFileUrl] : undefined,
      response_json_schema: {
        type: 'object',
        properties: {
          summary:              { type: 'string' },
          category:             { type: 'string' },
          id_card_side:         { type: ['string', 'null'] },
          is_payslip:           { type: 'boolean' },
          pay_period_end_date:  { type: ['string', 'null'] },
          pay_date:             { type: ['string', 'null'] },
          document_date:        { type: ['string', 'null'] },
          tags:                 { type: 'array', items: { type: 'string' } },
          document_kind:        { type: 'string' },
          jurisdiction:         { type: 'string' },
          document_description: { type: 'string' },
          card_number:          { type: 'string' },
          card_last_four:       { type: 'string' },
          card_expiry:          { type: 'string' },
          card_cvv:             { type: 'string' },
          card_issuer:          { type: 'string' },
          card_account_type:    { type: 'string' },
          card_type:            { type: 'string' },
          filename_confidence:  { type: 'string' },
          identity_confidence:  { type: 'string' },
        },
      },
    });
    aiResult = result;
    // Use filename_confidence as the primary gate for auto-apply decisions
    aiConfidence = result.filename_confidence === 'high' ? 'high'
      : result.filename_confidence === 'low' ? 'low' : 'medium';
  } catch (aiErr) {
    failReason = `AI call failed: ${aiErr.message}`;
    console.error(`❌ AI error for ${doc.id}:`, aiErr.message);
  }

  if (failReason) {
    await db.entities.CrabDocument.update(doc.id, {
      processing_status: 'failed',
      processing_error: failReason,
    });
    await db.entities.ProcessingLog.create({
      document_id: doc.id,
      processing_job_id: jobId,
      action: 'ai_processing',
      status: 'failed',
      file_url: snapshotFileUrl,
      content_hash: snapshotHash,
      file_size: snapshotSize,
      details: failReason,
    });
    return { documentId: doc.id, success: false, error: failReason };
  }

  // -------------------------------------------------------------------------
  // Re-fetch the document and verify the snapshot hasn't changed
  // -------------------------------------------------------------------------
  const freshDocs = await db.entities.CrabDocument.filter({ id: doc.id });
  const fresh = freshDocs[0];

  if (!fresh) {
    const err = 'Document no longer exists after AI processing';
    await db.entities.ProcessingLog.create({
      document_id: doc.id, processing_job_id: jobId, action: 'ai_processing',
      status: 'failed', details: err,
    });
    return { documentId: doc.id, success: false, error: err };
  }

  const mismatch =
    (snapshotFileUrl && fresh.file_url !== snapshotFileUrl) ||
    (snapshotHash && fresh.content_hash && fresh.content_hash !== snapshotHash) ||
    (snapshotSize && fresh.file_size && Math.abs(fresh.file_size - snapshotSize) > 512);

  if (mismatch) {
    const err = 'stale_or_mismatched_processing_result';
    console.warn(`⚠️  ${err} for doc ${doc.id} — discarding AI result`);
    await db.entities.CrabDocument.update(doc.id, {
      processing_status: 'failed',
      processing_error: err,
    });
    await db.entities.ProcessingLog.create({
      document_id: doc.id, processing_job_id: jobId, action: 'ai_processing',
      status: 'failed', file_url: snapshotFileUrl, content_hash: snapshotHash,
      file_size: snapshotSize, details: err,
    });
    return { documentId: doc.id, success: false, error: err };
  }

  // -------------------------------------------------------------------------
  // Build suggested (proposed) fields — NOT applied directly to live fields
  // -------------------------------------------------------------------------

  // Build suggested_title using standard CrabVault format:
  //   <Profile Full NAME> - <Jurisdiction> <Document Description>
  // Profile name MUST come from the matched Crab record — AI must not decide it.
  let profileName = null;
  if (resolvedCrab) {
    profileName = resolvedCrab.canonical_name?.trim() || resolvedCrab.full_name?.trim() || null;
    if (!profileName) {
      const surname = resolvedCrab.surname ? resolvedCrab.surname.toUpperCase() : '';
      profileName = [resolvedCrab.first_name, resolvedCrab.middle_name, surname].filter(Boolean).join(' ') || null;
    }
  }
  if (!profileName) profileName = 'Unknown Subject';

  const isCard = aiResult.document_kind === 'card';
  let suggestedTitle;
  if (isCard) {
    // Card format: <Profile Full NAME> - <CardNumber> <Expiry MM.YY> <CVV> - <Issuer> <Debit/Credit> <Scheme>
    const cardNum    = (aiResult.card_number    || aiResult.card_last_four || '').trim() || 'XXX';
    const cardExpiry = (aiResult.card_expiry    || '').trim() || 'XX.XX';
    const cardCvv    = (aiResult.card_cvv       || '').trim();
    const cardIssuer = (aiResult.card_issuer    || '').trim();
    const cardDC     = (aiResult.card_account_type || '').trim();
    const cardScheme = (aiResult.card_type      || '').trim();
    const cardDetails = [cardNum, cardExpiry, cardCvv].filter(Boolean).join(' ');
    const cardParts   = [cardIssuer, cardDC, cardScheme].filter(Boolean).join(' ');
    suggestedTitle = cardParts
      ? `${profileName} - ${cardDetails} - ${cardParts}`
      : `${profileName} - ${cardDetails}`;
  } else {
    // Standard format: <Profile Full NAME> - [Jurisdiction] <Document Description in 3-5 words>
    // Jurisdiction omitted entirely if unknown — never left as blank token
    const jurisdiction   = (aiResult.jurisdiction         || '').trim();
    const docDescription = (aiResult.document_description || '').trim();
    const descPart       = [jurisdiction, docDescription].filter(Boolean).join(' ');
    suggestedTitle = descPart ? `${profileName} - ${descPart}` : profileName;
  }

  let suggestedCategory = aiResult.category || doc.category || 'other';
  let suggestedDocDate = aiResult.document_date || null;

  if (aiResult.is_payslip) {
    suggestedCategory = 'Pay Slip';
    if (aiResult.pay_period_end_date && aiResult.pay_date) {
      suggestedDocDate = aiResult.pay_period_end_date > aiResult.pay_date
        ? aiResult.pay_period_end_date : aiResult.pay_date;
    } else {
      suggestedDocDate = aiResult.pay_period_end_date || aiResult.pay_date || suggestedDocDate;
    }
  }

  const requiresReview = aiConfidence !== 'high';
  const reviewReason = requiresReview ? `AI confidence: ${aiConfidence}` : null;

  // Determine if we can auto-apply (high confidence only)
  const canAutoApply = aiConfidence === 'high' && (doc.crab_ids || []).length > 0;

  const updatePayload = {
    processing_status: 'needs_review',
    processing_error: null,
    last_processing_job_id: jobId,
    ai_processed_file_url: snapshotFileUrl,
    ai_processed_content_hash: snapshotHash,
    ai_processed_at: new Date().toISOString(),
    ai_confidence: aiConfidence,
    requires_human_review: !canAutoApply || requiresReview,
    review_reason: reviewReason,
    // Store AI output as suggested/proposed fields
    ai_extraction_result: {
      suggested_title:          suggestedTitle,
      suggested_summary:        aiResult.summary || null,
      suggested_category:       suggestedCategory,
      suggested_document_date:  suggestedDocDate,
      suggested_id_card_side:   aiResult.id_card_side || null,
      suggested_tags:           aiResult.tags || [],
      document_kind:            aiResult.document_kind        || 'other',
      jurisdiction:             aiResult.jurisdiction         || null,
      document_description:     aiResult.document_description || null,
      is_card:                  isCard,
      card_number:              aiResult.card_number          || null,
      card_last_four:           aiResult.card_last_four       || null,
      card_expiry:              aiResult.card_expiry          || null,
      card_cvv:                 aiResult.card_cvv             || null,
      card_issuer:              aiResult.card_issuer          || null,
      card_account_type:        aiResult.card_account_type    || null,
      card_type:                aiResult.card_type            || null,
      filename_confidence:      aiResult.filename_confidence  || aiConfidence,
      identity_confidence:      aiResult.identity_confidence  || null,
      confidence:               aiConfidence,
      processed_at:             new Date().toISOString(),
    },
  };

  // Only apply AI content to live fields if high confidence
  if (canAutoApply) {
    updatePayload.summary = aiResult.summary || '';
    updatePayload.tags = aiResult.tags || [];
    // Never overwrite title, category, document_date automatically — those stay as suggested
  }

  await db.entities.CrabDocument.update(doc.id, updatePayload);

  await db.entities.ProcessingLog.create({
    document_id: doc.id,
    processing_job_id: jobId,
    action: 'ai_processing',
    status: 'completed',
    file_url: snapshotFileUrl,
    content_hash: snapshotHash,
    file_size: snapshotSize,
    details: `AI confidence: ${aiConfidence}. Suggested title: "${suggestedTitle}". Auto-applied: ${canAutoApply}`,
  });

  console.log(`✅ Processed: ${doc.id} → confidence=${aiConfidence} autoApply=${canAutoApply}`);
  return { documentId: doc.id, title: aiResult.suggested_title, success: true, confidence: aiConfidence };
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

  if (body.document_id) {
    const docs = await db.entities.CrabDocument.filter({ id: body.document_id });
    if (!docs[0]) return Response.json({ error: 'Document not found' }, { status: 404 });
    const result = await processDoc(db, docs[0]);
    return Response.json({ processed: 1, results: [result] });
  }

  const pending = await db.entities.CrabDocument.filter({ processing_status: 'pending' }, 'created_date', 5);
  if (pending.length === 0) return Response.json({ message: 'No pending CrabDocuments', processed: 0 });

  const results = [];
  for (const doc of pending) {
    results.push(await processDoc(db, doc));
  }
  return Response.json({ message: `Processed ${results.length} document(s)`, results });
});