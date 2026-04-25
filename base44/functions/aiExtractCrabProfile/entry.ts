import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { crab_id } = await req.json();
    if (!crab_id) return Response.json({ error: 'crab_id required' }, { status: 400 });

    // Fetch the crab profile and their documents
    const [crabs, allDocs] = await Promise.all([
      base44.asServiceRole.entities.Crab.filter({ id: crab_id }, "full_name", 1),
      base44.asServiceRole.entities.CrabDocument.filter({ is_deleted: false }, "-created_date", 500),
    ]);

    const crab = crabs[0];
    if (!crab) return Response.json({ error: 'Crab not found' }, { status: 404 });

    const linkedDocs = allDocs.filter(d => (d.crab_ids || []).includes(crab_id));
    if (linkedDocs.length === 0) {
      return Response.json({ error: 'No documents linked to this profile' }, { status: 400 });
    }

    // Build file_urls list (up to 10 docs to keep prompt manageable)
    const fileUrls = linkedDocs
      .filter(d => d.file_url)
      .slice(0, 10)
      .map(d => d.file_url);

    const existingProfile = {
      first_name: crab.first_name || "",
      middle_name: crab.middle_name || "",
      surname: crab.surname || "",
      date_of_birth: crab.date_of_birth || "",
      phone: crab.phone || "",
      email: crab.email || "",
      address1: crab.address1 || "",
      address2: crab.address2 || "",
      suburb: crab.suburb || "",
      state: crab.state || "",
      postcode: crab.postcode || "",
      aliases: crab.aliases || [],
    };

    const prompt = `You are an intelligence analyst extracting personal information about a subject from their documents.

Existing profile data (may be incomplete or blank):
${JSON.stringify(existingProfile, null, 2)}

Analyse all provided documents carefully and extract the following information about the subject:
- first_name: their first/given name
- middle_name: middle name if found
- surname: family/last name (in ALL CAPS)
- date_of_birth: in YYYY-MM-DD format
- phone: Australian phone number formatted as +61 XXX XXX XXX
- email: email address
- address1: street number and name
- address2: unit/apartment/floor if applicable
- suburb: suburb name in ALL CAPS
- state: state abbreviation (e.g. NSW, VIC, QLD)
- postcode: 4-digit postcode
- aliases: array of any other names used (nicknames, maiden names, middle name variants etc.)
- id_numbers: array of {label, value} objects for any ID numbers found (passport, driver licence, Medicare, TFN etc.)
- notes: any other notable findings from the documents that don't fit above fields (keep concise)
- confidence: overall confidence level as "high", "medium", or "low"
- sources: brief description of what document types provided the key data

Only include fields where you found evidence in the documents. Do not guess or invent information.
For fields where the existing profile already has data and documents confirm it, include it.
For fields where the documents contradict the existing profile, include the document version and note the discrepancy in notes.
Return null for any field you could not find evidence for.`;

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      file_urls: fileUrls,
      response_json_schema: {
        type: "object",
        properties: {
          first_name: { type: ["string", "null"] },
          middle_name: { type: ["string", "null"] },
          surname: { type: ["string", "null"] },
          date_of_birth: { type: ["string", "null"] },
          phone: { type: ["string", "null"] },
          email: { type: ["string", "null"] },
          address1: { type: ["string", "null"] },
          address2: { type: ["string", "null"] },
          suburb: { type: ["string", "null"] },
          state: { type: ["string", "null"] },
          postcode: { type: ["string", "null"] },
          aliases: { type: ["array", "null"], items: { type: "string" } },
          id_numbers: {
            type: ["array", "null"],
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                value: { type: "string" }
              }
            }
          },
          notes: { type: ["string", "null"] },
          confidence: { type: ["string", "null"] },
          sources: { type: ["string", "null"] },
        }
      }
    });

    return Response.json({ extraction: result, doc_count: linkedDocs.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});