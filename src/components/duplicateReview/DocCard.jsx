import { Link } from "react-router-dom";
import { FileText, User } from "lucide-react";

function MetaRow({ label, value, highlight }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{label}</span>
      <span className={`text-sm break-all ${highlight ? "font-semibold text-foreground" : "text-foreground/80"}`}>{value}</span>
    </div>
  );
}

function formatBytes(n) {
  if (!n) return null;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(s) {
  if (!s) return null;
  return new Date(s).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" });
}

export default function DocCard({ doc, crab, label, isNew }) {
  if (!doc) {
    return (
      <div className="flex-1 min-w-0 rounded-xl border border-dashed border-border p-5 flex items-center justify-center text-muted-foreground text-sm">
        Document not found
      </div>
    );
  }

  const isImage = ["jpg", "jpeg", "png", "heic"].includes(doc.file_type);

  return (
    <div className={`flex-1 min-w-0 rounded-xl border p-4 flex flex-col gap-3 ${isNew ? "border-primary/50 bg-primary/[0.03]" : "border-border bg-card"}`}>
      {/* Label badge */}
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full ${isNew ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
          {label}
        </span>
        {doc.processing_status && (
          <span className="text-[10px] text-muted-foreground capitalize bg-muted px-2 py-0.5 rounded-full">
            {doc.processing_status.replace(/_/g, " ")}
          </span>
        )}
      </div>

      {/* Preview thumbnail */}
      {isImage && doc.file_url ? (
        <img
          src={doc.file_url}
          alt={doc.title}
          className="w-full max-h-40 object-contain rounded-lg bg-muted border"
        />
      ) : doc.preview_url ? (
        <img
          src={doc.preview_url}
          alt={doc.title}
          className="w-full max-h-40 object-contain rounded-lg bg-muted border"
        />
      ) : (
        <div className="w-full h-28 rounded-lg bg-muted flex items-center justify-center border">
          <FileText className="h-8 w-8 text-muted-foreground/30" />
        </div>
      )}

      {/* Metadata */}
      <div className="space-y-2.5">
        <MetaRow label="Filename" value={doc.original_filename} highlight />
        <MetaRow label="Normalized filename" value={doc.normalized_filename} />
        <MetaRow label="Title" value={doc.title} />
        <MetaRow label="File size" value={formatBytes(doc.file_size)} />
        <MetaRow label="Source modified" value={formatDate(doc.source_modified_at)} />
        <MetaRow label="Uploaded" value={formatDate(doc.created_date)} />
        <MetaRow label="Document date" value={doc.document_date} />
        <MetaRow label="Category" value={doc.category} />
        {doc.content_hash && (
          <MetaRow label="Hash" value={`${doc.content_hash.slice(0, 20)}…`} />
        )}
      </div>

      {/* Profile */}
      {crab && (
        <div className="flex items-center gap-2 pt-1 border-t">
          <User className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground">
            {crab.canonical_name || crab.full_name || [crab.first_name, crab.surname].filter(Boolean).join(" ")}
          </span>
        </div>
      )}

      <Link
        to={`/crab-documents/${doc.id}`}
        className="text-xs text-primary hover:underline mt-auto pt-1"
      >
        Open document →
      </Link>
    </div>
  );
}