import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * CrabVault Ingress Function — hardened for safety.
 *
 * Safety rules enforced:
 * 1. original_file_url, original_filename, original_content_hash,
 *    original_file_size, original_uploaded_at are set once at ingest
 *    and NEVER overwritten.
 * 2. AI extraction is read-only: results stored in ai_extraction_result only.
 * 3. AI CANNOT create a profile. Profile creation requires:
 *    - zero plausible matches, AND
 *    - AI confidence = "high"
 *    Otherwise → needs_review / ambiguous.
 * 4. "medium" confidence with no match → needs_review, no profile created.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normKey(s) {
  return (s || '').trim().toLowerCase().replace(/[''`.,\-]/g, '').replace(/\s+/g, ' ').trim();
}
function normPhone(s) {
  return (s || '').replace(/\D/g, '').replace(/^610/, '0').replace(/^61/, '0');
}
function normEmail(s) {
  return (s || '').trim().toLowerCase();
}
function normAddress(s) {
  return (s || '').trim().toLowerCase().replace(/[,.\-]/g, ' ').replace(/\s+/g, ' ').trim();
}
function computeKeys(firstName, middleName, surname) {
  const fk = normKey(firstName);
  const mk = normKey(middleName);
  const sk = normKey(surname);
  const name_key = [fk, mk, sk].filter(Boolean).join('|');
  const surname_first_key = [sk, fk].filter(Boolean).join('|');
  return { name_key, surname_first_key, fk, mk, sk };
}
function buildCanonicalName(first, middle, surname) {
  const parts = [];
  if (first?.trim()) parts.push(first.trim());
  if (middle?.trim()) parts.push(middle.trim());
  if (surname?.trim()) parts.push(surname.trim().toUpperCase());
  return parts.join(' ');
}
function buildFolderSlug(first, middle, surname) {
  return [first, middle, surname]
    .filter(Boolean)
    .map(p => p.trim().replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '-'))
    .join('-').toLowerCase();
}
function hasStrongIdentifierMatch(incoming, candidate) {
  if (incoming.date_of_birth && candidate.date_of_birth &&
      incoming.date_of_birth === candidate.date_of_birth) return true;
  const cp = [candidate.phone, ...(candidate.additional_phones || []).map(p => p.number),
    ...(candidate.match_identifiers?.phones || [])].map(normPhone).filter(Boolean);
  for (const p of (incoming.phones || []).map(normPhone).filter(Boolean)) {
    if (cp.includes(p)) return true;
  }
  const ce = [candidate.email, ...(candidate.additional_emails || []).map(e => e.email),
    ...(candidate.match_identifiers?.emails || [])].map(normEmail).filter(Boolean);
  for (const e of (incoming.emails || []).map(normEmail).filter(Boolean)) {
    if (ce.includes(e)) return true;
  }
  const ca = [[candidate.address1, candidate.suburb, candidate.postcode].filter(Boolean).join(' '),
    ...(candidate.additional_addresses || []).map(a =>
      [a.address1, a.suburb, a.postcode].filter(Boolean).join(' ')),
    ...(candidate.match_identifiers?.addresses || [])].map(normAddress).filter(Boolean);
  for (const a of (incoming.addresses || []).map(normAddress).filter(Boolean)) {
    if (ca.some(x => x.includes(a) || a.includes(x))) return true;
  }
  const ci = [...(candidate.id_numbers || []), ...(candidate.match_identifiers?.id_numbers || [])]
    .map(n => normKey(n.value)).filter(Boolean);
  for (const v of (incoming.id_numbers || []).map(n => normKey(n.value)).filter(Boolean)) {
    if (ci.includes(v)) return true;
  }
  return false;
}
function buildCanonicalFields(crab) {
  const first = crab.first_name || '';
  const middle = crab.middle_name || '';
  const surname = crab.surname || '';
  const { name_key, surname_first_key, fk, mk, sk } = computeKeys(first, middle, surname);
  return {
    first_name: first, middle_name: middle, surname,
    canonical_name: crab.canonical_name || buildCanonicalName(first, middle, surname),
    name_key: crab.name_key || name_key,
    surname_first_key: crab.surname_first_key || surname_first_key,
    first_key: crab.first_key || fk, middle_key: crab.middle_key || mk,
    surname_key: crab.surname_key || sk,
    folder_slug: crab.folder_slug || buildFolderSlug(first, middle, surname),
    previous_folder_slugs: crab.previous_folder_slugs || [],
  };
}
function buildCanonicalFromInput(first, middle, surname) {
  const { name_key, surname_first_key, fk, mk, sk } = computeKeys(first, middle, surname);
  return {
    first_name: first, middle_name: middle, surname,
    canonical_name: buildCanonicalName(first, middle, surname),
    name_key, surname_first_key,
    first_key: fk, middle_key: mk, surname_key: sk,
    folder_slug: buildFolderSlug(first, middle, surname),
    previous_folder_slugs: [],
  };
}
function normFilename(s) {
  return (s || '').toLowerCase().replace(/[_\-]/g, ' ').replace(/\s+/g, ' ')
    .replace(/\.(pdf|docx|xlsx|jpg|jpeg|png|heic|txt|psd|other)$/i, '').trim();
}
async function sha256Hex(arrayBuffer) {
  const hashBuf = await crypto.subtle.digest('SHA-256', arrayBuffer);
  return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// Deterministic identity resolver
// Rules:
//  - exact full-name match → use existing
//  - first+surname only match, one candidate → use existing
//  - multiple candidates → needs_review, NO create
//  - uncertain/low confidence → needs_review, NO create
//  - zero matches AND confidence=high → create new
//  - zero matches AND confidence=medium/low → needs_review, NO create
// ---------------------------------------------------------------------------
async function resolveIdentity(db, { first_name, middle_name, surname, date_of_birth,
    phones, emails, addresses, id_numbers, confidence }) {
  const firstName = (first_name || '').trim();
  const middleName = (middle_name || '').trim();
  const surnameTrim = (surname || '').trim();

  if (!surnameTrim || confidence === 'low') {
    return { status: 'unmatched', crabId: null, candidateCrabIds: [], confidence,
      reason: !surnameTrim ? 'Surname missing' : 'Low confidence — sending to review',
      canonicalCrab: null, shouldCreateNew: false };
  }

  const { name_key, surname_first_key } = computeKeys(firstName, middleName, surnameTrim);
  const allCrabs = await db.entities.Crab.filter({ is_deleted: false });

  // Rule: exact full-name match
  const exactMatches = allCrabs.filter(c =>
    computeKeys(c.first_name, c.middle_name, c.surname).name_key === name_key);
  if (exactMatches.length >= 1) {
    exactMatches.sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
    const keeper = exactMatches[0];
    return { status: 'matched', crabId: keeper.id, candidateCrabIds: [], confidence: 'high',
      reason: `Exact name_key match: "${name_key}"`,
      canonicalCrab: buildCanonicalFields(keeper), shouldCreateNew: false };
  }

  const sfkMatches = allCrabs.filter(c =>
    computeKeys(c.first_name, c.middle_name, c.surname).surname_first_key === surname_first_key);

  // Rule: first+surname, one candidate, no middle → match existing
  if (!middleName && sfkMatches.length === 1) {
    const keeper = sfkMatches[0];
    return { status: 'matched', crabId: keeper.id, candidateCrabIds: [], confidence: 'high',
      reason: `Unambiguous surname+first match to "${keeper.full_name || keeper.id}"`,
      canonicalCrab: buildCanonicalFields(keeper), shouldCreateNew: false };
  }

  // Rule: multiple candidates with same first+surname
  if (sfkMatches.length > 1) {
    const supporting = { date_of_birth, phones, emails, addresses, id_numbers };
    const strong = sfkMatches.filter(c => hasStrongIdentifierMatch(supporting, c));
    if (strong.length === 1) {
      const keeper = strong[0];
      return { status: 'matched', crabId: keeper.id, candidateCrabIds: [], confidence: 'medium',
        reason: `Disambiguated via supporting identifier`,
        canonicalCrab: buildCanonicalFields(keeper), shouldCreateNew: false };
    }
    // Multiple candidates — NEVER create; send to review
    return { status: 'ambiguous', crabId: null, candidateCrabIds: sfkMatches.map(c => c.id),
      confidence: 'low',
      reason: `${sfkMatches.length} candidates share "${firstName} ${surnameTrim.toUpperCase()}" — cannot disambiguate`,
      canonicalCrab: buildCanonicalFromInput(firstName, middleName, surnameTrim),
      shouldCreateNew: false };
  }

  // Single sfkMatch with differing middle name
  if (sfkMatches.length === 1) {
    const candidate = sfkMatches[0];
    const supporting = { date_of_birth, phones, emails, addresses, id_numbers };
    if (hasStrongIdentifierMatch(supporting, candidate)) {
      return { status: 'matched', crabId: candidate.id, candidateCrabIds: [], confidence: 'medium',
        reason: `Middle name differs but supporting identifier confirms match`,
        canonicalCrab: buildCanonicalFields(candidate), shouldCreateNew: false };
    }
    return { status: 'ambiguous', crabId: null, candidateCrabIds: [candidate.id], confidence: 'low',
      reason: `Possible match to "${candidate.full_name || candidate.id}" — middle name differs, no supporting identifier`,
      canonicalCrab: buildCanonicalFromInput(firstName, middleName, surnameTrim),
      shouldCreateNew: false };
  }

  // Zero matches — only create new if confidence is HIGH
  if (confidence === 'high') {
    return { status: 'new', crabId: null, candidateCrabIds: [], confidence: 'high',
      reason: `No existing profile found — new profile will be created (confidence: high)`,
      canonicalCrab: buildCanonicalFromInput(firstName, middleName, surnameTrim),
      shouldCreateNew: true };
  }

  // zero matches but medium/low confidence → needs review, no create
  return { status: 'unmatched', crabId: null, candidateCrabIds: [], confidence,
    reason: `No existing profile found and confidence="${confidence}" — sending to review without creating profile`,
    canonicalCrab: buildCanonicalFromInput(firstName, middleName, surnameTrim),
    shouldCreateNew: false };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  try {
    const apiKey = req.headers.get('x-api-key');
    if (apiKey !== Deno.env.get('INGEST_API_KEY')) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file');
    const filename = formData.get('filename') || file?.name || 'document';
    let firstName  = (formData.get('first_name')  || '').trim();
    let middleName = (formData.get('middle_name') || '').trim();
    let surname    = (formData.get('surname')     || '').trim();
    const existingCrabId = (formData.get('crab_id') || '').trim();
    const category = formData.get('category') || 'other';
    const aiIdentify = formData.get('ai_identify') === 'true';
    const sourceModifiedAt = formData.get('source_modified_at') || null;

    if (!file) return Response.json({ error: 'No file provided' }, { status: 400 });
    if (!existingCrabId && !surname && !aiIdentify) {
      return Response.json({ error: 'surname or crab_id is required' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole;

    const ingestJobId = crypto.randomUUID();
    const uploadedAt = new Date().toISOString();

    // Compute hash from raw bytes BEFORE uploading
    const fileBytes = await file.arrayBuffer();
    let contentHash = null;
    try {
      contentHash = await sha256Hex(fileBytes);
    } catch (e) {
      console.warn(`⚠️  Could not compute content hash: ${e.message}`);
    }

    const ext = filename.split('.').pop()?.toLowerCase() || 'other';
    const fileType = ['pdf', 'docx', 'xlsx', 'jpg', 'jpeg', 'png', 'heic', 'txt', 'psd'].includes(ext)
      ? (ext === 'jpeg' ? 'jpg' : ext) : 'other';
    const fileSize = file.size || 0;

    // Upload file — original_file_url is set once and never changed
    const { file_url } = await db.integrations.Core.UploadFile({ file });

    // -----------------------------------------------------------------------
    // AI extraction (read-only — never mutates document state)
    // -----------------------------------------------------------------------
    let extractedIdentity = null;
    let aiConfidence = 'medium';
    let aiExtractionResult = null;

    if (aiIdentify && !existingCrabId) {
      const isImage = ['jpg', 'jpeg', 'png', 'heic'].includes(ext);
      const isPdf = ext === 'pdf';
      if (isImage || isPdf) {
        const hint = [firstName, middleName, surname].filter(Boolean).join(' ');
        console.log(`🤖  AI extracting: ${filename}${hint ? ` (hint: ${hint})` : ''}`);
        try {
          const categories = await db.entities.Category.list();
          const categoryOptions = categories.map(c => c.name).join(', ');

          const result = await db.integrations.Core.InvokeLLM({
            prompt: `Analyse this document carefully and extract the following information.

Filename: "${filename}"
${hint ? `Name hint from filename/folder: "${hint}" — use as strong hint but correct if document shows a different name.` : 'No name hint — identify from document content only.'}

Available document types: ${categoryOptions}

Return JSON with:
- first_name, middle_name, surname (the primary person this document belongs to or is addressed to)
- jurisdiction: The issuing state, territory, country, or authority (e.g. "VIC", "NSW", "Australia", "QLD"). Leave empty string if unknown — do NOT invent it.
- document_description: A concise human-readable description of the document type only (e.g. "Drivers Licence", "Passport", "Birth Certificate", "ASIC Company Extract", "Medicare Card", "Debit Mastercard", "Credit Visa"). Do NOT include a person name or date. Keep it short.
- document_type (exactly one from available types)
- is_card: true if this document is a bank card / credit card / debit card image
- card_number: Full card number if visible (e.g. "1234 5678 9012 3456"), or last 4 digits only as "ending XXXX XXXX XXXX 1234" if only partial is visible. Empty string if not visible.
- card_expiry: Expiry formatted as MM.YY (e.g. "02.28"). Empty string if not visible.
- card_cvv: CVV/CVC if visibly present on the document. Empty string if not visible — do NOT invent it.
- card_issuer: The issuing bank or financial institution (e.g. "Westpac", "NAB", "CommBank"). Empty string if unknown.
- card_debit_or_credit: "Debit" or "Credit" if determinable. Empty string if unknown.
- card_scheme: Card scheme if visible (e.g. "Visa", "Mastercard", "Amex", "eftpos"). Empty string if unknown.
- date_of_birth (YYYY-MM-DD or empty)
- address (full address as single string or empty)
- phone (normalised or empty)
- email (or empty)
- id_numbers: array of { label, value } objects
- confidence: "high" if name is clearly legible, "medium" if inferred, "low" if uncertain`,
            file_urls: [file_url],
            response_json_schema: {
              type: 'object',
              properties: {
                first_name:           { type: 'string' },
                middle_name:          { type: 'string' },
                surname:              { type: 'string' },
                jurisdiction:         { type: 'string' },
                document_description: { type: 'string' },
                document_type:        { type: 'string' },
                is_card:              { type: 'boolean' },
                card_number:          { type: 'string' },
                card_expiry:          { type: 'string' },
                card_cvv:             { type: 'string' },
                card_issuer:          { type: 'string' },
                card_debit_or_credit: { type: 'string' },
                card_scheme:          { type: 'string' },
                date_of_birth:        { type: 'string' },
                address:              { type: 'string' },
                phone:                { type: 'string' },
                email:                { type: 'string' },
                id_numbers:           { type: 'array', items: { type: 'object' } },
                confidence:           { type: 'string' },
              },
            },
          });

          aiConfidence = result.confidence === 'high' ? 'high'
            : result.confidence === 'low' ? 'low' : 'medium';

          // Only use AI-extracted name parts if a surname was returned
          if (result.surname) {
            firstName  = result.first_name  || firstName;
            middleName = result.middle_name || middleName;
            surname    = result.surname;
            console.log(`🤖  AI extracted: ${[firstName, middleName, surname].filter(Boolean).join(' ')}`);
          }

          extractedIdentity = {
            first_name:    result.first_name   || '',
            middle_name:   result.middle_name  || '',
            surname:       result.surname       || '',
            date_of_birth: result.date_of_birth || '',
            address:       result.address       || '',
            phone:         result.phone         || '',
            email:         result.email         || '',
            id_numbers:    result.id_numbers    || [],
          };

          aiExtractionResult = {
            document_description: result.document_description || '',
            jurisdiction:         result.jurisdiction         || '',
            document_type:        result.document_type        || '',
            is_card:              result.is_card              || false,
            card_number:          result.card_number          || '',
            card_expiry:          result.card_expiry          || '',
            card_cvv:             result.card_cvv             || '',
            card_issuer:          result.card_issuer          || '',
            card_debit_or_credit: result.card_debit_or_credit || '',
            card_scheme:          result.card_scheme          || '',
            confidence:           aiConfidence,
            extracted_at:         new Date().toISOString(),
            file_url_used:        file_url,
            content_hash_used:    contentHash,
          };

        } catch (e) {
          console.warn(`🤖  AI extraction failed: ${e.message}`);
          aiConfidence = 'low';
        }
      }
    }

    // -----------------------------------------------------------------------
    // Identity resolution — deterministic, no auto-create unless high confidence
    // -----------------------------------------------------------------------

    let crabId = null;
    let identityResolutionStatus = 'unmatched';
    let identityConfidence = aiConfidence;
    let identityMatchReason = '';
    let candidateCrabIds = [];
    let canonicalCrab = null;
    let isNew = false;

    if (existingCrabId) {
      const existing = await db.entities.Crab.filter({ id: existingCrabId });
      const crab = existing[0];
      crabId = existingCrabId;
      identityResolutionStatus = 'manually_assigned';
      identityConfidence = 'high';
      identityMatchReason = 'Explicit crab_id provided by uploader';
      canonicalCrab = crab ? buildCanonicalFields(crab) : null;
    } else {
      const resolution = await resolveIdentity(db, {
        first_name: firstName, middle_name: middleName, surname,
        date_of_birth: extractedIdentity?.date_of_birth || '',
        phones:    extractedIdentity?.phone    ? [extractedIdentity.phone]    : [],
        emails:    extractedIdentity?.email    ? [extractedIdentity.email]    : [],
        addresses: extractedIdentity?.address  ? [extractedIdentity.address]  : [],
        id_numbers: extractedIdentity?.id_numbers || [],
        confidence: aiConfidence,
      });

      identityConfidence = resolution.confidence;
      identityMatchReason = resolution.reason;
      candidateCrabIds = resolution.candidateCrabIds || [];
      canonicalCrab = resolution.canonicalCrab;

      if (resolution.status === 'matched' && !resolution.shouldCreateNew) {
        crabId = resolution.crabId;
        identityResolutionStatus = 'matched';
        console.log(`✅  Matched to Crab: ${crabId} — ${resolution.reason}`);
      } else if (resolution.shouldCreateNew && resolution.status === 'new') {
        // Only reaches here when confidence=high AND zero matches
        const cc = resolution.canonicalCrab;
        const newCrab = await db.entities.Crab.create({
          first_name: cc.first_name, middle_name: cc.middle_name, surname: cc.surname,
          full_name: cc.canonical_name, canonical_name: cc.canonical_name,
          name_key: cc.name_key, surname_first_key: cc.surname_first_key,
          first_key: cc.first_key, middle_key: cc.middle_key, surname_key: cc.surname_key,
          folder_slug: cc.folder_slug, previous_folder_slugs: [],
          status: '', aliases: [], tags: [], id_numbers: [],
          mailing_same_as_residential: true, is_deleted: false,
        });
        crabId = newCrab.id;
        isNew = true;
        identityResolutionStatus = 'matched';
        console.log(`✅  Created new Crab: ${cc.canonical_name} (${crabId})`);
      } else if (resolution.status === 'ambiguous') {
        identityResolutionStatus = 'ambiguous';
        console.log(`⚠️  Ambiguous identity — ${resolution.reason}`);
      } else {
        identityResolutionStatus = 'unmatched';
        console.log(`❓  Unmatched — ${resolution.reason}`);
      }
    }

    // -----------------------------------------------------------------------
    // Build vault path from resolved Crab canonical fields only
    // -----------------------------------------------------------------------

    let vaultPath = '/crabs/_To Review/';
    let folderName = '';

    if (crabId && canonicalCrab) {
      folderName = canonicalCrab.canonical_name || buildCanonicalName(
        canonicalCrab.first_name, canonicalCrab.middle_name, canonicalCrab.surname);
      vaultPath = `/crabs/${folderName}/documents/`;
    }

    // -----------------------------------------------------------------------
    // Build canonical filename using new standard format:
    //   <Profile Full NAME> - <Jurisdiction> <Document Description>.<ext>
    //
    // Profile name MUST come from the matched Crab record only — AI must not
    // decide or generate the profile name portion.
    // -----------------------------------------------------------------------
    const fileExt = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')) : '';

    // Resolve the profile name from the matched Crab record
    let profileName = null;
    if (crabId && canonicalCrab) {
      profileName = canonicalCrab.canonical_name || null;
      if (!profileName) {
        const parts = [canonicalCrab.first_name, canonicalCrab.middle_name, canonicalCrab.surname?.toUpperCase()].filter(Boolean);
        profileName = parts.join(' ');
      }
    }
    if (!profileName) {
      profileName = 'Unknown Subject';
    }

    // Build canonical base using the correct format for the document type
    let canonicalBase;
    if (aiExtractionResult?.is_card) {
      // Card format: <Profile Full NAME> - <CardNumber> <Expiry MM.YY> <CVV> - <Issuer> <Debit/Credit> <Scheme>
      const cardNumber   = aiExtractionResult.card_number          || 'XXX';
      const cardExpiry   = aiExtractionResult.card_expiry          || 'XX.XX';
      const cardCvv      = aiExtractionResult.card_cvv             || '';
      const cardIssuer   = aiExtractionResult.card_issuer          || '';
      const cardDC       = aiExtractionResult.card_debit_or_credit || '';
      const cardScheme   = aiExtractionResult.card_scheme          || '';
      const cardParts    = [cardIssuer, cardDC, cardScheme].filter(Boolean).join(' ');
      const cardDetails  = [cardNumber, cardExpiry, cardCvv].filter(Boolean).join(' ');
      canonicalBase = cardParts
        ? `${profileName} - ${cardDetails} - ${cardParts}`
        : `${profileName} - ${cardDetails}`;
    } else {
      // Standard format: <Profile Full NAME> - <Jurisdiction> <Document Description>
      const jurisdiction  = aiExtractionResult?.jurisdiction         || '';
      const docDescription = aiExtractionResult?.document_description || aiExtractionResult?.document_type || filename.replace(/\.[^/.]+$/, '');
      const descPart      = [jurisdiction, docDescription].filter(Boolean).join(' ');
      canonicalBase = `${profileName} - ${descPart}`;
    }
    const canonicalFilename = `${canonicalBase}${fileExt}`;
    const normalizedFilename = normFilename(canonicalFilename);

    // -----------------------------------------------------------------------
    // Duplicate detection
    // -----------------------------------------------------------------------

    let dupDetection = {
      duplicate_status: 'none', duplicate_group_id: null, version_group_id: null,
      version_number: 1, previous_version_id: null, duplicate_candidate_ids: [],
      duplicate_match_reason: null, suggested_action: null, confidence: 'low', match_reasons: [],
    };

    try {
      const dupResp = await base44.functions.invoke('detectDuplicates', {
        entity_type: 'CrabDocument',
        normalized_filename: normalizedFilename,
        file_size: fileSize,
        source_modified_at: sourceModifiedAt || null,
        content_hash: contentHash,
        category,
        crab_ids: crabId ? [crabId] : [],
      });
      if (dupResp.data && !dupResp.data.error) dupDetection = dupResp.data;
    } catch (e) {
      console.warn(`⚠️  Duplicate detection failed: ${e.message}`);
    }

    const isDuplicate = ['exact_duplicate', 'renamed_duplicate'].includes(dupDetection.duplicate_status);
    const isVersion = dupDetection.duplicate_status === 'possible_version';
    const newVersion = dupDetection.version_number || 1;
    const previousVersionId = dupDetection.previous_version_id;

    if (isVersion && previousVersionId) {
      try {
        await db.entities.CrabDocument.update(previousVersionId, { is_latest_version: false });
      } catch (e) {
        console.warn(`Could not update previous version: ${e.message}`);
      }
    }

    const versionedTitle = newVersion > 1
      ? `${canonicalBase} (v${newVersion})`
      : canonicalBase;
    const versionedVaultPath = crabId
      ? (newVersion > 1
          ? `${vaultPath}${canonicalFilename}`.replace(/(\.[^/.]+)$/, ` (v${newVersion})$1`)
          : `${vaultPath}${canonicalFilename}`)
      : vaultPath;

    // -----------------------------------------------------------------------
    // Determine processing status
    // -----------------------------------------------------------------------
    const processingStatus =
      (identityResolutionStatus === 'ambiguous' ||
       identityResolutionStatus === 'unmatched' ||
       isDuplicate)
        ? 'needs_review' : 'pending';

    // -----------------------------------------------------------------------
    // Create CrabDocument with immutable original fields
    // -----------------------------------------------------------------------

    const doc = await db.entities.CrabDocument.create({
      // Immutable original fields — set once, never overwritten
      original_file_url:      file_url,
      original_filename:      filename,   // the raw filename as received
      original_content_hash:  contentHash || undefined,
      original_file_size:     fileSize,
      original_uploaded_at:   uploadedAt,
      // Working / display fields
      title:                  versionedTitle,
      file_url,
      normalized_filename:    normalizedFilename,
      file_type:              fileType,
      file_size:              fileSize,
      source_modified_at:     sourceModifiedAt || undefined,
      content_hash:           contentHash || undefined,
      crab_ids:               crabId ? [crabId] : [],
      category,
      processing_status:      processingStatus,
      notes:                  identityResolutionStatus === 'ambiguous'
                                ? `Ambiguous identity: ${identityMatchReason}`
                                : identityResolutionStatus === 'unmatched'
                                  ? `Unmatched identity: ${identityMatchReason}`
                                  : isDuplicate
                                    ? `Flagged as ${dupDetection.duplicate_status}: ${dupDetection.duplicate_match_reason}`
                                    : undefined,
      vault_path:             crabId ? versionedVaultPath : '',
      ingress_deleted:        false,
      synced_to_vault:        false,
      version:                newVersion,
      version_number:         newVersion,
      version_group_id:       dupDetection.version_group_id || undefined,
      previous_version_id:    previousVersionId || undefined,
      is_latest_version:      !isDuplicate,
      duplicate_status:       dupDetection.duplicate_status || 'none',
      duplicate_group_id:     dupDetection.duplicate_group_id || undefined,
      duplicate_candidate_ids: dupDetection.duplicate_candidate_ids?.length > 0
                                ? dupDetection.duplicate_candidate_ids : undefined,
      duplicate_match_reason: dupDetection.duplicate_match_reason || undefined,
      duplicate_review_status: isDuplicate ? 'pending_review' : 'not_required',
      matched_crab_id:        crabId || undefined,
      identity_resolution_status: identityResolutionStatus,
      identity_confidence:    identityConfidence,
      identity_match_reason:  identityMatchReason,
      candidate_crab_ids:     candidateCrabIds.length > 0 ? candidateCrabIds : undefined,
      extracted_identity:     extractedIdentity || undefined,
      // AI extraction is stored as proposed/suggested only
      ai_extraction_result:   aiExtractionResult || undefined,
      ai_confidence:          aiConfidence,
      last_processing_job_id: ingestJobId,
    });

    // Audit log
    await db.entities.ProcessingLog.create({
      document_id: doc.id,
      processing_job_id: ingestJobId,
      action: 'ingest',
      status: 'completed',
      file_url,
      content_hash: contentHash,
      file_size: fileSize,
      details: `identity=${identityResolutionStatus} confidence=${identityConfidence} dup=${dupDetection.duplicate_status}`,
    });

    if (isDuplicate || isVersion) {
      const reviewType = dupDetection.duplicate_status === 'exact_duplicate' ? 'exact_duplicate'
        : dupDetection.duplicate_status === 'renamed_duplicate' ? 'renamed_duplicate'
        : 'possible_version';
      await db.entities.DuplicateReview.create({
        review_type: reviewType, status: 'pending',
        primary_document_id: doc.id,
        candidate_document_ids: dupDetection.duplicate_candidate_ids || [],
        duplicate_group_id: dupDetection.duplicate_group_id || undefined,
        version_group_id: dupDetection.version_group_id || undefined,
        match_score: dupDetection.confidence === 'high' ? 1.0 : dupDetection.confidence === 'medium' ? 0.7 : 0.4,
        match_reasons: dupDetection.match_reasons || [],
        suggested_action: dupDetection.suggested_action || 'manual_review',
      });
    }

    console.log(`✅  CrabDocument v${newVersion} created: ${doc.id} [dup: ${dupDetection.duplicate_status}]`);
    return Response.json({
      success: true, document_id: doc.id, crab_id: crabId,
      crab_name: canonicalCrab?.canonical_name || '', is_new_crab: isNew,
      identity_status: identityResolutionStatus, identity_confidence: identityConfidence,
      identity_reason: identityMatchReason, ambiguous_crab: identityResolutionStatus === 'ambiguous',
      candidate_crab_ids: candidateCrabIds, version: newVersion,
      duplicate_status: dupDetection.duplicate_status, duplicate_flagged: isDuplicate,
    });

  } catch (error) {
    console.error('❌  ingestCrabDocument error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});