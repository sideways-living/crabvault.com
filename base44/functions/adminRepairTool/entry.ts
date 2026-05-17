import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * adminRepairTool — admin-only diagnostic and repair function.
 *
 * Finds and flags (NEVER deletes) unsafe items:
 * 1. Duplicate Crab profiles by normalized name
 * 2. Documents whose AI-processed hash doesn't match current/original hash
 * 3. Documents where preview/summary are out of sync with file_url
 * 4. Documents with missing or invalid vault_path (when crab-linked)
 * 5. Documents marked synced_to_vault=true without verified hash/size
 *
 * All unsafe items are moved to processing_status=needs_review.
 * Nothing is deleted.
 *
 * Payload:
 *   dry_run — boolean (default false): if true, report only, don't mutate
 */

function normKey(s) {
  return (s || '').trim().toLowerCase().replace(/[''`.,\-]/g, '').replace(/\s+/g, ' ').trim();
}
function computeKeys(firstName, middleName, surname) {
  const fk = normKey(firstName);
  const mk = normKey(middleName);
  const sk = normKey(surname);
  const name_key = [fk, mk, sk].filter(Boolean).join('|');
  const surname_first_key = [sk, fk].filter(Boolean).join('|');
  return { name_key, surname_first_key };
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const user = await base44.auth.me();
  if (user?.role !== 'admin') {
    return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
  }

  const db = base44.asServiceRole;
  const body = await req.json().catch(() => ({}));
  const dryRun = body.dry_run === true;

  const report = {
    dry_run: dryRun,
    timestamp: new Date().toISOString(),
    duplicate_profiles: [],
    stale_ai_results: [],
    missing_preview_sync: [],
    invalid_vault_paths: [],
    unverified_synced_docs: [],
    actions_taken: [],
  };

  // -------------------------------------------------------------------------
  // 1. Duplicate Crab profiles
  // -------------------------------------------------------------------------
  const allCrabs = await db.entities.Crab.filter({ is_deleted: false });
  const nameKeyMap = {};
  for (const crab of allCrabs) {
    const { name_key } = computeKeys(crab.first_name, crab.middle_name, crab.surname);
    if (!name_key) continue;
    if (!nameKeyMap[name_key]) nameKeyMap[name_key] = [];
    nameKeyMap[name_key].push({ id: crab.id, full_name: crab.full_name || crab.surname,
      created_date: crab.created_date, name_key });
  }
  for (const [key, entries] of Object.entries(nameKeyMap)) {
    if (entries.length > 1) {
      entries.sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
      report.duplicate_profiles.push({
        name_key: key,
        count: entries.length,
        oldest_id: entries[0].id,
        duplicates: entries.slice(1).map(e => e.id),
        full_name: entries[0].full_name,
      });
    }
  }

  // -------------------------------------------------------------------------
  // 2 & 3 & 4 & 5. Document integrity checks
  // -------------------------------------------------------------------------
  const allDocs = await db.entities.CrabDocument.filter({ is_deleted: false });

  const unsafeIds = new Set();

  for (const doc of allDocs) {
    // Check 2: AI processed hash ≠ current content hash
    if (doc.ai_processed_content_hash && doc.content_hash &&
        doc.ai_processed_content_hash !== doc.content_hash) {
      report.stale_ai_results.push({
        id: doc.id, title: doc.title,
        ai_processed_content_hash: doc.ai_processed_content_hash,
        current_content_hash: doc.content_hash,
        reason: 'ai_hash_differs_from_current_hash',
      });
      unsafeIds.add(doc.id);
    }

    // Also check against original_content_hash if available
    if (doc.ai_processed_content_hash && doc.original_content_hash &&
        doc.ai_processed_content_hash !== doc.original_content_hash &&
        !unsafeIds.has(doc.id)) {
      report.stale_ai_results.push({
        id: doc.id, title: doc.title,
        ai_processed_content_hash: doc.ai_processed_content_hash,
        original_content_hash: doc.original_content_hash,
        reason: 'ai_hash_differs_from_original_hash',
      });
      unsafeIds.add(doc.id);
    }

    // Check 3: ai_processed_file_url differs from current file_url
    if (doc.summary && doc.ai_processed_file_url && doc.file_url &&
        doc.ai_processed_file_url !== doc.file_url) {
      report.missing_preview_sync.push({
        id: doc.id, title: doc.title,
        ai_processed_file_url: doc.ai_processed_file_url,
        current_file_url: doc.file_url,
        reason: 'summary_bound_to_different_file_url',
      });
      unsafeIds.add(doc.id);
    }

    // Check 4: crab-linked doc without vault_path
    if ((doc.crab_ids || []).length > 0 &&
        (!doc.vault_path || doc.vault_path === '' || doc.vault_path === '/crabs/_To Review/')) {
      report.invalid_vault_paths.push({
        id: doc.id, title: doc.title, vault_path: doc.vault_path || '',
        crab_ids: doc.crab_ids, reason: 'missing_or_invalid_vault_path',
      });
      unsafeIds.add(doc.id);
    }

    // Check 5: synced_to_vault=true but no verified hash on record
    if (doc.synced_to_vault === true && !doc.content_hash && !doc.original_content_hash) {
      report.unverified_synced_docs.push({
        id: doc.id, title: doc.title, vault_path: doc.vault_path,
        reason: 'synced_without_hash_verification',
      });
      unsafeIds.add(doc.id);
    }
  }

  // -------------------------------------------------------------------------
  // Apply repairs (move to needs_review, never delete)
  // -------------------------------------------------------------------------
  if (!dryRun && unsafeIds.size > 0) {
    const repairJobId = crypto.randomUUID();
    for (const docId of unsafeIds) {
      const doc = allDocs.find(d => d.id === docId);
      if (!doc || doc.processing_status === 'needs_review') continue;

      await db.entities.CrabDocument.update(docId, {
        processing_status: 'needs_review',
        processing_error: 'Flagged by admin repair tool — manual review required',
        requires_human_review: true,
        review_reason: 'Admin repair tool: integrity check failed',
      });

      await db.entities.ProcessingLog.create({
        document_id: docId,
        processing_job_id: repairJobId,
        action: 'repair',
        status: 'completed',
        file_url: doc.file_url,
        content_hash: doc.content_hash,
        file_size: doc.file_size,
        details: 'Moved to needs_review by adminRepairTool due to integrity check failure',
      });

      report.actions_taken.push({ document_id: docId, action: 'moved_to_needs_review' });
    }
    console.log(`adminRepairTool: repaired ${report.actions_taken.length} documents`);
  }

  report.summary = {
    duplicate_profile_groups: report.duplicate_profiles.length,
    stale_ai_results: report.stale_ai_results.length,
    missing_preview_sync: report.missing_preview_sync.length,
    invalid_vault_paths: report.invalid_vault_paths.length,
    unverified_synced_docs: report.unverified_synced_docs.length,
    total_unsafe_documents: unsafeIds.size,
    documents_repaired: report.actions_taken.length,
  };

  return Response.json(report);
});