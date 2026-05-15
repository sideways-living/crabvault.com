import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function normFilename(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[_\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\.(pdf|docx|xlsx|pptx|jpg|jpeg|png|heic|txt|other)$/i, '')
    .trim();
}

async function sha256Hex(arrayBuffer) {
  const hashBuf = await crypto.subtle.digest('SHA-256', arrayBuffer);
  return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  try {
    const apiKey = req.headers.get('x-api-key');
    if (apiKey !== Deno.env.get('INGEST_API_KEY')) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file');
    const filename = formData.get('filename') || file?.name || 'document';
    const sourceModifiedAt = formData.get('source_modified_at') || null;

    if (!file) {
      return Response.json({ error: 'No file provided' }, { status: 400 });
    }

    const ext = filename.split('.').pop()?.toLowerCase() || 'other';
    const fileType = ['pdf', 'docx', 'xlsx', 'pptx', 'txt', 'jpg', 'jpeg', 'png', 'heic'].includes(ext) ? ext : 'other';
    const fileSize = file.size || 0;
    const normalizedFilename = normFilename(filename);

    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole;

    // Compute content hash
    let contentHash = null;
    try {
      const fileBytes = await file.arrayBuffer();
      contentHash = await sha256Hex(fileBytes);
    } catch (e) {
      console.warn(`⚠️  Could not compute content hash: ${e.message}`);
    }

    // Upload the file
    const { file_url } = await db.integrations.Core.UploadFile({ file });

    // Run duplicate detection
    let dupDetection = {
      duplicate_status: 'none',
      duplicate_group_id: null,
      version_group_id: null,
      version_number: 1,
      previous_version_id: null,
      duplicate_candidate_ids: [],
      duplicate_match_reason: null,
      suggested_action: null,
      confidence: 'low',
      match_reasons: [],
    };

    try {
      const dupResponse = await base44.functions.invoke('detectDuplicates', {
        entity_type: 'Document',
        normalized_filename: normalizedFilename,
        file_size: fileSize,
        source_modified_at: sourceModifiedAt,
        content_hash: contentHash,
      });
      if (dupResponse.data && !dupResponse.data.error) {
        dupDetection = dupResponse.data;
      }
    } catch (e) {
      console.warn(`⚠️  Duplicate detection failed: ${e.message}`);
    }

    const isDuplicate = ['exact_duplicate', 'renamed_duplicate'].includes(dupDetection.duplicate_status);
    const isVersion = dupDetection.duplicate_status === 'possible_version';
    const versionNumber = dupDetection.version_number || 1;
    const previousVersionId = dupDetection.previous_version_id;

    // Mark previous latest version
    if (isVersion && previousVersionId) {
      try {
        await db.entities.Document.update(previousVersionId, { is_latest_version: false });
      } catch (e) {
        console.warn(`Could not update previous version: ${e.message}`);
      }
    }

    const title = filename.replace(/\.[^/.]+$/, '');

    const doc = await db.entities.Document.create({
      title: versionNumber > 1 ? `${title} (v${versionNumber})` : title,
      file_url,
      original_filename: filename,
      normalized_filename: normalizedFilename,
      file_type: fileType,
      file_size: fileSize,
      source_modified_at: sourceModifiedAt || undefined,
      content_hash: contentHash || undefined,
      processing_status: isDuplicate ? 'needs_review' : 'pending',
      version_number: versionNumber,
      version_group_id: dupDetection.version_group_id || undefined,
      previous_version_id: previousVersionId || undefined,
      is_latest_version: !isDuplicate,
      duplicate_status: dupDetection.duplicate_status || 'none',
      duplicate_group_id: dupDetection.duplicate_group_id || undefined,
      duplicate_candidate_ids: dupDetection.duplicate_candidate_ids?.length > 0 ? dupDetection.duplicate_candidate_ids : undefined,
      duplicate_match_reason: dupDetection.duplicate_match_reason || undefined,
      duplicate_review_status: isDuplicate ? 'pending_review' : 'not_required',
    });

    // Create DuplicateReview record if flagged
    if (isDuplicate || isVersion) {
      const reviewType = dupDetection.duplicate_status === 'exact_duplicate' ? 'exact_duplicate'
        : dupDetection.duplicate_status === 'renamed_duplicate' ? 'renamed_duplicate'
        : 'possible_version';

      await db.entities.DuplicateReview.create({
        review_type: reviewType,
        status: 'pending',
        primary_document_id: doc.id,
        candidate_document_ids: dupDetection.duplicate_candidate_ids || [],
        duplicate_group_id: dupDetection.duplicate_group_id || undefined,
        version_group_id: dupDetection.version_group_id || undefined,
        match_score: dupDetection.confidence === 'high' ? 1.0 : dupDetection.confidence === 'medium' ? 0.7 : 0.4,
        match_reasons: dupDetection.match_reasons || [],
        suggested_action: dupDetection.suggested_action || 'manual_review',
      });
    }

    console.log(`✅  Document created: ${doc.id} [dup: ${dupDetection.duplicate_status}]`);
    return Response.json({
      success: true,
      document_id: doc.id,
      filename,
      duplicate_status: dupDetection.duplicate_status,
      duplicate_flagged: isDuplicate,
      version: versionNumber,
    });

  } catch (error) {
    console.error('❌  Ingest error:', error.message, error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});