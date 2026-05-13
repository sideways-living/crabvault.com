import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ---------------------------------------------------------------------------
// Name normalisation helpers (mirrored from resolveIdentity)
// ---------------------------------------------------------------------------

function normKey(s) {
  return (s || '')
    .trim()
    .toLowerCase()
    .replace(/[''`.,\-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
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
  if (first?.trim())   parts.push(first.trim());
  if (middle?.trim())  parts.push(middle.trim());
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

// ---------------------------------------------------------------------------
// Merge helpers
// ---------------------------------------------------------------------------

/** Merge an array field: union of unique normalised strings, keeper's values first */
function mergeArray(keeperArr, dupeArr, normFn = v => v) {
  const seen = new Set();
  const result = [];
  for (const v of [...(keeperArr || []), ...(dupeArr || [])]) {
    const n = normFn(typeof v === 'string' ? v : JSON.stringify(v));
    if (!seen.has(n)) { seen.add(n); result.push(v); }
  }
  return result;
}

/** Merge id_numbers arrays by value, keeper first */
function mergeIdNumbers(keeperIds, dupeIds) {
  const seen = new Set((keeperIds || []).map(n => normKey(n.value)));
  const result = [...(keeperIds || [])];
  for (const n of (dupeIds || [])) {
    if (!seen.has(normKey(n.value))) { seen.add(normKey(n.value)); result.push(n); }
  }
  return result;
}

/** Return val if non-empty, else fallback */
function coalesce(val, fallback) {
  return (val !== null && val !== undefined && val !== '') ? val : fallback;
}

// ---------------------------------------------------------------------------
// Build the fields to write back to the keeper after merging a duplicate
// ---------------------------------------------------------------------------

function buildKeeperMergeUpdate(keeper, dupe) {
  const aliases = mergeArray(keeper.aliases, dupe.aliases);

  // Add dupe display names (full_name, canonical_name, folder_slug) to aliases
  for (const name of [dupe.full_name, dupe.canonical_name, buildCanonicalName(dupe.first_name, dupe.middle_name, dupe.surname)]) {
    if (name && !aliases.includes(name)) aliases.push(name);
  }

  const tags = mergeArray(keeper.tags, dupe.tags);
  const id_numbers = mergeIdNumbers(keeper.id_numbers, dupe.id_numbers);

  const previous_folder_slugs = mergeArray(
    keeper.previous_folder_slugs,
    [dupe.folder_slug, ...(dupe.previous_folder_slugs || [])].filter(Boolean)
  );

  // Merge phones
  const additional_phones = mergeArray(
    keeper.additional_phones,
    [
      ...(dupe.phone ? [{ number: dupe.phone, label: 'merged' }] : []),
      ...(dupe.additional_phones || []),
    ],
    p => normKey(typeof p === 'string' ? p : p.number)
  );

  // Merge emails
  const additional_emails = mergeArray(
    keeper.additional_emails,
    [
      ...(dupe.email ? [{ email: dupe.email, label: 'merged' }] : []),
      ...(dupe.additional_emails || []),
    ],
    e => normKey(typeof e === 'string' ? e : e.email)
  );

  // Merge addresses
  const additional_addresses = mergeArray(
    keeper.additional_addresses,
    dupe.additional_addresses,
    a => normKey([a.address1, a.suburb, a.postcode].filter(Boolean).join(' '))
  );

  const update = {
    aliases,
    tags,
    id_numbers,
    previous_folder_slugs,
    additional_phones,
    additional_emails,
    additional_addresses,
    // Scalar fields: only fill if keeper is empty
    phone:    coalesce(keeper.phone,    dupe.phone),
    email:    coalesce(keeper.email,    dupe.email),
    address1: coalesce(keeper.address1, dupe.address1),
    address2: coalesce(keeper.address2, dupe.address2),
    suburb:   coalesce(keeper.suburb,   dupe.suburb),
    state:    coalesce(keeper.state,    dupe.state),
    postcode: coalesce(keeper.postcode, dupe.postcode),
    date_of_birth: coalesce(keeper.date_of_birth, dupe.date_of_birth),
    notes:    [keeper.notes, dupe.notes ? `[merged from ${dupe.full_name || dupe.id}] ${dupe.notes}` : null].filter(Boolean).join('\n\n') || undefined,
    photo_url: coalesce(keeper.photo_url, dupe.photo_url),
    emergency_summary: coalesce(keeper.emergency_summary, dupe.emergency_summary),
  };

  return update;
}

// ---------------------------------------------------------------------------
// Group crabs into duplicate sets
// ---------------------------------------------------------------------------

function groupDuplicates(allCrabs) {
  // Build index maps
  const byNameKey = {};        // exact full name match
  const bySurnameFirst = {};   // first+surname match (potential middle-name variants)

  for (const crab of allCrabs) {
    const { name_key, surname_first_key } = computeKeys(crab.first_name, crab.middle_name, crab.surname);

    if (!byNameKey[name_key]) byNameKey[name_key] = [];
    byNameKey[name_key].push(crab);

    if (!bySurnameFirst[surname_first_key]) bySurnameFirst[surname_first_key] = [];
    bySurnameFirst[surname_first_key].push(crab);
  }

  // Collect groups with >1 member
  const seen = new Set();
  const groups = [];

  // Exact name_key duplicates
  for (const [key, members] of Object.entries(byNameKey)) {
    if (members.length < 2) continue;
    const ids = members.map(c => c.id).sort().join(',');
    if (seen.has(ids)) continue;
    seen.add(ids);
    groups.push({ match_type: 'exact_name_key', key, members });
  }

  // surname_first_key duplicates (may differ only by middle name or formatting)
  for (const [key, members] of Object.entries(bySurnameFirst)) {
    if (members.length < 2) continue;
    const ids = members.map(c => c.id).sort().join(',');
    if (seen.has(ids)) continue;
    seen.add(ids);
    groups.push({ match_type: 'surname_first_key', key, members });
  }

  return groups;
}

// ---------------------------------------------------------------------------
// HTTP handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const db = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));

    /**
     * Modes:
     *   { mode: "scan" }
     *     → Return all duplicate groups with suggested keepers. No writes.
     *
     *   { mode: "dry_run", groups: [{ keeper_id, duplicate_ids }] }
     *     → Simulate what would be merged/reassigned. No writes.
     *
     *   { mode: "merge", groups: [{ keeper_id, duplicate_ids }] }
     *     → Execute full merge: update keeper, reassign docs, soft-delete dupes.
     */
    const mode = body.mode || 'scan';

    // -----------------------------------------------------------------------
    // Load all non-deleted crabs
    // -----------------------------------------------------------------------
    const allCrabs = await db.entities.Crab.filter({ is_deleted: false });
    const crabById = Object.fromEntries(allCrabs.map(c => [c.id, c]));

    // -----------------------------------------------------------------------
    // SCAN mode: find and report groups
    // -----------------------------------------------------------------------
    if (mode === 'scan') {
      const rawGroups = groupDuplicates(allCrabs);
      const report = rawGroups.map(g => {
        // Sort oldest first → oldest is suggested keeper
        const sorted = [...g.members].sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
        const keeper = sorted[0];
        const duplicates = sorted.slice(1);
        return {
          match_type: g.match_type,
          key: g.key,
          suggested_keeper_id: keeper.id,
          suggested_keeper_name: buildCanonicalName(keeper.first_name, keeper.middle_name, keeper.surname),
          suggested_keeper_created: keeper.created_date,
          members: sorted.map(c => ({
            id: c.id,
            display_name: buildCanonicalName(c.first_name, c.middle_name, c.surname),
            full_name: c.full_name,
            folder_slug: c.folder_slug,
            created_date: c.created_date,
            status: c.status,
          })),
          duplicate_ids: duplicates.map(c => c.id),
        };
      });

      return Response.json({
        mode: 'scan',
        total_crabs: allCrabs.length,
        duplicate_groups: report.length,
        groups: report,
      });
    }

    // -----------------------------------------------------------------------
    // DRY_RUN and MERGE modes: process caller-supplied groups
    // -----------------------------------------------------------------------
    const inputGroups = body.groups || [];
    if (inputGroups.length === 0) {
      return Response.json({ error: 'groups array is required for dry_run and merge modes' }, { status: 400 });
    }

    const results = [];

    for (const g of inputGroups) {
      const { keeper_id, duplicate_ids } = g;
      if (!keeper_id || !Array.isArray(duplicate_ids) || duplicate_ids.length === 0) {
        results.push({ keeper_id, error: 'keeper_id and duplicate_ids are required' });
        continue;
      }

      const keeper = crabById[keeper_id];
      if (!keeper) {
        results.push({ keeper_id, error: 'Keeper Crab not found' });
        continue;
      }

      const dupes = duplicate_ids.map(id => crabById[id]).filter(Boolean);
      if (dupes.length === 0) {
        results.push({ keeper_id, error: 'No valid duplicate Crabs found' });
        continue;
      }

      // Compute what the keeper update will look like (accumulate over all dupes)
      let keeperState = { ...keeper };
      const mergeUpdates = [];
      for (const dupe of dupes) {
        const update = buildKeeperMergeUpdate(keeperState, dupe);
        mergeUpdates.push({ dupe_id: dupe.id, dupe_name: buildCanonicalName(dupe.first_name, dupe.middle_name, dupe.surname), update });
        keeperState = { ...keeperState, ...update };
      }

      // Find all documents referencing any of the dupe IDs
      const dupeIds = new Set(dupes.map(d => d.id));
      const allDocs = await db.entities.CrabDocument.filter({ is_deleted: false });
      const affectedDocs = allDocs.filter(doc => {
        const hasDupeInCrabIds = (doc.crab_ids || []).some(id => dupeIds.has(id));
        const hasDupeAsMatched = doc.matched_crab_id && dupeIds.has(doc.matched_crab_id);
        return hasDupeInCrabIds || hasDupeAsMatched;
      });

      // Compute new vault paths using keeper's canonical folder name
      const keeperFolder = keeperState.folder_slug
        ? keeperState.folder_slug
        : buildFolderSlug(keeper.first_name, keeper.middle_name, keeper.surname);
      const keeperCanonical = keeper.canonical_name || buildCanonicalName(keeper.first_name, keeper.middle_name, keeper.surname);

      const docUpdates = affectedDocs.map(doc => {
        const newCrabIds = [...new Set((doc.crab_ids || []).map(id => dupeIds.has(id) ? keeper_id : id))];
        const newMatchedCrabId = doc.matched_crab_id && dupeIds.has(doc.matched_crab_id) ? keeper_id : doc.matched_crab_id;

        // Rebuild vault_path: replace dupe folder segment with keeper folder
        let newVaultPath = doc.vault_path || '';
        for (const dupe of dupes) {
          const dupeFolder = dupe.folder_slug || buildFolderSlug(dupe.first_name, dupe.middle_name, dupe.surname);
          if (newVaultPath.includes(`/crabs/${dupeFolder}/`)) {
            newVaultPath = newVaultPath.replace(`/crabs/${dupeFolder}/`, `/crabs/${keeperCanonical}/`);
          }
        }
        // If path still uses any raw dupe name, replace with keeper canonical
        for (const dupe of dupes) {
          const dupeCanonical = dupe.canonical_name || buildCanonicalName(dupe.first_name, dupe.middle_name, dupe.surname);
          if (newVaultPath.includes(`/crabs/${dupeCanonical}/`)) {
            newVaultPath = newVaultPath.replace(`/crabs/${dupeCanonical}/`, `/crabs/${keeperCanonical}/`);
          }
        }

        return {
          id: doc.id,
          title: doc.title,
          crab_ids: newCrabIds,
          matched_crab_id: newMatchedCrabId,
          vault_path: newVaultPath,
          identity_resolution_status: newMatchedCrabId === keeper_id ? 'matched' : doc.identity_resolution_status,
          identity_match_reason: newMatchedCrabId === keeper_id
            ? `Reassigned from duplicate Crab ${doc.matched_crab_id} to keeper ${keeper_id}`
            : doc.identity_match_reason,
        };
      });

      const groupResult = {
        keeper_id,
        keeper_name: buildCanonicalName(keeper.first_name, keeper.middle_name, keeper.surname),
        duplicate_ids: dupes.map(d => d.id),
        duplicate_names: dupes.map(d => buildCanonicalName(d.first_name, d.middle_name, d.surname)),
        keeper_update: keeperState,
        affected_documents: docUpdates.length,
        document_updates: docUpdates.map(d => ({ id: d.id, title: d.title, new_vault_path: d.vault_path })),
      };

      if (mode === 'merge') {
        // 1. Update keeper with merged fields
        await db.entities.Crab.update(keeper_id, keeperState);

        // 2. Reassign all affected documents
        for (const docUpdate of docUpdates) {
          await db.entities.CrabDocument.update(docUpdate.id, {
            crab_ids: docUpdate.crab_ids,
            matched_crab_id: docUpdate.matched_crab_id,
            vault_path: docUpdate.vault_path,
            identity_resolution_status: docUpdate.identity_resolution_status,
            identity_match_reason: docUpdate.identity_match_reason,
          });
        }

        // 3. Soft-delete duplicate Crab records
        for (const dupe of dupes) {
          await db.entities.Crab.update(dupe.id, {
            is_deleted: true,
            notes: [dupe.notes, `[DELETED: merged into keeper ${keeper_id} (${buildCanonicalName(keeper.first_name, keeper.middle_name, keeper.surname)}) on ${new Date().toISOString()}]`].filter(Boolean).join('\n\n'),
          });
        }

        groupResult.merged = true;
        console.log(`✅  Merged ${dupes.length} duplicate(s) into keeper ${keeper_id} — ${docUpdates.length} documents reassigned`);
      } else {
        groupResult.merged = false;
      }

      results.push(groupResult);
    }

    return Response.json({
      mode,
      dry_run: mode === 'dry_run',
      groups_processed: results.length,
      results,
    });

  } catch (error) {
    console.error('deduplicateCrabs error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});