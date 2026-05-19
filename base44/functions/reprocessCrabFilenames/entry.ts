import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * reprocessCrabFilenames — bulk filename reprocessing for existing CrabDocuments.
 *
 * Safety rules:
 * - Never overwrites original_file_url, original_filename, file_url, vault_path (until approved).
 * - Never creates new Crab profiles.
 * - Writes only to: suggested_filename, naming_status, extracted_naming_data, review_reason.
 * - naming_status = 'needs_review' unless AI confidence is high AND document has exactly one matched profile.
 */

function buildProfileName(crab) {
  if (!crab) return null;
  const name = crab.canonical_name?.trim() || crab.full_name?.trim() || null;
  if (name) return name;
  const surname = crab.surname ? crab.surname.toUpperCase() : '';
  return [crab.first_name, crab.middle_name, surname].filter(Boolean).join(' ') || null;
}

function buildSuggestedFilename(profileName, aiData, fileExt) {
  const isCard = aiData.document_kind === 'card';

  if (isCard) {
    const cardNum    = (aiData.card_number    || aiData.card_last_four || '').trim() || 'XXX';
    const cardExpiry = (aiData.card_expiry    || '').trim() || 'XX.XX';
    const cardCvv    = (aiData.card_cvv       || '').trim();
    const cardIssuer = (aiData.card_issuer    || '').trim();
    const cardDC     = (aiData.card_account_type || '').trim();
    const cardScheme = (aiData.card_type      || '').trim();
    const cardDetails = [cardNum, cardExpiry, cardCvv].filter(Boolean).join(' ');
    const cardParts   = [cardIssuer, cardDC, cardScheme].filter(Boolean).join(' ');
    const base = cardParts
      ? `${profileName} - ${cardDetails} - ${cardParts}`
      : `${profileName} - ${cardDetails}`;
    return `${base}${fileExt}`;
  }

  // Standard: <Profile Full NAME> - [Jurisdiction] <Document Description>
  const jurisdiction   = (aiData.jurisdiction         || '').trim();
  const docDescription = (aiData.document_description || '').trim();
  const descPart       = [jurisdiction, docDescription].filter(Boolean).join(' ');
  const base = descPart ? `${profileName} - ${descPart}` : profileName;
  return `${base}${fileExt}`;
}

async function reprocessDoc(db, doc) {
  const docId = doc.id;

  // Resolve profile name from existing crab record — never from AI
  const crabId = doc.matched_crab_id || (doc.crab_ids || [])[0] || null;
  let resolvedCrab = null;
  if (crabId) {
    const crabs = await db.entities.Crab.filter({ id: crabId });
    resolvedCrab = crabs[0] || null;
  }

  const profileName = buildProfileName(resolvedCrab) || 'Unknown Subject';
  const profileMissing = !resolvedCrab;

  // Determine file extension
  const originalFilename = doc.original_filename || doc.title || '';
  const fileExt = originalFilename.includes('.')
    ? originalFilename.slice(originalFilename.lastIndexOf('.')).toLowerCase()
    : (doc.file_type ? `.${doc.file_type}` : '');

  // Only call AI for visual/readable files
  const ext = (doc.file_type || '').toLowerCase();
  const isVisual = doc.file_url && ['pdf', 'jpg', 'jpeg', 'png', 'heic', 'webp'].includes(ext);

  let aiData = null;
  let aiError = null;

  if (isVisual) {
    try {
      const result = await db.integrations.Core.InvokeLLM({
        prompt: `You are analysing a document from a case file / intelligence vault for filename generation.

Document filename: ${originalFilename}
Current title: ${doc.title || ''}

Return ONLY the following fields for filename construction. Do NOT generate the full filename. Do NOT include the person name.

Filename component fields:
- document_kind: "card" if bank/credit/debit card image, "identity_document" if government-issued ID, "other" for everything else.
- jurisdiction: Issuing state/territory/country ONLY if clearly visible or strongly implied by the issuing authority (e.g. "VIC", "NSW", "QLD", "Australia"). null if unknown — do NOT invent.
- document_description: Exactly 3 to 5 words describing the document type. No person names. No dates. Examples: "Drivers Licence Front", "Passport Photo Page", "Birth Certificate Extract", "Medicare Card", "ASIC Company Extract", "Rates Notice", "Bank Statement".
- filename_confidence: "high" if jurisdiction and document_description are clearly legible and unambiguous, "medium" if mostly clear, "low" if uncertain.
- review_reason: Brief explanation if filename_confidence is not "high". null if confidence is high.

Card fields (only populate if document_kind is "card"):
- card_number: Full card number if visible. Empty string if not.
- card_last_four: Last 4 digits only if full number not visible. Empty string otherwise.
- card_expiry: MM.YY format. Empty string if not visible.
- card_cvv: Only if visibly printed. Empty string if not — do NOT invent.
- card_issuer: Issuing bank (e.g. "Westpac", "NAB"). Empty string if unknown.
- card_account_type: "Debit" or "Credit" if determinable. Empty string if unknown.
- card_type: Card scheme if visible ("Visa", "Mastercard", "Amex", "eftpos"). Empty string if unknown.`,
        file_urls: [doc.file_url],
        response_json_schema: {
          type: 'object',
          properties: {
            document_kind:        { type: 'string' },
            jurisdiction:         { type: ['string', 'null'] },
            document_description: { type: 'string' },
            filename_confidence:  { type: 'string' },
            review_reason:        { type: ['string', 'null'] },
            card_number:          { type: 'string' },
            card_last_four:       { type: 'string' },
            card_expiry:          { type: 'string' },
            card_cvv:             { type: 'string' },
            card_issuer:          { type: 'string' },
            card_account_type:    { type: 'string' },
            card_type:            { type: 'string' },
          },
        },
      });
      aiData = result;
    } catch (e) {
      aiError = e.message;
      console.warn(`⚠️  AI failed for doc ${docId}: ${e.message}`);
    }
  }

  // Determine naming_status
  const hasOneProfile = !!resolvedCrab && (doc.crab_ids || []).length <= 1;
  const aiConfidence = aiData?.filename_confidence || 'low';
  const canAutoApprove = !profileMissing && hasOneProfile && aiConfidence === 'high' && !aiError && !!aiData?.document_description;

  const namingStatus = canAutoApprove ? 'needs_review' : 'needs_review'; // always needs_review — human must approve

  // Build review_reason
  let reviewReason = aiData?.review_reason || null;
  if (profileMissing) reviewReason = 'No matched profile — cannot build profile name';
  else if (aiError) reviewReason = `AI extraction failed: ${aiError}`;
  else if (!aiData) reviewReason = 'File type not supported for AI extraction';
  else if (!aiData.document_description) reviewReason = 'AI could not determine document description';
  else if (aiConfidence !== 'high') reviewReason = reviewReason || `AI confidence: ${aiConfidence}`;

  // Build suggested filename
  let suggestedFilename = null;
  if (aiData || !isVisual) {
    const effectiveAiData = aiData || { document_kind: 'other', jurisdiction: null, document_description: '' };
    suggestedFilename = buildSuggestedFilename(profileName, effectiveAiData, fileExt);
  }

  const extractedNamingData = {
    document_kind:        aiData?.document_kind        || null,
    jurisdiction:         aiData?.jurisdiction         || null,
    document_description: aiData?.document_description || null,
    card_number:          aiData?.card_number          || null,
    card_last_four:       aiData?.card_last_four       || null,
    card_expiry:          aiData?.card_expiry          || null,
    card_cvv:             aiData?.card_cvv             || null,
    card_issuer:          aiData?.card_issuer          || null,
    card_account_type:    aiData?.card_account_type    || null,
    card_type:            aiData?.card_type            || null,
    filename_confidence:  aiConfidence,
    review_reason:        reviewReason,
    profile_name_used:    profileName,
    processed_at:         new Date().toISOString(),
  };

  await db.entities.CrabDocument.update(docId, {
    suggested_filename:    suggestedFilename || undefined,
    naming_status:         namingStatus,
    review_reason:         reviewReason || undefined,
    extracted_naming_data: extractedNamingData,
  });

  await db.entities.ProcessingLog.create({
    document_id: docId,
    action: 'rename',
    status: 'completed',
    file_url: doc.file_url,
    details: `Suggested filename: "${suggestedFilename}". Confidence: ${aiConfidence}. Profile: ${profileName}`,
  });

  console.log(`✅ reprocessDoc ${docId} → "${suggestedFilename}" [${aiConfidence}]`);
  return {
    document_id: docId,
    title: doc.title,
    suggested_filename: suggestedFilename,
    naming_status: namingStatus,
    confidence: aiConfidence,
    review_reason: reviewReason,
    success: true,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin only' }, { status: 403 });
    }

    const db = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));

    // Single document mode
    if (body.document_id) {
      const docs = await db.entities.CrabDocument.filter({ id: body.document_id });
      if (!docs[0]) return Response.json({ error: 'Document not found' }, { status: 404 });
      const result = await reprocessDoc(db, docs[0]);
      return Response.json({ processed: 1, results: [result] });
    }

    // Batch mode — limit controls how many to process per call (default 10)
    const limit = Math.min(body.limit || 10, 50);
    const includeAlreadyProcessed = body.reprocess_all === true;

    let docs;
    if (includeAlreadyProcessed) {
      docs = await db.entities.CrabDocument.filter({ is_deleted: false }, '-created_date', limit);
    } else {
      // Only docs without a suggested_filename yet
      const all = await db.entities.CrabDocument.filter({ is_deleted: false }, '-created_date', 500);
      docs = all.filter(d => !d.suggested_filename).slice(0, limit);
    }

    if (docs.length === 0) {
      return Response.json({ message: 'No documents to reprocess', processed: 0, results: [] });
    }

    const results = [];
    for (const doc of docs) {
      results.push(await reprocessDoc(db, doc));
    }

    const succeeded = results.filter(r => r.success).length;
    const highConfidence = results.filter(r => r.confidence === 'high').length;

    return Response.json({
      message: `Reprocessed ${succeeded}/${docs.length} documents`,
      processed: succeeded,
      high_confidence: highConfidence,
      needs_review: succeeded - highConfidence,
      results,
    });

  } catch (error) {
    console.error('❌ reprocessCrabFilenames error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});