import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

export default function ProcessDocumentButton({ document, categories, folders, onProcessed }) {
  const [processing, setProcessing] = useState(false);

  const handleProcess = async () => {
    setProcessing(true);
    await base44.entities.Document.update(document.id, { processing_status: "processing" });

    const categoryList = categories.map(c => `${c.id}: ${c.name} - ${c.description}`).join("\n");
    const folderList = folders.map(f => `${f.id}: ${f.path || f.name}`).join("\n");

    const prompt = `Analyze this document and provide:
1. A concise summary (2-3 sentences)
2. The best matching category ID from this list:
${categoryList}
3. The best matching folder ID from this list (or null if none fit):
${folderList}
4. 3-5 relevant tags for search
5. A suggested document date if detectable (YYYY-MM-DD format) or null

Document title: ${document.title}
Filename: ${document.original_filename}
${document.extracted_text ? `Content preview: ${document.extracted_text.substring(0, 2000)}` : "No text content extracted yet."}`;

    const result = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: "object",
        properties: {
          summary: { type: "string" },
          category_id: { type: "string" },
          folder_id: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          document_date: { type: "string" },
        },
      },
    });

    await base44.entities.Document.update(document.id, {
      summary: result.summary,
      category_id: result.category_id || undefined,
      folder_id: result.folder_id || document.folder_id || undefined,
      tags: result.tags || [],
      document_date: result.document_date || undefined,
      processing_status: "completed",
    });

    toast.success("Document processed successfully");
    setProcessing(false);
    onProcessed?.();
  };

  return (
    <Button onClick={handleProcess} disabled={processing} variant="outline" size="sm">
      {processing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
      {processing ? "Processing..." : "AI Process"}
    </Button>
  );
}