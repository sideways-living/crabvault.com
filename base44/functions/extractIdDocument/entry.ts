import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ID_SCHEMAS = {
  "Birth Certificate": {
    prompt: "Extract the following from this birth certificate: country of birth, date of birth (YYYY-MM-DD), and place of birth (town/city).",
    schema: {
      country_of_birth: { type: ["string", "null"] },
      date_of_birth: { type: ["string", "null"] },
      place_of_birth: { type: ["string", "null"] },
    },
    fields: ["country_of_birth", "date_of_birth", "place_of_birth"],
  },
  "Notice of Assessment": {
    prompt: "Extract the following from this ATO Notice of Assessment: TFN (Tax File Number, 9 digits) and the address shown on the document.",
    schema: {
      tfn: { type: ["string", "null"] },
      address: { type: ["string", "null"] },
    },
    fields: ["tfn", "address"],
  },
  "Rental Agreement": {
    prompt: "Extract the full property address used in this rental/lease agreement.",
    schema: {
      address: { type: ["string", "null"] },
    },
    fields: ["address"],
  },
  "Drivers Licence": {
    prompt: "Extract the following from this Australian driver licence: licence number, card number, expiry date (MM/YYYY or DD/MM/YYYY as shown), address, and date of birth (YYYY-MM-DD).",
    schema: {
      licence_number: { type: ["string", "null"] },
      card_number: { type: ["string", "null"] },
      expiry: { type: ["string", "null"] },
      address: { type: ["string", "null"] },
      date_of_birth: { type: ["string", "null"] },
    },
    fields: ["licence_number", "card_number", "expiry", "address", "date_of_birth"],
  },
  "Photo Card": {
    prompt: "Extract the following from this photo card: date of birth (YYYY-MM-DD), address, card number, and PC number (Photo Card number).",
    schema: {
      date_of_birth: { type: ["string", "null"] },
      address: { type: ["string", "null"] },
      card_number: { type: ["string", "null"] },
      pc_number: { type: ["string", "null"] },
    },
    fields: ["date_of_birth", "address", "card_number", "pc_number"],
  },
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { document_id, id_type } = await req.json();
    if (!document_id || !id_type) return Response.json({ error: 'document_id and id_type required' }, { status: 400 });

    const schema = ID_SCHEMAS[id_type];
    if (!schema) return Response.json({ error: `Unknown id_type: ${id_type}` }, { status: 400 });

    const docs = await base44.asServiceRole.entities.CrabDocument.filter({ id: document_id });
    const doc = docs[0];
    if (!doc) return Response.json({ error: 'Document not found' }, { status: 404 });

    const SUPPORTED_TYPES = ["pdf", "jpg", "jpeg", "png", "heic"];
    if (!doc.file_url || !SUPPORTED_TYPES.includes((doc.file_type || "").toLowerCase())) {
      return Response.json({ error: 'Document type not supported for AI extraction (supported: PDF, JPG, PNG, HEIC)' }, { status: 400 });
    }

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: schema.prompt + "\n\nOnly return fields you can clearly see in the document. Return null for anything not visible.",
      file_urls: [doc.file_url],
      response_json_schema: {
        type: "object",
        properties: schema.schema,
      },
    });

    return Response.json({ extracted: result, fields: schema.fields });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});