import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Download, ExternalLink, FileText, Loader2, User, GitBranch, Plus, Save } from "lucide-react";
import { toast } from "sonner";

const DEFAULT_CATEGORIES = [
  "Credit Card",
  "Debit Card",
  "Drivers Licence",
  "Medicare Card",
  "Notice of Assessment",
  "Passport",
  "Utility Bill",
];

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
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editDocDate, setEditDocDate] = useState("");

  const [versions, setVersions] = useState([]);

  useEffect(() => {
    Promise.all([
      base44.entities.CrabDocument.filter({ id }),
      base44.entities.Crab.list("full_name", 500),
    ]).then(async ([docs, crbs]) => {
      const d = docs[0] || null;
      setDoc(d);
      setEditTitle(d?.title || "");
      setEditNotes(d?.notes || "");
      setEditDocDate(d?.document_date || "");
      setCrabs(crbs);

      // Load version history if this doc has a filename
      if (d?.original_filename) {
        const allVersions = await base44.entities.CrabDocument.list("-version", 50);
        const history = allVersions.filter(v =>
          v.original_filename === d.original_filename &&
          (v.crab_ids || []).some(cid => (d.crab_ids || []).includes(cid)) &&
          !v.is_deleted
        );
        setVersions(history.sort((a, b) => (b.version || 1) - (a.version || 1)));
      }
    }).finally(() => setLoading(false));
  }, [id]);

  const linkedCrabs = (doc?.crab_ids || []).map(cid => crabs.find(c => c.id === cid)).filter(Boolean);

  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [customCategories, setCustomCategories] = useState([]);

  const handleStatusChange = async (newStatus) => {
    await base44.entities.CrabDocument.update(doc.id, { processing_status: newStatus });
    setDoc(d => ({ ...d, processing_status: newStatus }));
    toast.success("Status updated");
  };

  const handleCategoryChange = async (value) => {
    if (value === "__add__") return;
    await base44.entities.CrabDocument.update(doc.id, { category: value });
    setDoc(d => ({ ...d, category: value }));
    toast.success("Category updated");
  };

  const handleAddCategory = async () => {
    const trimmed = newCategory.trim();
    if (!trimmed) return;
    if (!customCategories.includes(trimmed)) {
      setCustomCategories(c => [...c, trimmed].sort());
    }
    await base44.entities.CrabDocument.update(doc.id, { category: trimmed });
    setDoc(d => ({ ...d, category: trimmed }));
    toast.success("Category updated");
    setNewCategory("");
    setAddingCategory(false);
  };

  const allCategories = [...new Set([...DEFAULT_CATEGORIES, ...customCategories, ...(doc?.category && !DEFAULT_CATEGORIES.includes(doc.category) ? [doc.category] : [])])].sort();

  const handleSave = async () => {
    setSaving(true);
    await base44.entities.CrabDocument.update(doc.id, {
      title: editTitle.trim() || doc.title,
      notes: editNotes,
      document_date: editDocDate,
    });
    setDoc(d => ({ ...d, title: editTitle.trim() || d.title, notes: editNotes, document_date: editDocDate }));
    setDirty(false);
    toast.success("Changes saved");
    setSaving(false);
  };

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
          <div className="flex items-center gap-2">
            <Input
              className="text-xl font-semibold h-auto py-0.5 px-1.5 border-transparent hover:border-input focus:border-input bg-transparent"
              value={editTitle}
              onChange={e => { setEditTitle(e.target.value); setDirty(true); }}
            />
            {doc.version > 1 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 shrink-0">v{doc.version}</span>
            )}
            {doc.is_latest_version === false && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 shrink-0">outdated</span>
            )}
          </div>
          {doc.original_filename && (
            <p className="text-xs font-mono text-muted-foreground mt-0.5 truncate">{doc.original_filename}</p>
          )}
        </div>
        <div className="flex gap-2 shrink-0 items-center">
          {dirty && (
            <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save
            </Button>
          )}
          {doc.file_url && (
            <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="gap-2">
                <ExternalLink className="h-3.5 w-3.5" /> Open
              </Button>
            </a>
          )}
        </div>
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
              <div className="flex gap-3 items-start">
                <span className="text-xs text-muted-foreground w-28 shrink-0 pt-1.5">Category</span>
                <div className="flex-1 space-y-2">
                  <Select value={doc.category || "__none__"} onValueChange={handleCategoryChange}>
                    <SelectTrigger className="h-7 text-xs w-full">
                      <SelectValue placeholder="Select category…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— None —</SelectItem>
                      {allCategories.map(cat => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                      <div
                        className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-primary cursor-pointer hover:bg-accent rounded-sm"
                        onMouseDown={e => { e.preventDefault(); setAddingCategory(true); }}
                      >
                        <Plus className="h-3 w-3" /> Add category
                      </div>
                    </SelectContent>
                  </Select>
                  {addingCategory && (
                    <div className="flex gap-1.5">
                      <Input
                        autoFocus
                        className="h-7 text-xs"
                        placeholder="New category…"
                        value={newCategory}
                        onChange={e => setNewCategory(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") handleAddCategory(); if (e.key === "Escape") setAddingCategory(false); }}
                      />
                      <Button size="sm" className="h-7 text-xs px-2" onClick={handleAddCategory}>Add</Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => { setAddingCategory(false); setNewCategory(""); }}>✕</Button>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-3 items-center">
                <span className="text-xs text-muted-foreground w-28 shrink-0">Status</span>
                <Select value={doc.processing_status} onValueChange={handleStatusChange}>
                  <SelectTrigger className="h-7 text-xs w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not_processed">Not Processed</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="processing">Processing</SelectItem>
                    <SelectItem value="needs_review">Needs Review</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <MetaRow label="File Type" value={doc.file_type?.toUpperCase()} />
              <div className="flex gap-3 items-center">
                <span className="text-xs text-muted-foreground w-28 shrink-0">Document Date</span>
                <Input
                  type="date"
                  className="h-7 text-xs w-36"
                  value={editDocDate}
                  onChange={e => { setEditDocDate(e.target.value); setDirty(true); }}
                />
              </div>
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
          <div className="rounded-xl border p-4 space-y-2">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Notes</h3>
            {doc.summary && <p className="text-xs text-muted-foreground italic border-b pb-2 mb-2">{doc.summary}</p>}
            <textarea
              className="w-full text-sm border rounded-lg px-3 py-2 bg-background resize-none focus-visible:ring-1 focus-visible:ring-ring outline-none min-h-[80px]"
              placeholder="Add notes…"
              value={editNotes}
              onChange={e => { setEditNotes(e.target.value); setDirty(true); }}
            />
          </div>

          {/* Version history */}
          {versions.length > 1 && (
            <div className="rounded-xl border p-4 space-y-3">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
                <GitBranch className="h-3.5 w-3.5" /> Version History
              </h3>
              <div className="space-y-1.5">
                {versions.map(v => (
                  <Link
                    key={v.id}
                    to={`/crab-documents/${v.id}`}
                    className={`flex items-center justify-between text-sm px-2 py-1.5 rounded-lg transition-colors ${v.id === id ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted text-muted-foreground hover:text-foreground"}`}
                  >
                    <span>v{v.version || 1}</span>
                    <span className="text-[10px]">
                      {v.is_latest_version ? <span className="text-emerald-600 font-semibold">latest</span> : new Date(v.created_date).toLocaleDateString()}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}