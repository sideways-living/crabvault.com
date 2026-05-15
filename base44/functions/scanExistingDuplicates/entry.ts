import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * scanExistingDuplicates — admin function
 *
 * Scans all non-deleted CrabDocument and Document records and creates
 * DuplicateReview records for any matches found.
 *
 * Rules:
 * 1. Exact duplicate:   same content_hash  OR  (same normalized_filename + file_size + source_modified_at)
 * 2. Renamed duplicate: same content_hash but different normalized_filename
 *                       OR same file_size + source_modified_at but different normalized_filename
 * 3. Possible version:  similar normalized_filename + same crab/category + different hash/size/modtime
 *
 * Never deletes, merges, or modifies files.
 * Skips pairs that already have a pending/resolved DuplicateReview.
 */

function normFilename(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[_\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\.(pdf|docx|xlsx|pptx|jpg|jpeg|png|heic|txt|psd|other)$/i, '')
    .trim();
}

// Returns a canonical sorted pair key to avoid duplicate reviews for the same pair
function pairKey(id1, id2) {
  return [id1, id2].sort().join('::');
}

// Check if normalized filenames are "similar" (one contains the other, or prefix overlap > 60%)
function nameSimilar(a, b) {
  if (!a || !b) return false;
  if (a === b) return false; // exact match handled separately
  const longer = Math.max(a.length, b.length);
  const shorter = Math.min(a.length, b.length);
  if (a.includes(b) || b.includes(a)) return true;
  let common = 0;
  while (common < shorter && a[common] === b[common]) common++;
  return longer > 0 && common / longer > 0.6;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const db = base44.asServiceRole;

    // Load all non-deleted docs from both entity types
    const [crabDocs, docs] = await Promise.all([
      db.entities.CrabDocument.filter({ is_deleted: false }),
      db.entities.Document.filter({ is_deleted: false }),
    ]);

    // Load existing DuplicateReview records to avoid re-creating them
    const existingReviews = await db.entities.DuplicateReview.list('-created_date', 5000);

    // Build a set of already-reviewed pair keys (pending or resolved)
    const reviewedPairs = new Set();
    for (const r of existingReviews) {
      if (!r.primary_document_id) continue;
      for (const cid of (r.candidate_document_ids || [])) {
        reviewedPairs.add(pairKey(r.primary_document_id, cid));
      }
    }

    // We'll collect matches as: { type, primary, candidate, matchReasons, groupKey }
    const matches = [];
    const seenPairs = new Set(); // within this scan run

    function addMatch(type, primary, candidate, matchReasons) {
      const key = pairKey(primary.id, candidate.id);
      if (seenPairs.has(key) || reviewedPairs.has(key)) return;
      seenPairs.add(key);
      matches.push({ type, primary, candidate, matchReasons });
    }

    // -------------------------------------------------------------------------
    // Scan a list of documents for duplicates among themselves
    // -------------------------------------------------------------------------
    function scanList(list) {
      // Index by content_hash
      const byHash = new Map();
      for (const doc of list) {
        if (!doc.content_hash) continue;
        if (!byHash.has(doc.content_hash)) byHash.set(doc.content_hash, []);
        byHash.get(doc.content_hash).push(doc);
      }

      // Index by (file_size + source_modified_at) — only if both present
      const bySizeTime = new Map();
      for (const doc of list) {
        if (!doc.file_size || !doc.source_modified_at) continue;
        const key = `${doc.file_size}::${new Date(doc.source_modified_at).getTime()}`;
        if (!bySizeTime.has(key)) bySizeTime.set(key, []);
        bySizeTime.get(key).push(doc);
      }

      // Pass 1: hash-based matches
      for (const [, group] of byHash) {
        if (group.length < 2) continue;
        // Sort oldest first — oldest is "existing", newer is "new"
        group.sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
        const primary = group[group.length - 1]; // newest = "incoming"
        for (let i = 0; i < group.length - 1; i++) {
          const candidate = group[i];
          const normP = normFilename(primary.normalized_filename || primary.original_filename);
          const normC = normFilename(candidate.normalized_filename || candidate.original_filename);
          if (normP === normC) {
            addMatch('exact_duplicate', primary, candidate, ['content_hash_match', 'filename_match']);
          } else {
            addMatch('renamed_duplicate', primary, candidate, ['content_hash_match', 'filename_differs']);
          }
        }
      }

      // Pass 2: size+time matches (for docs without hash or missed above)
      for (const [, group] of bySizeTime) {
        if (group.length < 2) continue;
        group.sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
        const primary = group[group.length - 1];
        for (let i = 0; i < group.length - 1; i++) {
          const candidate = group[i];
          const normP = normFilename(primary.normalized_filename || primary.original_filename);
          const normC = normFilename(candidate.normalized_filename || candidate.original_filename);
          if (normP === normC) {
            addMatch('exact_duplicate', primary, candidate, ['filesize_match', 'modified_time_match', 'filename_match']);
          } else {
            addMatch('renamed_duplicate', primary, candidate, ['filesize_match', 'modified_time_match', 'filename_differs']);
          }
        }
      }

      // Pass 3: possible versions — similar name + same crab/category, different content
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i];
          const b = list[j];
          const key = pairKey(a.id, b.id);
          if (seenPairs.has(key) || reviewedPairs.has(key)) continue;

          const normA = normFilename(a.normalized_filename || a.original_filename);
          const normB = normFilename(b.normalized_filename || b.original_filename);

          if (!nameSimilar(normA, normB)) continue;

          // At least one contextual signal must match
          const sameCategory = a.category && b.category && a.category === b.category;
          const sameCrab = (a.crab_ids || []).some(id => (b.crab_ids || []).includes(id));
          const sameDate = a.document_date && b.document_date && a.document_date === b.document_date;

          if (!sameCategory && !sameCrab && !sameDate) continue;

          // Must differ in content (not already caught as exact/renamed)
          const sameHash = a.content_hash && b.content_hash && a.content_hash === b.content_hash;
          if (sameHash) continue; // already caught in pass 1

          const reasons = ['similar_filename'];
          if (sameCategory) reasons.push('same_category');
          if (sameCrab) reasons.push('same_profile');
          if (sameDate) reasons.push('same_document_date');

          // Newest is "primary"
          const [older, newer] = new Date(a.created_date) <= new Date(b.created_date) ? [a, b] : [b, a];
          addMatch('possible_version', newer, older, reasons);
        }
      }
    }

    scanList(crabDocs);
    scanList(docs);

    // -------------------------------------------------------------------------
    // Create DuplicateReview records for new matches
    // -------------------------------------------------------------------------
    let created = 0;
    for (const match of matches) {
      const { type, primary, candidate, matchReasons } = match;

      // Determine confidence
      const confidence = matchReasons.includes('content_hash_match') ? 'high'
        : (matchReasons.includes('filesize_match') && matchReasons.includes('modified_time_match')) ? 'high'
        : 'medium';

      const matchScore = confidence === 'high' ? 1.0 : 0.7;

      const suggestedAction = type === 'exact_duplicate' ? 'flag_duplicate'
        : type === 'renamed_duplicate' ? 'ask_filename_choice'
        : 'keep_as_new_version';

      await db.entities.DuplicateReview.create({
        review_type: type,
        status: 'pending',
        primary_document_id: primary.id,
        candidate_document_ids: [candidate.id],
        match_score: matchScore,
        match_reasons: matchReasons,
        suggested_action: suggestedAction,
      });

      // Flag the documents as needing review
      const entityName = primary.crab_ids !== undefined ? 'CrabDocument' : 'Document';
      const updateFn = entityName === 'CrabDocument'
        ? db.entities.CrabDocument
        : db.entities.Document;

      await updateFn.update(primary.id, {
        duplicate_status: type,
        duplicate_review_status: 'pending_review',
        duplicate_candidate_ids: [candidate.id],
        duplicate_match_reason: matchReasons.join(', '),
      });

      created++;
    }

    console.log(`✅ scanExistingDuplicates: found ${matches.length} new match(es), created ${created} review(s)`);

    return Response.json({
      success: true,
      scanned_crab_documents: crabDocs.length,
      scanned_documents: docs.length,
      new_reviews_created: created,
      skipped_already_reviewed: matches.length - created,
    });

  } catch (error) {
    console.error('scanExistingDuplicates error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});