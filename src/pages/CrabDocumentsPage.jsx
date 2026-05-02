import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { FileText, Search, Upload, Loader2, CheckCircle2, Clock, AlertTriangle, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import CrabDocumentUploadDialog from "@/components/CrabDocumentUploadDialog";

const STATUS_ICONS = {
  pending: <Clock className="h-3.5 w-3.5 text-amber-500" />,
  processing: <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin" />,
  needs_review: <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />,
  completed: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />,
  failed: <AlertTriangle className="h-3.5 w-3.5 text-red-500" />,
};

const CATEGORY_COLORS = {
  correspondence: "bg-blue-50 text-blue-700",
  evidence: "bg-purple-50 text-purple-700",
  receipt: "bg-amber-50 text-amber-700",
  id: "bg-green-50 text-green-700",
  legal: "bg-red-50 text-red-700",
  medical: "bg-pink-50 text-pink-700",
  financial: "bg-emerald-50 text-emerald-700",
  "birth certificate": "bg-cyan-50 text-cyan-700",
  other: "bg-gray-50 text-gray-600",
};

export default function CrabDocumentsPage() {
  const [documents, setDocuments] = useState([]);
  const [crabs, setCrabs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      base44.entities.CrabDocument.list("-created_date", 500),
      base44.entities.Crab.list("full_name", 500),
    ]).then(([docs, crbs]) => {
      setDocuments(docs.filter(d => !d.is_deleted));
      setCrabs(crbs.filter(c => !c.is_deleted));
    }).catch(err => {
      console.error("Failed to load documents:", err);
    }).finally(() => {
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, []);

  const filtered = documents.filter(d => {
    const q = search.toLowerCase();
    if (!q) return true;
    return d.title?.toLowerCase().includes(q) ||
      d.original_filename?.toLowerCase().includes(q) ||
      d.summary?.toLowerCase().includes(q) ||
      (d.tags || []).some(t => t.toLowerCase().includes(q));
  });

  const getCrabNames = (crabIds = []) =>
    crabIds.map(id => crabs.find(c => c.id === id)?.full_name).filter(Boolean);

  const handleDelete = async (doc, e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete "${doc.title}"? This cannot be undone.`)) return;
    await base44.entities.CrabDocument.update(doc.id, { is_deleted: true });
    toast.success("Document deleted");
    load();
  };

  const handleProcessAll = () => {
    const pending = documents.filter(d => ["needs_review", "pending", "processing"].includes(d.processing_status));
    if (pending.length === 0) {
      toast.error("No documents need attention");
      return;
    }
    // Navigate to first pending document
    window.location.href = `/crab-documents/${pending[0].id}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
          <p className="text-sm text-muted-foreground mt-1">{documents.length} document{documents.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleProcessAll} variant="outline" className="gap-2">
            <Clock className="h-4 w-4" /> Process All
          </Button>
          <Button onClick={() => setUploadOpen(true)} className="gap-2"><Upload className="h-4 w-4" /> Upload</Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search documents…" className="pl-9" />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">{search ? "No documents match your search" : "No documents yet"}</p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Document</th>
                <th className="text-left px-4 py-3 font-medium">Category</th>
                <th className="text-left px-4 py-3 font-medium">Linked Crabs</th>
                <th className="text-left px-4 py-3 font-medium">Date</th>
                <th className="text-center px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(doc => (
                <tr key={doc.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <Link to={`/crab-documents/${doc.id}`} className="font-medium hover:text-primary truncate block max-w-xs">
                      {doc.title}
                    </Link>
                    {doc.original_filename && <p className="text-xs text-muted-foreground font-mono truncate max-w-xs">{doc.original_filename}</p>}
                  </td>
                  <td className="px-4 py-3">
                    {doc.category && (
                      <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${CATEGORY_COLORS[doc.category] || ""}`}>
                        {doc.category}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {getCrabNames(doc.crab_ids).slice(0, 3).map(name => (
                        <span key={name} className="text-[10px] bg-secondary px-1.5 py-0.5 rounded-full">{name}</span>
                      ))}
                      {(doc.crab_ids || []).length > 3 && <span className="text-[10px] text-muted-foreground">+{doc.crab_ids.length - 3}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {doc.document_date || "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span title={doc.processing_status}>{STATUS_ICONS[doc.processing_status]}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={(e) => handleDelete(doc, e)}
                      className="text-muted-foreground hover:text-destructive transition-colors p-1"
                      title="Delete document"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CrabDocumentUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} crabs={crabs} onUploaded={load} />
    </div>
  );
}