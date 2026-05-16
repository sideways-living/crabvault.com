import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * backfillContentHashes — admin function
 *
 * Fetches files for CrabDocument and Document records that have a file_url
 * but no content_hash, computes SHA-256, and saves it.
 *
 * Never changes document status or triggers duplicate detection.
 */

async function sha256Hex(arrayBuffer) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const db = base44.asServiceRole;

    // Load all non-deleted docs from both entities that have file_url but no content_hash
    const [allCrabDocs, allDocs] = await Promise.all([
      db.entities.CrabDocument.filter({ is_deleted: false }),
      db.entities.Document.filter({ is_deleted: false }),
    ]);

    const crabDocsToProcess = allCrabDocs.filter(d => d.file_url && !d.content_hash);
    const docsToProcess = allDocs.filter(d => d.file_url && !d.content_hash);

    console.log(`backfillContentHashes: ${crabDocsToProcess.length} CrabDocuments + ${docsToProcess.length} Documents to process`);

    let updated = 0;
    let skipped = 0;

    async function processDoc(doc, entityObj) {
      try {
        const res = await fetch(doc.file_url);
        if (!res.ok) {
          console.warn(`Skipping ${doc.id} (${doc.original_filename}): HTTP ${res.status}`);
          skipped++;
          return;
        }
        const buf = await res.arrayBuffer();
        const hash = await sha256Hex(buf);
        await entityObj.update(doc.id, { content_hash: hash });
        updated++;
      } catch (err) {
        console.warn(`Skipping ${doc.id} (${doc.original_filename}): ${err.message}`);
        skipped++;
      }
    }

    // Process in small batches to avoid memory pressure
    const BATCH = 10;

    for (let i = 0; i < crabDocsToProcess.length; i += BATCH) {
      await Promise.all(
        crabDocsToProcess.slice(i, i + BATCH).map(d => processDoc(d, db.entities.CrabDocument))
      );
    }

    for (let i = 0; i < docsToProcess.length; i += BATCH) {
      await Promise.all(
        docsToProcess.slice(i, i + BATCH).map(d => processDoc(d, db.entities.Document))
      );
    }

    console.log(`backfillContentHashes complete: updated=${updated} skipped=${skipped}`);

    return Response.json({
      success: true,
      crab_documents_processed: crabDocsToProcess.length,
      documents_processed: docsToProcess.length,
      hashes_updated: updated,
      skipped,
    });

  } catch (error) {
    console.error('backfillContentHashes error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});