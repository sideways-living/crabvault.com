import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * CrabVault Ingress Function
 * Accepts a file upload, optionally creates a new Crab profile, and saves a CrabDocument.
 *
 * Payload (multipart form-data):
 *   file           — the file binary
 *   filename       — original filename
 *   first_name     — (optional) crab first name
 *   middle_name    — (optional) crab middle name
 *   surname        — required if crab_id not provided
 *   crab_id        — (optional) link to existing crab instead of creating one
 *   category       — (optional) document category, defaults to "other"
 */

function buildFullName(first, middle, surname) {
  const parts = [];
  if (first) parts.push(first.trim());
  if (middle) parts.push(middle.trim());
  if (surname) parts.push(surname.trim().toUpperCase());
  return parts.join(' ');
}

function normStr(s) {
  return (s || '').trim().toLowerCase();
}

/**
 * Find-or-create a Crab profile by name.
 * Searches for existing profiles matching surname + firstName + middleName.
 * If multiple exist (race duplicates), merges them into the oldest and cleans up.
 * Returns { crabId, crabName, isNew }
 */
async function findOrCreateCrab(db, { firstName, middleName, surname }) {
  const fullName = buildFullName(firstName, middleName, surname);

  // Search by surname (most selective field available)
  const matches = await db.entities.Crab.filter({ surname: surname, is_deleted: false });

  // Filter to exact name match
  const exact = matches.filter(c =>
    normStr(c.first_name) === normStr(firstName) &&
    normStr(c.middle_name) === normStr(middleName) &&
    normStr(c.surname) === normStr(surname)
  );

  if (exact.length === 0) {
    // No existing profile — create one
    const newCrab = await db.entities.Crab.create({
      first_name: firstName,
      middle_name: middleName,
      surname: surname,
      full_name: fullName,
      status: 'active',
      aliases: [],
      tags: [],
      id_numbers: [],
      mailing_same_as_residential: true,
      is_deleted: false,
    });
    console.log(`✅  Created new Crab profile: ${fullName} (${newCrab.id})`);
    return { crabId: newCrab.id, crabName: fullName, isNew: true };
  }

  // Sort by created_date ascending — keep the oldest
  exact.sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
  const keeper = exact[0];

  if (exact.length > 1) {
    // Race duplicates found — merge all into the oldest profile
    console.log(`⚠️  Found ${exact.length} duplicate profiles for ${fullName}, merging into ${keeper.id}`);

    const duplicateIds = exact.slice(1).map(c => c.id);

    // Merge non-empty fields from duplicates into keeper (don't overwrite existing data)
    const mergedData = {};
    const mergeFields = ['phone', 'email', 'address1', 'address2', 'suburb', 'state', 'postcode',
      'date_of_birth', 'photo_url', 'emergency_summary', 'notes'];

    for (const dup of exact.slice(1)) {
      for (const field of mergeFields) {
        if (!keeper[field] && !mergedData[field] && dup[field]) {
          mergedData[field] = dup[field];
        }
      }
      // Merge arrays
      if (dup.aliases?.length) mergedData.aliases = [...new Set([...(keeper.aliases || []), ...(mergedData.aliases || []), ...dup.aliases])];
      if (dup.tags?.length) mergedData.tags = [...new Set([...(keeper.tags || []), ...(mergedData.tags || []), ...dup.tags])];
      if (dup.id_numbers?.length) mergedData.id_numbers = [...(keeper.id_numbers || []), ...(mergedData.id_numbers || []), ...dup.id_numbers];
    }

    if (Object.keys(mergedData).length > 0) {
      await db.entities.Crab.update(keeper.id, mergedData);
    }

    // Re-point all documents from duplicates to the keeper
    for (const dupId of duplicateIds) {
      const dupDocs = await db.entities.CrabDocument.filter({ crab_ids: [dupId] });
      for (const doc of dupDocs) {
        if (!doc.is_deleted) {
          const newIds = [...new Set([...(doc.crab_ids || []).filter(id => id !== dupId), keeper.id])];
          await db.entities.CrabDocument.update(doc.id, { crab_ids: newIds });
          console.log(`📎  Reassigned doc ${doc.id} from ${dupId} → ${keeper.id}`);
        }
      }
      // Delete the duplicate profile
      await db.entities.Crab.delete(dupId);
      console.log(`🗑️   Deleted duplicate Crab profile: ${dupId}`);
    }
  }

  console.log(`✅  Using existing Crab profile: ${fullName} (${keeper.id})`);
  return { crabId: keeper.id, crabName: keeper.full_name || fullName, isNew: false };
}

Deno.serve(async (req) => {
  try {
    // API key auth
    const apiKey = req.headers.get('x-api-key');
    if (apiKey !== Deno.env.get('INGEST_API_KEY')) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file');
    const filename = formData.get('filename') || file?.name || 'document';
    const firstName = (formData.get('first_name') || '').trim();
    const middleName = (formData.get('middle_name') || '').trim();
    const surname = (formData.get('surname') || '').trim();
    const existingCrabId = (formData.get('crab_id') || '').trim();
    const category = formData.get('category') || 'other';

    if (!file) {
      return Response.json({ error: 'No file provided' }, { status: 400 });
    }
    if (!existingCrabId && !surname) {
      return Response.json({ error: 'surname or crab_id is required' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole;

    // Upload file to storage (do this early so we don't hold the lock)
    const ext = filename.split('.').pop()?.toLowerCase() || 'other';
    const fileType = ['pdf', 'docx', 'xlsx', 'jpg', 'jpeg', 'png', 'heic', 'txt', 'psd'].includes(ext) ? ext : 'other';
    const { file_url } = await db.integrations.Core.UploadFile({ file });

    let crabId, crabName, isNew;

    if (existingCrabId) {
      // Explicit crab_id provided — use directly
      const existing = await db.entities.Crab.filter({ id: existingCrabId });
      crabId = existingCrabId;
      crabName = existing[0]?.full_name || surname;
      isNew = false;
    } else {
      // Find-or-create with dedup/merge logic
      ({ crabId, crabName, isNew } = await findOrCreateCrab(db, { firstName, middleName, surname }));
    }

    // Build vault path: /documents/SURNAME Firstname/filename
    const folderName = surname
      ? `${surname.toUpperCase()}${firstName ? ' ' + firstName : ''}`
      : crabName;
    const vaultPath = `/documents/${folderName}/${filename}`;

    // Dedup: skip if same filename already exists for this crab
    const existingDocs = await db.entities.CrabDocument.filter({ original_filename: filename });
    const active = existingDocs.filter(d => !d.is_deleted && (d.crab_ids || []).includes(crabId));
    if (active.length > 0) {
      console.log(`⚠️  Duplicate: ${filename} already exists for crab ${crabId}`);
      return Response.json({ success: true, document_id: active[0].id, crab_id: crabId, duplicate: true });
    }

    const doc = await db.entities.CrabDocument.create({
      title: filename.replace(/\.[^/.]+$/, ''),
      file_url,
      original_filename: filename,
      file_type: fileType,
      file_size: file.size || 0,
      crab_ids: [crabId],
      category,
      processing_status: 'pending',
      vault_path: vaultPath,
      ingress_deleted: false,
      synced_to_vault: false,
    });

    console.log(`✅  CrabDocument created: ${doc.id} → ${vaultPath}`);
    return Response.json({
      success: true,
      document_id: doc.id,
      crab_id: crabId,
      crab_name: crabName,
      vault_path: vaultPath,
      is_new_crab: isNew,
    });

  } catch (error) {
    console.error('❌  ingestCrabDocument error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});