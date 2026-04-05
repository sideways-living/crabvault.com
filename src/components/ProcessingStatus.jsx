import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { FileText, Loader2, ChevronUp, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ProcessingStatus() {
  const [currentDoc, setCurrentDoc] = useState(null);
  const [expanded, setExpanded] = useState(true);
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    const checkProcessing = async () => {
      const docs = await base44.entities.Document.filter(
        { processing_status: 'processing' },
        '-updated_date',
        1
      );
      setCurrentDoc(docs[0] || null);

      // Fetch logs for current document
      if (docs[0]) {
        const docLogs = await base44.entities.ProcessingLog.filter(
          { document_id: docs[0].id },
          'created_date',
          50
        );
        setLogs(docLogs);
      } else {
        setLogs([]);
      }
    };

    checkProcessing();
    const interval = setInterval(checkProcessing, 1000);
    return () => clearInterval(interval);
  }, []);

  if (!currentDoc) return null;

  return (
    <div className="fixed bottom-6 right-6 z-40 bg-card border rounded-xl shadow-xl overflow-hidden" style={{ width: 560, maxHeight: 280 }}>
      {/* Header */}
      <div className="flex items-center justify-between bg-muted/40 px-4 py-3 border-b">
        <div className="flex items-center gap-2 min-w-0">
          <Loader2 className="h-4 w-4 animate-spin shrink-0 text-primary" />
          <span className="text-sm font-medium truncate">{currentDoc.title}</span>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-1 hover:bg-muted rounded transition-colors"
        >
          <ChevronUp className={cn("h-4 w-4 transition-transform", !expanded && "rotate-180")} />
        </button>
      </div>

      {expanded && (
        <div className="flex h-64">
          {/* Left: Document Preview */}
          <div className="w-32 shrink-0 border-r bg-muted/20 flex items-center justify-center overflow-hidden">
            {currentDoc.preview_url ? (
              <img
                src={currentDoc.preview_url}
                alt={currentDoc.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="flex flex-col items-center gap-1 text-center px-2">
                <FileText className="h-6 w-6 text-muted-foreground" />
                <p className="text-[10px] text-muted-foreground font-medium truncate">
                  {currentDoc.title?.substring(0, 12)}
                </p>
              </div>
            )}
          </div>

          {/* Right: Task Log */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 text-xs">
              {logs.length === 0 ? (
                <div className="text-muted-foreground italic">Starting...</div>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="flex gap-2">
                    {log.status === 'completed' && <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0 mt-0.5" />}
                    {log.status === 'failed' && <AlertCircle className="h-3 w-3 text-destructive shrink-0 mt-0.5" />}
                    {log.status === 'in_progress' && <Loader2 className="h-3 w-3 text-primary animate-spin shrink-0 mt-0.5" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-muted-foreground">{log.task}</p>
                      {log.details && <p className="text-[10px] text-destructive mt-0.5">{log.details}</p>}
                    </div>
                  </div>
                ))
              )}
            </div>
            
            {/* Progress indicator */}
            <div className="px-3 py-2 bg-muted/20 border-t text-[10px] text-muted-foreground">
              {currentDoc.file_type && `${currentDoc.file_type.toUpperCase()} • `}
              {currentDoc.file_size && `${(currentDoc.file_size / 1024).toFixed(0)} KB`}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}