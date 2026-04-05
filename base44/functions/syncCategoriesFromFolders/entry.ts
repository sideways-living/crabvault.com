import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  
  try {
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
  } catch {
    // Called from automation
  }

  const db = base44.asServiceRole;
  const folders = await db.entities.Folder.list();
  const existingCategories = await db.entities.Category.list();
  const existingCategoryNames = new Set(existingCategories.map(c => c.name));

  const categoriesToCreate = new Set();

  // Add Receipts and Business Cards if they exist as root folders
  folders.forEach(f => {
    if (!f.parent_folder_id) {
      const name = f.name.toLowerCase();
      if (name === 'receipts' || name === 'business cards') {
        categoriesToCreate.add(f.name);
      }
      
      // For Documents, Images, Movies: add 2nd level folders as categories
      if (['documents', 'images', 'movies'].includes(name)) {
        folders.forEach(child => {
          if (child.parent_folder_id === f.id) {
            categoriesToCreate.add(child.name);
          }
        });
      }
    }
  });

  // Create missing categories
  for (const catName of categoriesToCreate) {
    if (!existingCategoryNames.has(catName)) {
      await db.entities.Category.create({ name: catName });
      existingCategoryNames.add(catName);
    }
  }

  return Response.json({
    message: `Synced ${categoriesToCreate.size} categories from folder structure`,
    created: Array.from(categoriesToCreate).filter(c => !existingCategories.some(ec => ec.name === c)).length
  });
});