import { useState } from "react";
import { FileText, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DocumentPreviewPanel({ doc }) {
  const [rotation, setRotation] = useState(0);

  return (
    <div className="flex flex-col h-full bg-card border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b px-4 py-3 bg-muted/40 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="text-xs font-mono text-muted-foreground truncate">{doc.original_filename || doc.title}</span>
          {doc.file_type && (
            <span className="text-xs uppercase font-semibold bg-muted px-1.5 py-0.5 rounded shrink-0">
              {doc.file_type}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button 
            onClick={() => setRotation(r => (r + 90) % 360)}
            className="text-xs px-2 py-1 rounded bg-muted hover:bg-muted/80 text-muted-foreground"
          >
            ↻ Rotate
          </button>
          {doc.file_url && (
            <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>
      </div>

      {/* Preview Area */}
      <div className="flex-1 overflow-auto bg-muted/20">
        {doc.file_url ? (
          doc.file_type?.toLowerCase() === 'pdf' ? (
            <iframe
              src={doc.file_url}
              title={doc.title}
              style={{ width: "100%", height: "100%", border: "none", transform: `rotate(${rotation}deg) scaleY(-1)`, transformOrigin: "center" }}
            />

          ) : ["jpg", "jpeg", "png", "gif", "webp"].includes(doc.file_type?.toLowerCase()) ? (
            <div style={{ transform: `rotate(${rotation}deg) scaleY(-1)`, transformOrigin: "center" }}>
              <img
                src={doc.file_url}
                alt={doc.title}
                style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
              />
            </div>
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