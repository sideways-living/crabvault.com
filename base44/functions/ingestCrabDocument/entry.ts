import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * CrabVault Ingress Function
 * Accepts a file upload, resolves identity via shared resolver logic,
 * and saves a CrabDocument with full identity resolution metadata.
 *
 * Payload (multipart form-data):
 *   file           — the file binary
 *   filename       — original filename
 *   first_name     — (optional) crab first name
 *   middle_name    — (optional) crab middle name
 *   surname        — required if crab_id not provided
 *   crab_id        — (optional) bypass matching, link to existing crab
 *   category       — (optional) document category, defaults to "other"
 *   ai_identify    — (optional) "true" to run AI extraction before resolving
 */

// ---------------------------------------------------------------------------
// Inlined identity resolver helpers (cannot import from other functions)
// ---------------------------------------------------------------------------

function normKey(s) {
  return (s || '')
    .trim()
    .toLowerCase()
    .replace(/[''`.,\-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
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
    .join('-')
    .toLowerCase();
}

function hasStrongIdentifierMatch(incoming, candidate) {
  if (incoming.date_of_birth && candidate.date_of_birth) {
    if (incoming.date_of_birth === candidate.date_of_birth) return true;
  }

  const candidatePhones = [
    candidate.phone,
    ...(candidate.additional_phones || []).map(p => p.number),
    ...(candidate.match_identifiers?.phones || []),
  ].map(normPhone).filter(Boolean);
  for (const p of (incoming.phones || []).map(normPhone).filter(Boolean)) {
    if (candidatePhones.includes(p)) return true;
  }

  const candidateEmails = [
    candidate.email,
    ...(candidate.additional_emails || []).map(e => e.email),
    ...(candidate.match_identifiers?.emails || []),
  ].map(normEmail).filter(Boolean);
  for (const e of (incoming.emails || []).map(normEmail).filter(Boolean)) {
    if (candidateEmails.includes(e)) return true;
  }

  const candidateAddresses = [
    [candidate.address1, candidate.suburb, candidate.postcode].filter(Boolean).join(' '),
    ...(candidate.additional_addresses || []).map(a =>
      [a.address1, a.suburb, a.postcode].filter(Boolean).join(' ')
    ),
    ...(candidate.match_identifiers?.addresses || []),
  ].map(normAddress).filter(Boolean);
  for (const a of (incoming.addresses || []).map(normAddress).filter(Boolean)) {
    if (candidateAddresses.some(ca => ca.includes(a) || a.includes(ca))) return true;
  }

  const candidateIdValues = [
    ...(candidate.id_numbers || []),
    ...(candidate.match_identifiers?.id_numbers || []),
  ].map(n => normKey(n.value)).filter(Boolean);
  for (const v of (incoming.id_numbers || []).map(n => normKey(n.value)).filter(Boolean)) {
    if (candidateIdValues.includes(v)) return true;
  }

  return false;
}

function buildCanonicalFields(crab) {
  const first = crab.first_name || '';
  const middle = crab.middle_name || '';
  const surname = crab.surname || '';
  const { name_key, surname_first_key, fk, mk, sk } = computeKeys(first, middle, surname);
  return {
    first_name: first,
    middle_name: middle,
    surname,
    canonical_name: crab.canonical_name || buildCanonicalName(first, middle, surname),
    name_key: crab.name_key || name_key,
    surname_first_key: crab.surname_first_key || surname_first_key,
    first_key: crab.first_key || fk,
    middle_key: crab.middle_key || mk,
    surname_key: crab.surname_key || sk,
    folder_slug: crab.folder_slug || buildFolderSlug(first, middle, surname),
    previous_folder_slugs: crab.previous_folder_slugs || [],
  };
}

function buildCanonicalFromInput(first, middle, surname) {
  const { name_key, surname_first_key, fk, mk, sk } = computeKeys(first, middle, surname);
  return {
    first_name: first,
    middle_name: middle,
    surname,
    canonical_name: buildCanonicalName(first, middle, surname),
    name_key,
    surname_first_key,
    first_key: fk,
    middle_key: mk,
    surname_key: sk,
    folder_slug: buildFolderSlug(first, middle, surname),
    previous_folder_slugs: [],
  };
}

async function resolveIdentity(db, payload) {
  const {
    first_name: rawFirst = '',
    middle_name: rawMiddle = '',
    surname: rawSurname = '',
    date_of_birth,
    phones = [],
    emails = [],
    addresses = [],
    id_numbers = [],
    confidence = 'medium',
  } = payload;

  const firstName  = rawFirst.trim();
  const middleName = rawMiddle.trim();
  const surname    = rawSurname.trim();

  if (!surname || confidence === 'low') {
    return {
      status: 'unmatched',
      crabId: null,
      candidateCrabIds: [],
      confidence,
      reason: !surname ? 'Surname missing — cannot resolve identity' : 'Low confidence — sending to review',
      canonicalCrab: null,
      shouldCreateNew: false,
    };
  }

  const { name_key, surname_first_key } = computeKeys(firstName, middleName, surname);
  const allCrabs = await db.entities.Crab.filter({ is_deleted: false });

  const exactMatches = allCrabs.filter(c => computeKeys(c.first_name, c.middle_name, c.surname).name_key === name_key);
  if (exactMatches.length >= 1) {
    exactMatches.sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
    const keeper = exactMatches[0];
    return { status: 'matched', crabId: keeper.id, candidateCrabIds: [], confidence: 'high',
      reason: `Exact name_key match: "${name_key}"`, canonicalCrab: buildCanonicalFields(keeper), shouldCreateNew: false };
  }

  const sfkMatches = allCrabs.filter(c => computeKeys(c.first_name, c.middle_name, c.surname).surname_first_key === surname_first_key);

  if (!middleName && sfkMatches.length === 1) {
    const keeper = sfkMatches[0];
    return { status: 'matched', crabId: keeper.id, candidateCrabIds: [], confidence: 'high',
      reason: `No middle name supplied; unambiguous surname+first match to "${keeper.full_name || keeper.id}"`,
      canonicalCrab: buildCanonicalFields(keeper), shouldCreateNew: false };
  }

  if (sfkMatches.length > 1) {
    const supporting = { date_of_birth, phones, emails, addresses, id_numbers };
    const strongMatches = sfkMatches.filter(c => hasStrongIdentifierMatch(supporting, c));
    if (strongMatches.length === 1) {
      const keeper = strongMatches[0];
      return { status: 'matched', crabId: keeper.id, candidateCrabIds: [], confidence: 'medium',
        reason: `Disambiguated via supporting identifier from ${sfkMatches.length} candidates`,
        canonicalCrab: buildCanonicalFields(keeper), shouldCreateNew: false };
    }
    return { status: 'ambiguous', crabId: null, candidateCrabIds: sfkMatches.map(c => c.id), confidence: 'low',
      reason: `${sfkMatches.length} candidates share first+surname "${firstName} ${surname.toUpperCase()}" — supporting identifiers did not disambiguate`,
      canonicalCrab: buildCanonicalFromInput(firstName, middleName, surname), shouldCreateNew: false };
  }

  if (sfkMatches.length === 0) {
    const shouldCreate = confidence === 'high' || confidence === 'medium';
    return { status: shouldCreate ? 'matched' : 'unmatched', crabId: null, candidateCrabIds: [], confidence,
      reason: shouldCreate
        ? `No existing Crab found — new profile will be created for "${buildCanonicalName(firstName, middleName, surname)}"`
        : `No existing Crab found and confidence is "${confidence}" — sending to review`,
      canonicalCrab: buildCanonicalFromInput(firstName, middleName, surname), shouldCreateNew: shouldCreate };
  }

  // Single sfkMatch with different middle name — check supporting identifiers
  const candidate = sfkMatches[0];
  const supporting = { date_of_birth, phones, emails, addresses, id_numbers };
  if (hasStrongIdentifierMatch(supporting, candidate)) {
    return { status: 'matched', crabId: candidate.id, candidateCrabIds: [], confidence: 'medium',
      reason: `Middle name differs but supporting identifier confirms match to "${candidate.full_name || candidate.id}"`,
      canonicalCrab: buildCanonicalFields(candidate), shouldCreateNew: false };
  }
  return { status: 'ambiguous', crabId: null, candidateCrabIds: [candidate.id], confidence: 'low',
    reason: `Possible match to "${candidate.full_name || candidate.id}" but middle name differs and no supporting identifier confirms`,
    canonicalCrab: buildCanonicalFromInput(firstName, middleName, surname), shouldCreateNew: false };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  try {
    // API key auth (watcher script)
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

    if (!file) {
      return Response.json({ error: 'No file provided' }, { status: 400 });
    }
    if (!existingCrabId && !surname && !aiIdentify) {
      return Response.json({ error: 'surname or crab_id is required' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole;

    // Upload file early
    const ext = filename.split('.').pop()?.toLowerCase() || 'other';
    const fileType = ['pdf', 'docx', 'xlsx', 'jpg', 'jpeg', 'png', 'heic', 'txt', 'psd'].includes(ext) ? (ext === 'jpeg' ? 'jpg' : ext) : 'other';
    const { file_url } = await db.integrations.Core.UploadFile({ file });

    // Accumulated extracted identity from AI (populated if aiIdentify runs)
    let extractedIdentity = null;
    let aiConfidence = 'medium';
    let aiTitle = '';
    let aiFilename = '';

    // AI extraction — enrich name parts and build extractedIdentity
    if (aiIdentify && !existingCrabId) {
      const isImage = ['jpg', 'jpeg', 'png', 'heic'].includes(ext);
      const isPdf = ext === 'pdf';
      if (isImage || isPdf) {
        const hint = [firstName, middleName, surname].filter(Boolean).join(' ');
        console.log(`🤖  AI verifying document: ${filename}${hint ? ` (hint: ${hint})` : ''}`);
        try {
          const categories = await db.entities.Category.list();
          const categoryOptions = categories.map(c => c.name).join(', ');

          const result = await db.integrations.Core.InvokeLLM({
            prompt: `Analyse this document carefully and extract:
1. The full name of the primary person it belongs to or is addressed to.
2. A descriptive title for the document.
3. The document type — choose from the available types below.
4. Any date of birth, address, phone, email, or ID numbers visible.

Filename: "${filename}"
${hint ? `Name hint from filename/folder: "${hint}" — use as strong hint but correct if document shows a different name.` : 'No name hint — identify from document content only.'}

Available document types: ${categoryOptions}

Return JSON with:
- first_name, middle_name, surname
- document_title (clean descriptive title)
- document_type (exactly one from available types)
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
                first_name:     { type: 'string' },
                middle_name:    { type: 'string' },
                surname:        { type: 'string' },
                document_title: { type: 'string' },
                document_type:  { type: 'string' },
                date_of_birth:  { type: 'string' },
                address:        { type: 'string' },
                phone:          { type: 'string' },
                email:          { type: 'string' },
                id_numbers:     { type: 'array', items: { type: 'object' } },
                confidence:     { type: 'string' },
              },
            },
          });

          if (result.surname) {
            firstName  = result.first_name  || '';
            middleName = result.middle_name || '';
            surname    = result.surname;
            console.log(`🤖  AI extracted: ${[firstName, middleName, surname].filter(Boolean).join(' ')}`);
          } else {
            console.log(`🤖  AI could not identify crab — storing as unassigned`);
          }

          aiConfidence = result.confidence === 'high' ? 'high' : result.confidence === 'low' ? 'low' : 'medium';
          aiTitle = result.document_title || '';

          // Build AI filename if original isn't already formatted
          const filenameBase = filename.replace(/\.[^/.]+$/, '');
          const alreadyFormatted = /^.+ - .+/.test(filenameBase);
          if (!alreadyFormatted && result.document_type) {
            const namePart = [result.first_name, result.middle_name, result.surname?.toUpperCase()].filter(Boolean).join(' ');
            aiFilename = namePart ? `${namePart} - ${result.document_type}` : result.document_type;
            console.log(`🤖  AI filename: ${aiFilename}`);
          }

          // Build extractedIdentity for storage on the document
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

        } catch (e) {
          console.warn(`🤖  AI verification failed: ${e.message}`);
          aiConfidence = 'low';
        }
      } else {
        console.log(`🤖  File type ${ext} not supported for AI extraction`);
      }
    }

    // ---------------------------------------------------------------------------
    // Identity resolution
    // ---------------------------------------------------------------------------

    let crabId = null;
    let resolvedStatus = 'unmatched';
    let identityResolutionStatus = 'unmatched';
    let identityConfidence = aiConfidence;
    let identityMatchReason = '';
    let candidateCrabIds = [];
    let canonicalCrab = null;
    let isNew = false;

    if (existingCrabId) {
      // Explicit crab_id — bypass matching, mark as manually assigned
      const existing = await db.entities.Crab.filter({ id: existingCrabId });
      const crab = existing[0];
      crabId = existingCrabId;
      identityResolutionStatus = 'manually_assigned';
      identityConfidence = 'high';
      identityMatchReason = 'Explicit crab_id provided by uploader';
      canonicalCrab = crab ? buildCanonicalFields(crab) : null;
      console.log(`📌  Explicit crab_id: ${crabId}`);
    } else {
      // Run shared resolver
      const resolution = await resolveIdentity(db, {
        first_name: firstName,
        middle_name: middleName,
        surname,
        date_of_birth: extractedIdentity?.date_of_birth || '',
        phones:    extractedIdentity?.phone  ? [extractedIdentity.phone]  : [],
        emails:    extractedIdentity?.email  ? [extractedIdentity.email]  : [],
        addresses: extractedIdentity?.address ? [extractedIdentity.address] : [],
        id_numbers: extractedIdentity?.id_numbers || [],
        confidence: aiConfidence,
      });

      resolvedStatus         = resolution.status;
      identityConfidence     = resolution.confidence;
      identityMatchReason    = resolution.reason;
      candidateCrabIds       = resolution.candidateCrabIds || [];
      canonicalCrab          = resolution.canonicalCrab;

      if (resolution.status === 'matched' && !resolution.shouldCreateNew) {
        crabId = resolution.crabId;
        identityResolutionStatus = 'matched';
        console.log(`✅  Matched to Crab: ${crabId} — ${resolution.reason}`);
      } else if (resolution.status === 'matched' && resolution.shouldCreateNew) {
        // Create new Crab with canonical fields
        const cc = resolution.canonicalCrab;
        const newCrab = await db.entities.Crab.create({
          first_name:           cc.first_name,
          middle_name:          cc.middle_name,
          surname:              cc.surname,
          full_name:            cc.canonical_name,
          canonical_name:       cc.canonical_name,
          name_key:             cc.name_key,
          surname_first_key:    cc.surname_first_key,
          first_key:            cc.first_key,
          middle_key:           cc.middle_key,
          surname_key:          cc.surname_key,
          folder_slug:          cc.folder_slug,
          previous_folder_slugs: [],
          status:               '',
          aliases:              [],
          tags:                 [],
          id_numbers:           [],
          mailing_same_as_residential: true,
          is_deleted:           false,
        });
        crabId = newCrab.id;
        isNew  = true;
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

    // ---------------------------------------------------------------------------
    // Build folder name and vault path from the matched Crab's canonical fields
    // (never from AI-extracted name fields directly)
    // ---------------------------------------------------------------------------

    let folderName = '';
    let vaultPath = '/crabs/_To Review/';

    if (crabId && canonicalCrab) {
      // Use folder_slug if available, otherwise fall back to canonical_name
      folderName = canonicalCrab.canonical_name || buildCanonicalName(
        canonicalCrab.first_name, canonicalCrab.middle_name, canonicalCrab.surname
      );
      vaultPath = `/crabs/${folderName}/documents/`;
    } else if (identityResolutionStatus === 'ambiguous') {
      vaultPath = '/crabs/_To Review/';
    }

    // Build canonical filename
    const fileExt = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')) : '';
    const filenameBase = filename.replace(/\.[^/.]+$/, '');
    const alreadyFormatted = /^.+ - .+/.test(filenameBase);
    let canonicalBase = filenameBase;

    if (!alreadyFormatted) {
      if (aiFilename) {
        canonicalBase = aiFilename;
      } else if (folderName) {
        // Prefix with the canonical folder name if filename doesn't already start with it
        const folderLower = folderName.toLowerCase();
        if (!filenameBase.toLowerCase().startsWith(folderLower + ' - ')) {
          canonicalBase = `${folderName} - ${filenameBase}`;
        }
      }
    }
    const canonicalFilename = `${canonicalBase}${fileExt}`;
    const baseTitle = aiTitle || canonicalBase;

    // ---------------------------------------------------------------------------
    // Version detection (check for existing doc with same filename for same crab)
    // ---------------------------------------------------------------------------

    let newVersion = 1;
    let previousVersionId = null;

    if (crabId) {
      const existingDocs = await db.entities.CrabDocument.filter({ original_filename: canonicalFilename });
      const active = existingDocs.filter(d => !d.is_deleted && (d.crab_ids || []).includes(crabId));

      if (active.length > 0) {
        active.sort((a, b) => (b.version || 1) - (a.version || 1));
        const latest = active[0];

        if (latest.file_size === (file.size || 0)) {
          console.log(`⚠️  True duplicate (same size): ${canonicalFilename} already exists for crab ${crabId}`);
          return Response.json({ success: true, document_id: latest.id, crab_id: crabId, duplicate: true });
        }

        newVersion = (latest.version || 1) + 1;
        previousVersionId = latest.id;
        await db.entities.CrabDocument.update(latest.id, { is_latest_version: false });
        console.log(`🔄  New version v${newVersion} of: ${canonicalFilename} for crab ${crabId}`);
      }
    }

    const versionedTitle = newVersion > 1 ? `${baseTitle} (v${newVersion})` : baseTitle;
    const versionedVaultPath = crabId
      ? (newVersion > 1
          ? `${vaultPath}${canonicalFilename}`.replace(/(\.[^/.]+)$/, ` (v${newVersion})$1`)
          : `${vaultPath}${canonicalFilename}`)
      : vaultPath;

    // ---------------------------------------------------------------------------
    // Create CrabDocument
    // ---------------------------------------------------------------------------

    const doc = await db.entities.CrabDocument.create({
      title:                    versionedTitle,
      file_url,
      original_filename:        canonicalFilename,
      file_type:                fileType,
      file_size:                file.size || 0,
      crab_ids:                 crabId ? [crabId] : [],
      category,
      processing_status:        (identityResolutionStatus === 'ambiguous' || identityResolutionStatus === 'unmatched')
                                  ? 'needs_review'
                                  : 'pending',
      notes:                    identityResolutionStatus === 'ambiguous'
                                  ? `Ambiguous identity: ${identityMatchReason}`
                                  : identityResolutionStatus === 'unmatched'
                                    ? `Unmatched identity: ${identityMatchReason}`
                                    : undefined,
      vault_path:               crabId ? versionedVaultPath : '',
      ingress_deleted:          false,
      synced_to_vault:          false,
      version:                  newVersion,
      previous_version_id:      previousVersionId,
      is_latest_version:        true,
      // Identity resolution fields
      matched_crab_id:          crabId || undefined,
      identity_resolution_status: identityResolutionStatus,
      identity_confidence:      identityConfidence,
      identity_match_reason:    identityMatchReason,
      candidate_crab_ids:       candidateCrabIds.length > 0 ? candidateCrabIds : undefined,
      extracted_identity:       extractedIdentity || undefined,
    });

    console.log(`✅  CrabDocument v${newVersion} created: ${doc.id} → ${versionedVaultPath}`);
    return Response.json({
      success:              true,
      document_id:          doc.id,
      crab_id:              crabId,
      crab_name:            canonicalCrab?.canonical_name || '',
      vault_path:           crabId ? versionedVaultPath : '',
      is_new_crab:          isNew,
      identity_status:      identityResolutionStatus,
      identity_confidence:  identityConfidence,
      identity_reason:      identityMatchReason,
      ambiguous_crab:       identityResolutionStatus === 'ambiguous',
      candidate_crab_ids:   candidateCrabIds,
      version:              newVersion,
      is_new_version:       newVersion > 1,
    });

  } catch (error) {
    console.error('❌  ingestCrabDocument error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});