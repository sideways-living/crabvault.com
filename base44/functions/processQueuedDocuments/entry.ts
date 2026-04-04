import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // Allow scheduled calls (no user) or admin calls
  let isScheduled = false;
  try {
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
  } catch {
    // Called from automation scheduler — use service role
    isScheduled = true;
  }

  const db = isScheduled ? base44.asServiceRole : base44;

  // Find all pending documents
  const allDocs = await db.entities.Document.list();
  const pending = allDocs.filter(d => d.processing_status === 'pending');

  if (pending.length === 0) {
    return Response.json({ message: 'No pending documents', processed: 0 });
  }

  const categories = await db.entities.Category.list();
  const folders = await db.entities.Folder.list();
  const categoryList = categories.map(c => `${c.id}: ${c.name} - ${c.description}`).join('\n');
  const folderList = folders.map(f => `${f.id}: ${f.path || f.name}`).join('\n');

  let processedCount = 0;
  const errors = [];

  for (const doc of pending) {
    await db.entities.Document.update(doc.id, { processing_status: 'processing' });

    const prompt = `Analyze this document and provide:
1. A concise summary (2-3 sentences)
2. The best matching category ID from this list:
${categoryList}
3. The best matching folder ID from this list (or null if none fit):
${folderList}
4. 3-5 relevant tags for search
5. A suggested document date if detectable (YYYY-MM-DD format) or null

Document title: ${doc.title}
Filename: ${doc.original_filename || ''}
${doc.extracted_text ? `Content preview: ${doc.extracted_text.substring(0, 2000)}` : ''}`;

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          summary: { type: 'string' },
          category_id: { type: 'string' },
          folder_id: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          document_date: { type: 'string' },
        },
      },
    });

    // Auto-suggest vault path from folder's vault_path
    let vault_path = doc.vault_path;
    if (!vault_path && result.folder_id) {
      const folder = folders.find(f => f.id === result.folder_id);
      if (folder?.vault_path) {
        vault_path = `${folder.vault_path}/${doc.original_filename || doc.title}`;
      }
    }

    await db.entities.Document.update(doc.id, {
      summary: result.summary,
      category_id: result.category_id || undefined,
      folder_id: result.folder_id || doc.folder_id || undefined,
      tags: result.tags || [],
      document_date: result.document_date || undefined,
      processing_status: 'completed',
      vault_path: vault_path || undefined,
    });

    processedCount++;
  }

  return Response.json({
    message: `Processed ${processedCount} document(s)`,
    processed: processedCount,
    errors,
  });
});