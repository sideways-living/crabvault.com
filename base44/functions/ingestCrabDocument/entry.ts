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
    let firstName = (formData.get('first_name') || '').trim();
    let middleName = (formData.get('middle_name') || '').trim();
    let surname = (formData.get('surname') || '').trim();
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

    // Upload file to storage (do this early so we don't hold the lock)
    const ext = filename.split('.').pop()?.toLowerCase() || 'other';
    const fileType = ['pdf', 'docx', 'xlsx', 'jpg', 'jpeg', 'png', 'heic', 'txt', 'psd'].includes(ext) ? ext : 'other';
    const { file_url } = await db.integrations.Core.UploadFile({ file });

    // AI verification — always run for supported file types to confirm identity and correct filename hint
    if (aiIdentify && !existingCrabId) {
      const isImage = ['jpg', 'jpeg', 'png', 'heic'].includes(ext);
      const isPdf = ext === 'pdf';
      if (isImage || isPdf) {
        const hint = [firstName, middleName, surname].filter(Boolean).join(' ');
        console.log(`🤖  AI verifying document: ${filename}${hint ? ` (hint: ${hint})` : ''}`);
        try {
          // Fetch available document types (categories)
          const categories = await db.entities.Category.list();
          const categoryOptions = categories.map(c => c.name).join(', ');

          const result = await db.integrations.Core.InvokeLLM({
            prompt: `Analyse this document carefully and extract:
1. The full name of the primary person it belongs to or is addressed to (e.g. the account holder, recipient, patient, or subject).
2. A descriptive title for the document.
3. The document type — MUST choose from the available types below based on what the document actually contains.

Filename: "${filename}"
${hint ? `Name hint from filename/folder: "${hint}" — use this as a strong hint but correct it if the document clearly shows a different name.` : 'No name hint available — identify from document content only.'}

Available document types: ${categoryOptions}

CRITICAL: Read the document content and filename carefully. Match to the category that best describes what this document IS, not a generic label. For example:
- A photo ID card, driver licence, passport → match to "id" or similar
- A bank statement, account statement → match to a banking/finance category
- Medical records, prescriptions → match to a medical category
- Correspondence, letters → match to a correspondence category

Return JSON with: first_name, middle_name, surname, document_title, document_type.
- "document_title": a clean descriptive title for this document (e.g. "Westpac Bank Statement March 2024", "Medicare Card", "Centrelink Letter"). Use the document content, not the raw filename.
- "document_type": MUST be exactly one of the available document types listed above. Choose the single category that best matches what the document actually is.
- If you cannot confidently identify the person, return first_name/middle_name/surname as empty strings.`,
            file_urls: [file_url],
            response_json_schema: {
              type: 'object',
              properties: {
                first_name: { type: 'string' },
                middle_name: { type: 'string' },
                surname: { type: 'string' },
                document_title: { type: 'string' },
                document_type: { type: 'string' },
              },
            },
          });
          if (result.surname) {
            firstName = result.first_name || '';
            middleName = result.middle_name || '';
            surname = result.surname;
            console.log(`🤖  AI confirmed: ${[firstName, middleName, surname].filter(Boolean).join(' ')}`);
          } else {
            console.log(`🤖  AI could not identify crab — storing as unassigned`);
            if (!surname) surname = 'UNASSIGNED';
          }
          // Only build an AI filename if the original doesn't already follow "Name - Something.ext" format
          const filenameBase = filename.replace(/\.[^/.]+$/, '');
          const alreadyFormatted = /^.+ - .+/.test(filenameBase);
          if (!alreadyFormatted && result.document_type) {
            const namePart = [result.first_name, result.middle_name, result.surname?.toUpperCase()].filter(Boolean).join(' ');
            const aiFilename = namePart
              ? `${namePart} - ${result.document_type}`
              : result.document_type;
            formData.set('ai_filename', aiFilename);
            console.log(`🤖  AI filename: ${aiFilename}`);
          } else if (alreadyFormatted) {
            console.log(`🤖  Filename already formatted, keeping original: ${filename}`);
          }
          if (result.document_title) {
            formData.set('ai_title', result.document_title);
          }
        } catch (e) {
          console.warn(`🤖  AI verification failed: ${e.message} — using filename hint or unassigned`);
          if (!surname) surname = 'UNASSIGNED';
        }
      } else {
        console.log(`🤖  File type ${ext} not supported for AI — using filename hint`);
        if (!surname) surname = 'UNASSIGNED';
      }
    }

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

    // Build vault path: /crabs/Firstname Middlename SURNAME/documents/filename
    const folderName = [firstName, middleName, surname?.toUpperCase()].filter(Boolean).join(' ');

    // If filename doesn't already start with the crab's name, prepend it
    const filenameBase = filename.replace(/\.[^/.]+$/, '');
    const fileExt2 = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')) : '';
    const startsWithName = filenameBase.toLowerCase().startsWith(folderName.toLowerCase() + ' - ');
    if (!startsWithName && folderName) {
      const prefixed = `${folderName} - ${filename}`;
      formData.set('filename_override', prefixed);
      console.log(`📝  Prepending crab name to filename: ${prefixed}`);
    }

    const vaultPath = `/crabs/${folderName}/documents/${filename}`;

    // Check for existing versions of this filename for this crab (check both original and canonical)
    const existingDocs = await db.entities.CrabDocument.filter({ original_filename: filename });
    const active = existingDocs.filter(d => !d.is_deleted && (d.crab_ids || []).includes(crabId));

    let newVersion = 1;
    let previousVersionId = null;

    if (active.length > 0) {
      // Sort by version descending to find the latest
      active.sort((a, b) => (b.version || 1) - (a.version || 1));
      const latest = active[0];

      // Check file size — if identical size, treat as true duplicate and skip
      if (latest.file_size === (file.size || 0)) {
        console.log(`⚠️  True duplicate (same size): ${filename} already exists for crab ${crabId}`);
        return Response.json({ success: true, document_id: latest.id, crab_id: crabId, duplicate: true });
      }

      // Different content — create a new version
      newVersion = (latest.version || 1) + 1;
      previousVersionId = latest.id;

      // Mark the old version as no longer latest
      await db.entities.CrabDocument.update(latest.id, { is_latest_version: false });

      console.log(`🔄  New version v${newVersion} of: ${filename} for crab ${crabId}`);
    }

    const aiTitle = formData.get('ai_title') || '';
    const aiFilename = formData.get('ai_filename') || '';
    const filenameOverride = formData.get('filename_override') || '';
    // Use AI filename > filename_override > original filename (without ext) for the canonical base
    const fileExt = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')) : '';
    const effectiveFilename = filenameOverride || filename;
    const canonicalBase = aiFilename || effectiveFilename.replace(/\.[^/.]+$/, '');
    const canonicalFilename = `${canonicalBase}${fileExt}`;
    // Rebuild vault path with canonical filename
    const canonicalVaultPath = `/crabs/${folderName}/documents/${canonicalFilename}`;
    const baseTitle = aiTitle || canonicalBase;
    const versionedTitle = newVersion > 1 ? `${baseTitle} (v${newVersion})` : baseTitle;
    const versionedVaultPath = newVersion > 1
      ? canonicalVaultPath.replace(/(\.[^/.]+)$/, ` (v${newVersion})$1`)
      : canonicalVaultPath;

    const doc = await db.entities.CrabDocument.create({
      title: versionedTitle,
      file_url,
      original_filename: canonicalFilename,
      file_type: fileType,
      file_size: file.size || 0,
      crab_ids: [crabId],
      category,
      processing_status: 'pending',
      vault_path: versionedVaultPath,
      ingress_deleted: false,
      synced_to_vault: false,
      version: newVersion,
      previous_version_id: previousVersionId,
      is_latest_version: true,
    });

    console.log(`✅  CrabDocument v${newVersion} created: ${doc.id} → ${versionedVaultPath}`);
    return Response.json({
      success: true,
      document_id: doc.id,
      crab_id: crabId,
      crab_name: crabName,
      vault_path: versionedVaultPath,
      is_new_crab: isNew,
      version: newVersion,
      is_new_version: newVersion > 1,
    });

  } catch (error) {
    console.error('❌  ingestCrabDocument error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});