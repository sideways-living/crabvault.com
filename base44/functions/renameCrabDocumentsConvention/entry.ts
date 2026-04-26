import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Renames all CrabDocuments to follow the new naming convention:
 * <Firstname> <Middlename> <SURNAME> - <State/Country> <DocumentType> - <Front/Back>.<ext>
 */

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = base44.asServiceRole;

  try {
    // Fetch all documents and crabs
    const [docs, crabs] = await Promise.all([
      db.entities.CrabDocument.list('-created_date', 1000),
      db.entities.Crab.list('full_name', 1000),
    ]);

    const crabMap = {};
    crabs.forEach(c => {
      crabMap[c.id] = c;
    });

    let updated = 0;
    const results = [];

    for (const doc of docs) {
      if (doc.is_deleted || !doc.crab_ids?.length) continue;

      const primaryCrabId = doc.crab_ids[0];
      const primaryCrab = crabMap[primaryCrabId];

      if (!primaryCrab) continue;

      // Build new filename
      const firstName = primaryCrab.first_name || '';
      const middleName = primaryCrab.middle_name || '';
      const surname = primaryCrab.surname?.toUpperCase() || '';
      
      const crabFolder = [firstName, middleName, surname].filter(Boolean).join(' ');
      const stateOrCountry = primaryCrab.state || primaryCrab.country || '';
      const docType = doc.category || 'Document';
      const cardSide = doc.id_card_side
        ? (doc.id_card_side === 'front' ? 'Front' : doc.id_card_side === 'back' ? 'Back' : 'Both Sides')
        : '';

      const ext = doc.original_filename?.split('.').pop() || 'pdf';

      const newFilename = cardSide
        ? `${crabFolder} - ${stateOrCountry} ${docType} - ${cardSide}.${ext}`
        : `${crabFolder} - ${stateOrCountry} ${docType}.${ext}`;

      const newVaultPath = `/crabs/${crabFolder}/documents/${newFilename}`;

      // Only update if filename changed
      if (newFilename !== doc.original_filename) {
        await db.entities.CrabDocument.update(doc.id, {
          original_filename: newFilename,
          vault_path: newVaultPath,
        });
        updated++;
        results.push({
          id: doc.id,
          old_filename: doc.original_filename,
          new_filename: newFilename,
        });
        console.log(`✅ Renamed: ${doc.original_filename} → ${newFilename}`);
      }
    }

    return Response.json({
      success: true,
      message: `Renamed ${updated} document(s)`,
      updated,
      results,
    });
  } catch (error) {
    console.error('Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});