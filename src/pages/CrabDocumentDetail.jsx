import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Download, ExternalLink, FileText, Loader2, User } from "lucide-react";

const IMAGE_TYPES = ["jpg", "jpeg", "png", "heic", "webp", "gif"];
const PDF_TYPES = ["pdf"];

function FilePreview({ doc }) {
  const type = (doc.file_type || "").toLowerCase();
  const url = doc.file_url;

  if (!url) {
    return (
      <div className="flex items-center justify-center h-64 bg-muted/40 rounded-xl text-muted-foreground">
        <FileText className="h-10 w-10 opacity-30" />
      </div>
    );
  }

  if (PDF_TYPES.includes(type)) {
    return (
      <iframe
        src={url}
        className="w-full rounded-xl border"
        style={{ height: "70vh" }}
        title={doc.title}
      />
    );
  }

  if (IMAGE_TYPES.includes(type)) {
    return (
      <img
        src={url}
        alt={doc.title}
        className="w-full rounded-xl border object-contain max-h-[70vh] bg-muted/20"
      />
    );
  }

  // Other file types — can't preview, offer download
  return (
    <div className="flex flex-col items-center justify-center h-64 bg-muted/40 rounded-xl border gap-4">
      <FileText className="h-12 w-12 text-muted-foreground opacity-40" />
      <p className="text-sm text-muted-foreground">Preview not available for .{type} files</p>
      <a href={url} target="_blank" rel="noopener noreferrer">
        <Button variant="outline" className="gap-2">
          <Download className="h-4 w-4" /> Download File
        </Button>
      </a>
    </div>
  );
}

const CATEGORY_COLORS = {
  correspondence: "bg-blue-50 text-blue-700 border-blue-200",
  evidence: "bg-purple-50 text-purple-700 border-purple-200",
  receipt: "bg-amber-50 text-amber-700 border-amber-200",
  id: "bg-green-50 text-green-700 border-green-200",
  legal: "bg-red-50 text-red-700 border-red-200",
  medical: "bg-pink-50 text-pink-700 border-pink-200",
  financial: "bg-emerald-50 text-emerald-700 border-emerald-200",
  other: "bg-gray-50 text-gray-600 border-gray-200",
};

function MetaRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex gap-3">
      <span className="text-xs text-muted-foreground w-28 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm break-all">{value}</span>
    </div>
  );
}

export default function CrabDocumentDetail() {
  const { id } = useParams();
  const [doc, setDoc] = useState(null);
  const [crabs, setCrabs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      base44.entities.CrabDocument.filter({ id }),
      base44.entities.Crab.list("full_name", 500),
    ]).then(([docs, crbs]) => {
      setDoc(docs[0] || null);
      setCrabs(crbs);
    }).finally(() => setLoading(false));
  }, [id]);

  const linkedCrabs = (doc?.crab_ids || []).map(cid => crabs.find(c => c.id === cid)).filter(Boolean);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="text-center py-24 text-muted-foreground">
        <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p>Document not found.</p>
        <Link to="/crab-documents"><Button variant="link">Back to Documents</Button></Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link to="/crab-documents">
          <Button variant="ghost" size="icon" className="mt-0.5"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold tracking-tight truncate">{doc.title}</h1>
          {doc.original_filename && (
            <p className="text-xs font-mono text-muted-foreground mt-0.5 truncate">{doc.original_filename}</p>
          )}
        </div>
        {doc.file_url && (
          <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="gap-2 shrink-0">
              <ExternalLink className="h-3.5 w-3.5" /> Open
            </Button>
          </a>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Preview */}
        <div className="lg:col-span-2">
          <FilePreview doc={doc} />
        </div>

        {/* Metadata sidebar */}
        <div className="space-y-5">
          {/* Linked crabs */}
          {linkedCrabs.length > 0 && (
            <div className="rounded-xl border p-4 space-y-3">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Linked Profiles</h3>
              <div className="space-y-2">
                {linkedCrabs.map(c => (
                  <Link key={c.id} to={`/crabs/${c.id}`} className="flex items-center gap-2 hover:text-primary transition-colors">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm font-medium">{c.full_name || c.surname}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Details */}
          <div className="rounded-xl border p-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Details</h3>
            <div className="space-y-2.5">
              {doc.category && (
                <div className="flex gap-3">
                  <span className="text-xs text-muted-foreground w-28 shrink-0 pt-0.5">Category</span>
                  <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border ${CATEGORY_COLORS[doc.category] || ""}`}>
                    {doc.category}
                  </span>
                </div>
              )}
              <MetaRow label="Status" value={doc.processing_status} />
              <MetaRow label="File Type" value={doc.file_type?.toUpperCase()} />
              <MetaRow label="Document Date" value={doc.document_date} />
              <MetaRow label="File Size" value={doc.file_size ? `${(doc.file_size / 1024).toFixed(1)} KB` : null} />
              <MetaRow label="Vault Path" value={doc.vault_path} />
              {doc.synced_to_vault !== undefined && (
                <div className="flex gap-3">
                  <span className="text-xs text-muted-foreground w-28 shrink-0 pt-0.5">Vault Sync</span>
                  <span className={`text-xs font-medium ${doc.synced_to_vault ? "text-emerald-600" : "text-amber-600"}`}>
                    {doc.synced_to_vault ? "Synced" : "Pending"}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Tags */}
          {doc.tags?.length > 0 && (
            <div className="rounded-xl border p-4 space-y-3">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Tags</h3>
              <div className="flex flex-wrap gap-1.5">
                {doc.tags.map(t => (
                  <span key={t} className="text-[10px] bg-secondary px-2 py-0.5 rounded-full">{t}</span>
                ))}
              </div>
            </div>
          )}

          {/* Notes / Summary */}
          {(doc.notes || doc.summary) && (
            <div className="rounded-xl border p-4 space-y-2">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                {doc.summary ? "Summary" : "Notes"}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{doc.summary || doc.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}