import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ---------------------------------------------------------------------------
// Name normalisation helpers
// ---------------------------------------------------------------------------

/** Strip punctuation that should not affect matching, collapse whitespace, lowercase */
function normKey(s) {
  return (s || '')
    .trim()
    .toLowerCase()
    .replace(/[''`.,\-]/g, '')   // apostrophes, commas, hyphens, dots
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalise a phone to digits only for comparison */
function normPhone(s) {
  return (s || '').replace(/\D/g, '').replace(/^610/, '0').replace(/^61/, '0');
}

/** Lowercase + trim an email */
function normEmail(s) {
  return (s || '').trim().toLowerCase();
}

/** Normalise an address: lowercase, collapse whitespace, strip punctuation */
function normAddress(s) {
  return (s || '').trim().toLowerCase().replace(/[,.\-]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Compute matching keys from name parts.
 * name_key          = first|middle|surname
 * surname_first_key = surname|first
 */
function computeKeys(firstName, middleName, surname) {
  const fk = normKey(firstName);
  const mk = normKey(middleName);
  const sk = normKey(surname);
  const name_key = [fk, mk, sk].filter(Boolean).join('|');
  const surname_first_key = [sk, fk].filter(Boolean).join('|');
  return { name_key, surname_first_key, fk, mk, sk };
}

/** Build display canonical name: First Middle SURNAME */
function buildCanonicalName(first, middle, surname) {
  const parts = [];
  if (first?.trim()) parts.push(first.trim());
  if (middle?.trim()) parts.push(middle.trim());
  if (surname?.trim()) parts.push(surname.trim().toUpperCase());
  return parts.join(' ');
}

/** Build a folder slug from name parts: first-middle-SURNAME (URL-safe) */
function buildFolderSlug(first, middle, surname) {
  return [first, middle, surname]
    .filter(Boolean)
    .map((p, i) => {
      const clean = p.trim().replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '-');
      // Capitalise surname (last part, i.e. index 2 when middle present or index 1 when not)
      return clean;
    })
    .join('-')
    .toLowerCase();
}

// ---------------------------------------------------------------------------
// Supporting identifier matching helpers
// ---------------------------------------------------------------------------

/** Check if two crabs share at least one strong supporting identifier */
function hasStrongIdentifierMatch(incoming, candidate) {
  // Date of birth
  if (incoming.date_of_birth && candidate.date_of_birth) {
    if (incoming.date_of_birth === candidate.date_of_birth) return true;
  }

  // Phones — gather all candidate phones
  const candidatePhones = [
    candidate.phone,
    ...(candidate.additional_phones || []).map(p => p.number),
    ...(candidate.match_identifiers?.phones || []),
  ].map(normPhone).filter(Boolean);

  const incomingPhones = (incoming.phones || []).map(normPhone).filter(Boolean);
  for (const p of incomingPhones) {
    if (p && candidatePhones.includes(p)) return true;
  }

  // Emails
  const candidateEmails = [
    candidate.email,
    ...(candidate.additional_emails || []).map(e => e.email),
    ...(candidate.match_identifiers?.emails || []),
  ].map(normEmail).filter(Boolean);

  const incomingEmails = (incoming.emails || []).map(normEmail).filter(Boolean);
  for (const e of incomingEmails) {
    if (e && candidateEmails.includes(e)) return true;
  }

  // Addresses — normalised substring match (e.g. just suburb or street number)
  const candidateAddresses = [
    [candidate.address1, candidate.suburb, candidate.postcode].filter(Boolean).join(' '),
    ...(candidate.additional_addresses || []).map(a =>
      [a.address1, a.suburb, a.postcode].filter(Boolean).join(' ')
    ),
    ...(candidate.match_identifiers?.addresses || []),
  ].map(normAddress).filter(Boolean);

  const incomingAddresses = (incoming.addresses || []).map(normAddress).filter(Boolean);
  for (const a of incomingAddresses) {
    if (a && candidateAddresses.some(ca => ca.includes(a) || a.includes(ca))) return true;
  }

  // ID numbers (label-insensitive value match)
  const candidateIdValues = [
    ...(candidate.id_numbers || []),
    ...(candidate.match_identifiers?.id_numbers || []),
  ].map(n => normKey(n.value)).filter(Boolean);

  const incomingIdValues = (incoming.id_numbers || []).map(n => normKey(n.value)).filter(Boolean);
  for (const v of incomingIdValues) {
    if (v && candidateIdValues.includes(v)) return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Main resolver
// ---------------------------------------------------------------------------

/**
 * Resolve a document's identity against existing Crab records.
 *
 * Input payload:
 * {
 *   first_name, middle_name, surname,          — extracted name parts
 *   date_of_birth,                              — optional supporting identifier
 *   phones, emails, addresses, id_numbers,      — arrays of supporting identifiers
 *   confidence                                  — "high" | "medium" | "low" (caller-assessed)
 * }
 *
 * Returns:
 * {
 *   status,           — "matched" | "ambiguous" | "unmatched"
 *   crabId,           — matched Crab ID (or null)
 *   candidateCrabIds, — array of IDs when ambiguous
 *   confidence,       — "high" | "medium" | "low"
 *   reason,           — human-readable explanation
 *   canonicalCrab,    — { first_name, middle_name, surname, canonical_name, name_key, surname_first_key, folder_slug }
 *   shouldCreateNew   — boolean, true only when resolver recommends creating a new Crab
 * }
 */
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

  // Rule 9: missing surname or low confidence → unmatched, send to review
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

  const { name_key, surname_first_key, fk, mk, sk } = computeKeys(firstName, middleName, surname);

  // Load all non-deleted Crabs (we do in-code filtering for case-insensitive normalised matching)
  const allCrabs = await db.entities.Crab.filter({ is_deleted: false });

  // Rule 4: exact name_key match
  const exactMatches = allCrabs.filter(c => {
    const ck = computeKeys(c.first_name, c.middle_name, c.surname);
    return ck.name_key === name_key;
  });

  if (exactMatches.length >= 1) {
    // Sort oldest first; if duplicates, pick oldest
    exactMatches.sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
    const keeper = exactMatches[0];
    return {
      status: 'matched',
      crabId: keeper.id,
      candidateCrabIds: [],
      confidence: 'high',
      reason: `Exact name_key match: "${name_key}"`,
      canonicalCrab: buildCanonicalFields(keeper),
      shouldCreateNew: false,
    };
  }

  // Candidates sharing the same surname_first_key (first + surname, any middle)
  const sfkMatches = allCrabs.filter(c => {
    const ck = computeKeys(c.first_name, c.middle_name, c.surname);
    return ck.surname_first_key === surname_first_key;
  });

  // Rule 5: no middle name in incoming + exactly one surname_first_key match
  if (!middleName && sfkMatches.length === 1) {
    const keeper = sfkMatches[0];
    return {
      status: 'matched',
      crabId: keeper.id,
      candidateCrabIds: [],
      confidence: 'high',
      reason: `No middle name supplied; unambiguous surname+first match to existing Crab "${keeper.full_name || keeper.id}"`,
      canonicalCrab: buildCanonicalFields(keeper), // preserve existing canonical fields
      shouldCreateNew: false,
    };
  }

  // Rule 6: multiple candidates sharing first + surname — try supporting identifiers
  if (sfkMatches.length > 1) {
    const supportingInput = { date_of_birth, phones, emails, addresses, id_numbers };
    const strongMatches = sfkMatches.filter(c => hasStrongIdentifierMatch(supportingInput, c));

    if (strongMatches.length === 1) {
      const keeper = strongMatches[0];
      return {
        status: 'matched',
        crabId: keeper.id,
        candidateCrabIds: [],
        confidence: 'medium',
        reason: `Disambiguated via supporting identifier from ${sfkMatches.length} candidates`,
        canonicalCrab: buildCanonicalFields(keeper),
        shouldCreateNew: false,
      };
    }

    // Rule 7: still multiple — ambiguous
    return {
      status: 'ambiguous',
      crabId: null,
      candidateCrabIds: sfkMatches.map(c => c.id),
      confidence: 'low',
      reason: `${sfkMatches.length} candidates share first+surname "${firstName} ${surname.toUpperCase()}" and supporting identifiers did not disambiguate`,
      canonicalCrab: buildCanonicalFromInput(firstName, middleName, surname),
      shouldCreateNew: false,
    };
  }

  // Rule 8: no candidates at all — create new if high/medium confidence
  if (sfkMatches.length === 0) {
    const shouldCreate = confidence === 'high' || confidence === 'medium';
    return {
      status: shouldCreate ? 'matched' : 'unmatched',
      crabId: null,
      candidateCrabIds: [],
      confidence,
      reason: shouldCreate
        ? `No existing Crab found — new profile will be created for "${buildCanonicalName(firstName, middleName, surname)}"`
        : `No existing Crab found and confidence is "${confidence}" — sending to review`,
      canonicalCrab: buildCanonicalFromInput(firstName, middleName, surname),
      shouldCreateNew: shouldCreate,
    };
  }

  // Fallback (single sfkMatch but middle name was provided — no exact match, treat as ambiguous between new and existing)
  if (sfkMatches.length === 1) {
    const candidate = sfkMatches[0];
    const supportingInput = { date_of_birth, phones, emails, addresses, id_numbers };
    if (hasStrongIdentifierMatch(supportingInput, candidate)) {
      return {
        status: 'matched',
        crabId: candidate.id,
        candidateCrabIds: [],
        confidence: 'medium',
        reason: `Middle name differs from existing Crab but supporting identifier confirms match`,
        canonicalCrab: buildCanonicalFields(candidate),
        shouldCreateNew: false,
      };
    }
    return {
      status: 'ambiguous',
      crabId: null,
      candidateCrabIds: [candidate.id],
      confidence: 'low',
      reason: `Possible match to "${candidate.full_name || candidate.id}" but middle name differs and no supporting identifier confirms`,
      canonicalCrab: buildCanonicalFromInput(firstName, middleName, surname),
      shouldCreateNew: false,
    };
  }

  // Should never reach here
  return {
    status: 'unmatched',
    crabId: null,
    candidateCrabIds: [],
    confidence: 'low',
    reason: 'Resolver reached unexpected state',
    canonicalCrab: buildCanonicalFromInput(firstName, middleName, surname),
    shouldCreateNew: false,
  };
}

// ---------------------------------------------------------------------------
// Canonical field builders
// ---------------------------------------------------------------------------

/** Build canonical output from an existing Crab record (preserve its existing canonical fields) */
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

/** Build canonical output from raw extracted name parts (for new Crab creation) */
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

// ---------------------------------------------------------------------------
// HTTP handler — allows direct invocation and testing
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Auth: accept API key (watcher) or authenticated user
    const apiKey = req.headers.get('x-api-key');
    const isApiKey = apiKey && apiKey === Deno.env.get('INGEST_API_KEY');

    if (!isApiKey) {
      const user = await base44.auth.me();
      if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = base44.asServiceRole;
    const payload = await req.json();

    const result = await resolveIdentity(db, payload);
    return Response.json(result);

  } catch (error) {
    console.error('resolveIdentity error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// Export for use by other backend functions via SDK invoke
export { resolveIdentity, buildCanonicalFields, buildCanonicalFromInput, computeKeys, buildCanonicalName, buildFolderSlug };