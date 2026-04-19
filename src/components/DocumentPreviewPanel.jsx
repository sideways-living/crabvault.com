import { FileText, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DocumentPreviewPanel({ doc }) {
  return (
    <div className="flex flex-col h-full bg-card border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b px-4 py-3 bg-muted/40 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="text-xs font-mono text-muted-foreground truncate">{doc.original_filename || doc.title}</span>
          {doc.file_type && (
            <span className="text-xs uppercase font-semibold bg-muted px-1.5 py-0.5 rounded shrink-0">
              {doc.file_type}
            </span>
          )}
        </div>
        {doc.file_url && (
          <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="shrink-0 hover:text-primary transition-colors ml-2">
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
      </div>

      {/* Preview Area */}
      <div className="flex-1 overflow-auto bg-muted/20 flex items-center justify-center">
        {doc.file_url ? (
          doc.file_type?.toLowerCase() === 'pdf' ? (
            <iframe
              src={doc.file_url}
              title={doc.title}
              style={{ width: "100%", height: "100%", border: "none" }}
            />
          ) : ["jpg", "jpeg", "png", "gif", "webp"].includes(doc.file_type?.toLowerCase()) ? (
            <img
              src={doc.file_url}
              alt={doc.title}
              style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", imageOrientation: 'from-image' }}
            />
          ) : (
            <div className="text-center text-muted-foreground">
              <FileText className="h-16 w-16 opacity-30 mx-auto mb-2" />
              <p className="text-sm">{doc.original_filename}</p>
            </div>
          )
        ) : (
          <div className="text-center text-muted-foreground">
            <FileText className="h-20 w-20 opacity-20 mx-auto mb-2" />
            <p className="text-sm">No file available</p>
          </div>
        )}
      </div>
    </div>
  );
}