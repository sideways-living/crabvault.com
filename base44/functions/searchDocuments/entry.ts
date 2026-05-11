import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Full-text search across CrabDocument records.
 * Searches: extracted_text, title, summary, notes, tags, original_filename
 *
 * Body: { query: string, limit?: number }
 * Returns: { results: [...], total: number, query: string }
 */

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const user = await base44.auth.me();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const query = (body.query || '').trim().toLowerCase();
  const limit = Math.min(body.limit || 50, 200);

  if (!query) {
    return Response.json({ results: [], total: 0, query: '' });
  }

  const db = base44.asServiceRole;

  // Fetch all non-deleted docs in batches (full-text search is client-side)
  const allDocs = await db.entities.CrabDocument.filter({ is_deleted: false }, '-created_date', 500);

  const terms = query.split(/\s+/).filter(Boolean);

  const scored = [];

  for (const doc of allDocs) {
    const searchableFields = [
      doc.extracted_text || '',
      doc.title || '',
      doc.summary || '',
      doc.notes || '',
      doc.original_filename || '',
      (doc.tags || []).join(' '),
      doc.category || '',
    ];

    const fullText = searchableFields.join(' ').toLowerCase();

    // Score: each term match adds points; exact phrase match is a bonus
    let score = 0;
    let matchedTerms = 0;

    for (const term of terms) {
      const occurrences = (fullText.match(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
      if (occurrences > 0) {
        matchedTerms++;
        score += occurrences;
        // Boost if found in title
        if ((doc.title || '').toLowerCase().includes(term)) score += 5;
        // Boost if found in summary
        if ((doc.summary || '').toLowerCase().includes(term)) score += 2;
      }
    }

    // Only include if ALL terms matched
    if (matchedTerms === terms.length) {
      // Bonus for exact phrase match
      if (terms.length > 1 && fullText.includes(query)) score += 10;

      // Build a short snippet from extracted_text around the first match
      let snippet = null;
      if (doc.extracted_text) {
        const firstTerm = terms[0];
        const idx = doc.extracted_text.toLowerCase().indexOf(firstTerm);
        if (idx !== -1) {
          const start = Math.max(0, idx - 80);
          const end = Math.min(doc.extracted_text.length, idx + 160);
          snippet = (start > 0 ? '…' : '') + doc.extracted_text.slice(start, end).trim() + (end < doc.extracted_text.length ? '…' : '');
        }
      }

      scored.push({
        id: doc.id,
        title: doc.title,
        original_filename: doc.original_filename,
        category: doc.category,
        document_date: doc.document_date,
        processing_status: doc.processing_status,
        crab_ids: doc.crab_ids || [],
        summary: doc.summary,
        tags: doc.tags || [],
        snippet,
        score,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const results = scored.slice(0, limit);

  return Response.json({ results, total: scored.length, query });
});