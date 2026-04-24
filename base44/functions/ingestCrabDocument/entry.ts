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

    // Upload file to storage
    const ext = filename.split('.').pop()?.toLowerCase() || 'other';
    const fileType = ['pdf', 'docx', 'xlsx', 'jpg', 'jpeg', 'png', 'heic', 'txt', 'psd'].includes(ext) ? ext : 'other';
    const { file_url } = await db.integrations.Core.UploadFile({ file });

    let crabId = existingCrabId;
    let crabName;
    let isNew = false;

    if (!crabId) {
      // Create new Crab profile
      const fullName = buildFullName(firstName, middleName, surname);
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
      crabId = newCrab.id;
      crabName = fullName;
      isNew = true;
      console.log(`✅  Created new Crab profile: ${fullName} (${crabId})`);
    } else {
      const existing = await db.entities.Crab.filter({ id: crabId }, 'full_name', 1);
      crabName = existing[0]?.full_name || surname;
    }

    // Build vault path: /documents/SURNAME Firstname/filename
    const folderName = surname
      ? `${surname.toUpperCase()}${firstName ? ' ' + firstName : ''}`
      : crabName;
    const vaultPath = `/documents/${folderName}/${filename}`;

    // Dedup: skip if same file already pending for this crab
    const existing = await db.entities.CrabDocument.filter({ original_filename: filename });
    const active = existing.filter(d => !d.is_deleted && (d.crab_ids || []).includes(crabId));
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