import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * detectDuplicates — shared duplicate/version detection logic
 *
 * Called internally by ingest functions OR directly for manual scans.
 *
 * Payload:
 *   entity_type        — "CrabDocument" | "Document"
 *   normalized_filename — normalised filename to compare
 *   file_size          — bytes
 *   source_modified_at — ISO datetime (optional)
 *   content_hash       — SHA-256 hex (optional)
 *   document_date      — YYYY-MM-DD (optional, for version grouping)
 *   category           — category string (optional, for version grouping)
 *   crab_ids           — array of crab IDs (optional, for CrabDocument scoping)
 *   exclude_id         — document ID to exclude from comparison (itself)
 *
 * Returns:
 *   {
 *     duplicate_status,       // "none" | "exact_duplicate" | "renamed_duplicate" | "possible_version"
 *     duplicate_group_id,     // uuid (if duplicate)
 *     version_group_id,       // uuid (if version)
 *     version_number,         // computed version number
 *     previous_version_id,    // id of prior latest version doc
 *     duplicate_candidate_ids,
 *     duplicate_match_reason,
 *     suggested_action,       // "flag_duplicate" | "ask_filename_choice" | "keep_as_new_version" | null
 *     confidence,             // "high" | "medium" | "low"
 *     match_reasons,          // array of strings
 *     matched_doc,            // the matched existing document (if any)
 *   }
 */

function normFilename(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[_\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\.(pdf|docx|xlsx|jpg|jpeg|png|heic|txt|psd|other)$/i, '')
    .trim();
}

function generateGroupId() {
  return crypto.randomUUID();
}

Deno.serve(async (req) => {
  try {
    const apiKey = req.headers.get('x-api-key');
    if (apiKey !== Deno.env.get('INGEST_API_KEY')) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      entity_type = 'CrabDocument',
      normalized_filename,
      file_size,
      source_modified_at,
      content_hash,
      document_date,
      category,
      crab_ids = [],
      exclude_id,
    } = body;

    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole;

    // Load existing non-deleted docs (scoped by crab if relevant)
    let existingDocs;
    if (entity_type === 'CrabDocument') {
      existingDocs = await db.entities.CrabDocument.filter({ is_deleted: false });
      if (crab_ids.length > 0) {
        existingDocs = existingDocs.filter(d =>
          (d.crab_ids || []).some(id => crab_ids.includes(id))
        );
      }
    } else {
      existingDocs = await db.entities.Document.filter({ is_deleted: false });
    }

    // Exclude self
    if (exclude_id) {
      existingDocs = existingDocs.filter(d => d.id !== exclude_id);
    }

    const normNew = normFilename(normalized_filename);
    const matchReasons = [];
    let duplicateStatus = 'none';
    let suggestedAction = null;
    let confidence = 'low';
    let matchedDoc = null;
    let duplicateGroupId = null;
    let versionGroupId = null;
    let versionNumber = 1;
    let previousVersionId = null;
    const candidateIds = [];

    // -----------------------------------------------------------------------
    // Pass 1 — Exact duplicate checks
    // -----------------------------------------------------------------------
    for (const doc of existingDocs) {
      const normExisting = normFilename(doc.normalized_filename || doc.original_filename);
      const sizeMatch = file_size && doc.file_size && Math.abs(doc.file_size - file_size) < 512;
      const modMatch = source_modified_at && doc.source_modified_at &&
        Math.abs(new Date(doc.source_modified_at) - new Date(source_modified_at)) < 2000;
      const hashMatch = content_hash && doc.content_hash && content_hash === doc.content_hash;
      const nameMatch = normNew && normExisting && normNew === normExisting;

      // Rule 1a: Hash match = very high confidence exact duplicate
      if (hashMatch) {
        matchReasons.push('content_hash_match');
        if (nameMatch) matchReasons.push('filename_match');
        duplicateStatus = 'exact_duplicate';
        suggestedAction = 'flag_duplicate';
        confidence = 'high';
        matchedDoc = doc;
        candidateIds.push(doc.id);
        duplicateGroupId = doc.duplicate_group_id || generateGroupId();
        break;
      }

      // Rule 1b: name + size + modtime = exact duplicate
      if (nameMatch && sizeMatch && modMatch) {
        matchReasons.push('filename_match', 'filesize_match', 'modified_time_match');
        duplicateStatus = 'exact_duplicate';
        suggestedAction = 'flag_duplicate';
        confidence = 'high';
        matchedDoc = doc;
        candidateIds.push(doc.id);
        duplicateGroupId = doc.duplicate_group_id || generateGroupId();
        break;
      }

      // Rule 1c: name + size (no mod time available)
      if (nameMatch && sizeMatch && !source_modified_at) {
        matchReasons.push('filename_match', 'filesize_match');
        duplicateStatus = 'exact_duplicate';
        suggestedAction = 'flag_duplicate';
        confidence = 'medium';
        matchedDoc = doc;
        candidateIds.push(doc.id);
        duplicateGroupId = doc.duplicate_group_id || generateGroupId();
        break;
      }

      // Rule 2: size + modtime match but different name = renamed duplicate
      if (!nameMatch && sizeMatch && modMatch) {
        matchReasons.push('filesize_match', 'modified_time_match', 'filename_differs');
        duplicateStatus = 'renamed_duplicate';
        suggestedAction = 'ask_filename_choice';
        confidence = 'high';
        matchedDoc = doc;
        candidateIds.push(doc.id);
        duplicateGroupId = doc.duplicate_group_id || generateGroupId();
        break;
      }

      // Rule 2b: hash match but name differs = renamed
      if (hashMatch && !nameMatch) {
        matchReasons.push('content_hash_match', 'filename_differs');
        duplicateStatus = 'renamed_duplicate';
        suggestedAction = 'ask_filename_choice';
        confidence = 'high';
        matchedDoc = doc;
        candidateIds.push(doc.id);
        duplicateGroupId = doc.duplicate_group_id || generateGroupId();
        break;
      }
    }

    // -----------------------------------------------------------------------
    // Pass 2 — Version detection (only if no duplicate found)
    // -----------------------------------------------------------------------
    if (duplicateStatus === 'none') {
      // Find docs with similar filename (normalised similarity), same crab/category/date
      const versionCandidates = existingDocs.filter(doc => {
        const normExisting = normFilename(doc.normalized_filename || doc.original_filename);
        if (!normExisting || !normNew) return false;

        // Similar name: one contains the other, or they share a long common prefix (>60% of longer)
        const longer = Math.max(normNew.length, normExisting.length);
        const shorter = Math.min(normNew.length, normExisting.length);
        const containsMatch = normNew.includes(normExisting) || normExisting.includes(normNew);

        // Count common leading chars
        let commonLen = 0;
        while (commonLen < shorter && normNew[commonLen] === normExisting[commonLen]) commonLen++;
        const prefixRatio = longer > 0 ? commonLen / longer : 0;

        const nameSimilar = containsMatch || prefixRatio > 0.6;

        const sameCategory = category && doc.category && category === doc.category;
        const sameDate = document_date && doc.document_date && document_date === doc.document_date;
        const sameCrab = crab_ids.length > 0 &&
          (doc.crab_ids || []).some(id => crab_ids.includes(id));

        // Need name similarity PLUS at least one contextual signal
        return nameSimilar && (sameCategory || sameDate || sameCrab);
      });

      if (versionCandidates.length > 0) {
        // Pick the most recent as the "previous" version
        versionCandidates.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
        const latestExisting = versionCandidates[0];

        duplicateStatus = 'possible_version';
        suggestedAction = 'keep_as_new_version';
        confidence = 'medium';
        matchedDoc = latestExisting;
        candidateIds.push(...versionCandidates.map(d => d.id));
        matchReasons.push('similar_filename');

        // Determine version group
        versionGroupId = latestExisting.version_group_id || generateGroupId();

        // Compute new version number
        const allInGroup = existingDocs.filter(d =>
          d.version_group_id === versionGroupId || versionCandidates.some(vc => vc.id === d.id)
        );
        const maxVersion = allInGroup.reduce((m, d) => Math.max(m, d.version_number || d.version || 1), 0);
        versionNumber = maxVersion + 1;
        previousVersionId = latestExisting.id;

        if (latestExisting.document_date === document_date) matchReasons.push('same_document_date');
        if (latestExisting.category === category) matchReasons.push('same_category');
      }
    }

    return Response.json({
      duplicate_status: duplicateStatus,
      duplicate_group_id: duplicateGroupId,
      version_group_id: versionGroupId,
      version_number: duplicateStatus === 'possible_version' ? versionNumber : 1,
      previous_version_id: duplicateStatus === 'possible_version' ? previousVersionId : null,
      duplicate_candidate_ids: candidateIds,
      duplicate_match_reason: matchReasons.join(', ') || null,
      suggested_action: suggestedAction,
      confidence,
      match_reasons: matchReasons,
      matched_doc: matchedDoc ? {
        id: matchedDoc.id,
        title: matchedDoc.title,
        original_filename: matchedDoc.original_filename,
        file_size: matchedDoc.file_size,
        source_modified_at: matchedDoc.source_modified_at,
        created_date: matchedDoc.created_date,
        duplicate_group_id: matchedDoc.duplicate_group_id,
        version_group_id: matchedDoc.version_group_id,
      } : null,
    });

  } catch (error) {
    console.error('detectDuplicates error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});