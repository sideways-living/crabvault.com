import { useState, useEffect } from "react";
import { FileText, ExternalLink } from "lucide-react";

export default function DocumentPreviewPanel({ doc }) {
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    setRotation(0);
  }, [doc.id]);

  const isPdf = doc.file_type?.toLowerCase() === 'pdf';
  const isImage = ["jpg", "jpeg", "png", "gif", "webp"].includes(doc.file_type?.toLowerCase());

  const effectiveRotation = rotation;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "0.75rem", overflow: "hidden" }}>
      {/* Header — always on top, never rotated */}
      <div style={{ flexShrink: 0, borderBottom: "1px solid var(--border)", padding: "0.75rem 1rem", background: "hsl(var(--muted) / 0.4)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem", zIndex: 2, position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0, flex: 1 }}>
          <FileText style={{ height: 16, width: 16, flexShrink: 0, color: "hsl(var(--muted-foreground))" }} />
          <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "hsl(var(--muted-foreground))", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {doc.original_filename || doc.title}
          </span>
          {doc.file_type && (
            <span style={{ fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 600, background: "hsl(var(--muted))", padding: "0.125rem 0.375rem", borderRadius: "0.25rem", flexShrink: 0 }}>
              {doc.file_type}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", flexShrink: 0 }}>
          <button
            onClick={() => setRotation(r => (r + 90) % 360)}
            style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem", borderRadius: "0.25rem", background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))", border: "none", cursor: "pointer" }}
          >
            ↻ Rotate
          </button>
          {doc.file_url && (
            <a href={doc.file_url} target="_blank" rel="noopener noreferrer" style={{ color: "hsl(var(--muted-foreground))" }}>
              <ExternalLink style={{ height: 16, width: 16 }} />
            </a>
          )}
        </div>
      </div>

      {/* Preview Area */}
      <div style={{ flex: 1, overflow: "hidden", background: "hsl(var(--muted) / 0.2)", position: "relative" }}>
        {doc.file_url ? (
          isPdf ? (
            <iframe
              src={doc.file_url}
              title={doc.title}
              style={{ width: "100%", height: "100%", border: "none", display: "block", transform: `rotate(${effectiveRotation}deg)`, transformOrigin: "center center" }}
            />
          ) : isImage ? (
            <img
              src={doc.file_url}
              alt={doc.title}
              style={{ width: "100%", height: "100%", objectFit: "contain", transform: `rotate(${effectiveRotation}deg)`, transformOrigin: "center center", display: "block" }}
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "hsl(var(--muted-foreground))" }}>
              <FileText style={{ height: 64, width: 64, opacity: 0.3, marginBottom: 8 }} />
              <p style={{ fontSize: "0.875rem" }}>{doc.original_filename}</p>
            </div>
          )
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "hsl(var(--muted-foreground))" }}>
            <FileText style={{ height: 80, width: 80, opacity: 0.2, marginBottom: 8 }} />
            <p style={{ fontSize: "0.875rem" }}>No file available</p>
          </div>
        )}
      </div>
    </div>
  );
}