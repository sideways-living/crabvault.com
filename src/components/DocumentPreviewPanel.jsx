import { useState, useEffect } from "react";
import { FileText, ExternalLink, RotateCw } from "lucide-react";

export default function DocumentPreviewPanel({ doc }) {
  const isPdf = doc.file_type?.toLowerCase() === 'pdf';
  const isImage = ["jpg", "jpeg", "png", "gif", "webp"].includes(doc.file_type?.toLowerCase());

  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    setRotation(0);
  }, [doc.id]);

  const handleRotate = () => setRotation(r => (r + 90) % 360);

  const is90or270 = rotation === 90 || rotation === 270;

  const iframeStyle = is90or270
    ? {
        position: "absolute",
        border: "none",
        display: "block",
        width: "100vh",
        height: "100vw",
        top: "50%",
        left: "50%",
        transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
        transformOrigin: "center center",
      }
    : {
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        border: "none",
        display: "block",
        transform: `rotate(${rotation}deg)`,
        transformOrigin: "center center",
      };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "0.75rem", overflow: "hidden" }}>

      {/* Toolbar — isolated, never transformed */}
      <div style={{
        flexShrink: 0,
        borderBottom: "1px solid hsl(var(--border))",
        padding: "0.625rem 1rem",
        background: "hsl(var(--muted) / 0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "0.5rem",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0, flex: 1 }}>
          <FileText style={{ height: 14, width: 14, flexShrink: 0, color: "hsl(var(--muted-foreground))" }} />
          <span style={{ fontSize: "0.7rem", fontFamily: "var(--font-mono)", color: "hsl(var(--muted-foreground))", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {doc.original_filename || doc.title}
          </span>
          {doc.file_type && (
            <span style={{ fontSize: "0.65rem", textTransform: "uppercase", fontWeight: 700, background: "hsl(var(--muted))", padding: "0.1rem 0.35rem", borderRadius: "0.2rem", flexShrink: 0, color: "hsl(var(--foreground))" }}>
              {doc.file_type}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", flexShrink: 0 }}>
          <button
            onClick={handleRotate}
            style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.7rem", padding: "0.25rem 0.5rem", borderRadius: "0.25rem", background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))", border: "none", cursor: "pointer" }}
          >
            <RotateCw style={{ height: 12, width: 12 }} />
            Rotate
          </button>
          {doc.file_url && (
            <a href={doc.file_url} target="_blank" rel="noopener noreferrer" style={{ color: "hsl(var(--muted-foreground))", display: "flex" }}>
              <ExternalLink style={{ height: 14, width: 14 }} />
            </a>
          )}
        </div>
      </div>

      {/* Preview area — completely separate from toolbar, overflow:hidden clips rotated iframe */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden", background: "hsl(var(--muted) / 0.15)", isolation: "isolate" }}>
        {doc.file_url ? (
          isPdf ? (
            <iframe
              src={doc.file_url}
              title={doc.title}
              style={iframeStyle}
            />
          ) : isImage ? (
            <img
              src={doc.file_url}
              alt={doc.title}
              style={{
                position: "absolute", top: "50%", left: "50%",
                transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
                maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block"
              }}
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "hsl(var(--muted-foreground))" }}>
              <FileText style={{ height: 48, width: 48, opacity: 0.25, marginBottom: 8 }} />
              <p style={{ fontSize: "0.8rem" }}>{doc.original_filename}</p>
            </div>
          )
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "hsl(var(--muted-foreground))" }}>
            <FileText style={{ height: 64, width: 64, opacity: 0.15, marginBottom: 8 }} />
            <p style={{ fontSize: "0.8rem" }}>No file available</p>
          </div>
        )}
      </div>

    </div>
  );
}