import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

export default function ProcessDocumentButton({ document, categories, folders, onProcessed }) {
  const [processing, setProcessing] = useState(false);

  const handleProcess = async () => {
    setProcessing(true);
    try {
      await base44.functions.invoke('processSingleDocument', { documentId: document.id });
      toast.success('Document processed and sent to review queue');
      onProcessed?.();
    } catch (error) {
      toast.error(error.message || 'Processing failed');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Button onClick={handleProcess} disabled={processing} variant="outline" size="sm">
      {processing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
      {processing ? "Processing..." : "AI Process"}
    </Button>
  );
}