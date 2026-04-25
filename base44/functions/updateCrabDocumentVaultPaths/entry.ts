import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin only' }, { status: 403 });
    }

    const db = base44.asServiceRole;

    // Fetch all CrabDocuments
    const allDocs = await db.entities.CrabDocument.list('-created_date', 1000);
    const crabs = await db.entities.Crab.list('full_name', 500);

    let updated = 0;

    for (const doc of allDocs) {
      if (doc.is_deleted) continue;

      // Get primary crab (first in crab_ids array)
      const primaryCrabId = (doc.crab_ids || [])[0];
      if (!primaryCrabId) continue;

      const primaryCrab = crabs.find(c => c.id === primaryCrabId);
      if (!primaryCrab) continue;

      // Build new vault path: /crabs/Firstname Middlename SURNAME/documents/filename
      const crabFolder = [primaryCrab.first_name, primaryCrab.middle_name, primaryCrab.surname?.toUpperCase()].filter(Boolean).join(' ');
      const newVaultPath = `/crabs/${crabFolder}/documents/${doc.original_filename || doc.title}`;

      // Only update if different
      if (newVaultPath !== doc.vault_path) {
        await db.entities.CrabDocument.update(doc.id, { vault_path: newVaultPath });
        console.log(`✅ Updated: ${doc.id} → ${newVaultPath}`);
        updated++;
      }
    }

    return Response.json({
      success: true,
      message: `Updated ${updated} document vault path(s)`,
      updated,
    });
  } catch (error) {
    console.error('Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});