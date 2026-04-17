import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

/**
 * Creates a copy of a document with processing_status='needs_review'
 * so it can be filed in a different location.
 * Returns the new document record.
 */
export async function duplicateDocument(doc) {
  const copy = await base44.entities.Document.create({
    title: doc.title,
    file_url: doc.file_url,
    preview_url: doc.preview_url,
    original_filename: doc.original_filename,
    file_type: doc.file_type,
    file_size: doc.file_size,
    summary: doc.summary,
    extracted_text: doc.extracted_text,
    tags: doc.tags,
    ai_data: doc.ai_data,
    document_date: doc.document_date,
    notes: doc.notes,
    processing_status: "needs_review",
  });
  toast.success("Duplicate created — check the Review Queue to file it");
  return copy;
}