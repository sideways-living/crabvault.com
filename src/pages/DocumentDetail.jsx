import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import SaveButton from "../components/SaveButton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, FileText, Trash2, Clock, CheckCircle2,
  AlertCircle, Loader2, Calendar, FolderOpen, ExternalLink, Pencil, Sparkles, Copy
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";

import moment from "moment";

function PdfPreview({ src, title }) {
  const [rotation, setRotation] = useState(0);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: "1 1 0", minHeight: 0 }}>
      <div style={{ flexShrink: 0, borderBottom: "1px solid hsl(var(--border))", padding: "4px 8px", display: "flex", justifyContent: "flex-end", background: "hsl(var(--muted) / 0.4)" }}>
        <button onClick={() => setRotation(r => (r + 90) % 360)}
          className="text-xs px-2 py-0.5 rounded bg-muted hover:bg-muted/80 text-muted-foreground">
          ↻ Rotate
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden", position: "relative" }}>
        <iframe
          src={src}
          title={title}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            border: "none",
            transform: rotation ? `rotate(${rotation}deg)` : undefined,
            transformOrigin: "center center",
          }}
        />
      </div>
    </div>
  );
}

const statusConfig = {
  pending: { icon: Clock, label: "Pending", className: "bg-amber-100 text-amber-700" },
  processing: { icon: Loader2, label: "Processing", className: "bg-blue-100 text-blue-700" },
  needs_review: { icon: AlertCircle, label: "Review", className: "bg-purple-100 text-purple-700" },
  completed: { icon: CheckCircle2, label: "Completed", className: "bg-emerald-100 text-emerald-700" },
  failed: { icon: AlertCircle, label: "Failed", className: "bg-red-100 text-red-700" },
};

const CATEGORY_OPTIONS = ['Uncategorised', 'Document', 'Image', 'Receipt', 'Video'];

export default function DocumentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [doc, setDoc] = useState(null);
  const [folders, setFolders] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({});
  const [suggestedVaultPath, setSuggestedVaultPath] = useState("");
  const [processing, setProcessing] = useState(false);
  const [notesChanged, setNotesChanged] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [transaction, setTransaction] = useState(null);

  const handleProcess = async () => {
    setProcessing(true);
    try {
      await base44.entities.Document.update(doc.id, { processing_status: 'pending' });
      await base44.functions.invoke('processSingleDocument', { documentId: doc.id });
      toast.success('Document sent back to processing queue');
      loadData();
    } catch (error) {
      toast.error(error.message || 'Processing failed');
    } finally {
      setProcessing(false);
    }
  };

  const loadDoc = async () => {
    const docs = await base44.entities.Document.filter({ id });
    if (docs.length > 0) {
      setDoc(docs[0]);
      setEditData({
        title: docs[0].title,
        folder_id: docs[0].folder_id || "",
        category_id: docs[0].category_id || "",
        notes: docs[0].notes || "",
        tags: docs[0].tags?.join(", ") || "",
        vault_path: docs[0].vault_path || "",
      });
    }
  };

  const loadData = async (retries = 3) => {
    try {
      const docs = await base44.entities.Document.filter({ id });
      await new Promise(r => setTimeout(r, 300));
      const flds = await base44.entities.Folder.list();
      await new Promise(r => setTimeout(r, 200));
      const cats = await base44.entities.Category.list();
      setFolders(flds);
      setCategories(cats);
      if (docs.length > 0) {
        setDoc(docs[0]);
        setEditData({
          title: docs[0].title,
          folder_id: docs[0].folder_id || "",
          category_id: docs[0].category_id || "",
          notes: docs[0].notes || "",
          tags: docs[0].tags?.join(", ") || "",
          vault_path: docs[0].vault_path || "",
        });
        await new Promise(r => setTimeout(r, 200));
        const txns = await base44.entities.Transaction.filter({ document_id: docs[0].id });
        setTransaction(txns.length > 0 ? txns[0] : null);
      }
      setLoading(false);
    } catch (err) {
      if (retries > 0 && (err?.message?.includes('Rate limit') || err?.status === 429)) {
        await new Promise(r => setTimeout(r, 2000));
        return loadData(retries - 1);
      }
      setLoading(false);
      throw err;
    }
  };

  useEffect(() => { loadData(); }, [id]);

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (editing || notesChanged) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [editing, notesChanged]);

  const handleSave = async () => {
    await base44.entities.Document.update(doc.id, {
      title: editData.title,
      folder_id: editData.folder_id || undefined,
      category_id: editData.category_id || undefined,
      notes: editData.notes || undefined,
      tags: editData.tags ? editData.tags.split(",").map(t => t.trim()).filter(Boolean) : [],
      vault_path: editData.vault_path || undefined,
    });
    toast.success("Document updated");
    setEditing(false);
    loadDoc();
  };

  const handleSaveNotes = async () => {
    await base44.entities.Document.update(doc.id, { notes: editData.notes || undefined });
    toast.success("Notes saved");
    setNotesChanged(false);
  };

  const handleCancelEdit = () => {
    if (JSON.stringify(editData) !== JSON.stringify({
      title: doc.title,
      folder_id: doc.folder_id || "",
      category_id: doc.category_id || "",
      notes: doc.notes || "",
      tags: doc.tags?.join(", ") || "",
      vault_path: doc.vault_path || "",
    })) {
      if (!confirm("You have unsaved changes. Discard them?")) return;
    }
    setEditing(false);
    setHasUnsavedChanges(false);
    loadDoc();
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this document?")) return;
    await base44.entities.Document.delete(doc.id);
    toast.success("Document deleted");
    navigate("/documents");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">Document not found</p>
        <Link to="/documents" className="text-primary text-sm hover:underline mt-2 inline-block">Back to documents</Link>
      </div>
    );
  }

  const status = statusConfig[doc.processing_status] || statusConfig.pending;
  const StatusIcon = status.icon;
  const category = categories.find(c => c.id === doc.category_id);
  const folder = folders.find(f => f.id === doc.folder_id);

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="text-sm text-muted-foreground">Documents</span>
        <span className="text-sm text-muted-foreground">/</span>
        <span className="text-sm font-medium truncate">{doc.title}</span>
      </div>

      {/* Header */}
      <div className="bg-card rounded-xl border overflow-hidden">
        {/* Top Section */}
        <div className="bg-slate-300 px-6 py-4 flex items-center gap-4">
          <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-white/60 shrink-0">
            <FileText className="h-6 w-6 text-slate-700" />
          </div>

          <div className="flex flex-col justify-center flex-1">
            {editing ? (
              <Input value={editData.title} onChange={e => setEditData({...editData, title: e.target.value})} className="font-semibold text-lg bg-white/80 border-slate-400" />
            ) : (
              <h1 className="text-xl font-semibold text-slate-900">{doc.title}</h1>
            )}
            <p className="text-sm text-slate-700 mt-0.5">{doc.original_filename}</p>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="bg-card px-6 py-3 flex flex-wrap items-center justify-between gap-4">
          {/* Badges */}
          <div style={{display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px'}}>
            {doc.file_type && <Badge variant="outline" className="uppercase text-[10px] font-mono">.{doc.file_type}</Badge>}
            {editing ? (
              <Select value={editData.category_id || '__none__'} onValueChange={v => setEditData({...editData, category_id: v === '__none__' ? '' : v})}>
                <SelectTrigger className="w-40 h-7 text-xs bg-background"><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Uncategorised</SelectItem>
                  {categories.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Badge variant="secondary">{category?.name || 'Uncategorised'}</Badge>
            )}
            <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium ${status.className}`}>
              <StatusIcon className={`h-3 w-3 ${doc.processing_status === 'processing' ? 'animate-spin' : ''}`} />
              {status.label}
            </span>
          </div>

          {/* Actions */}
          <div style={{display: 'flex', gap: '4px', justifyContent: 'flex-end', alignItems: 'center'}}>
            <TooltipProvider delayDuration={300}>
              {!editing ? (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" onClick={handleProcess} disabled={processing}>
                        {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>AI Process</TooltipContent>
                  </Tooltip>

                  {doc.file_url && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                          <Button variant="ghost" size="icon"><ExternalLink className="h-4 w-4" /></Button>
                        </a>
                      </TooltipTrigger>
                      <TooltipContent>Open file</TooltipContent>
                    </Tooltip>
                  )}

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" onClick={() => setEditing(true)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Edit</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={handleDelete}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Delete</TooltipContent>
                  </Tooltip>
                </>
              ) : (
                <>
                  <SaveButton size="sm" onSave={handleSave}>Save</SaveButton>
                  <Button variant="outline" size="sm" onClick={handleCancelEdit}>Cancel</Button>
                </>
              )}
            </TooltipProvider>
          </div>
        </div>
      </div>

      {/* Layout: preview on left (1/3), content on right (2/3) */}
      <div className="flex gap-6 items-stretch">

        {/* Left: Document preview — full height */}
        <div className="w-1/3 shrink-0">
          <div className="bg-card rounded-xl border overflow-hidden flex flex-col" style={{minHeight: '600px', height: '100%'}}>
            <div className="px-4 py-3 border-b bg-slate-300">
              <h3 className="font-medium text-sm">Document</h3>
            </div>
            <div style={{ flex: "1 1 0", minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
              {doc.file_url ? (
                ['jpg','jpeg','png','gif','webp'].includes(doc.file_type?.toLowerCase()) ? (
                  <div className="flex-1 flex items-center justify-center p-2">
                    <img src={doc.file_url} alt={doc.title} className="max-w-full object-contain rounded" style={{ imageOrientation: 'from-image' }} />
                  </div>
                ) : doc.file_type?.toLowerCase() === 'pdf' ? (
                  <PdfPreview src={doc.file_url} title={doc.title} />
                ) : (
                  <div className="flex-1 flex items-center justify-center p-6">
                    <div className="text-center">
                      <FileText className="h-16 w-16 text-muted-foreground/40 mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground mb-3">{doc.original_filename}</p>
                      <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" size="sm"><ExternalLink className="h-4 w-4 mr-1" /> Open File</Button>
                      </a>
                    </div>
                  </div>
                )
              ) : (
                <div className="flex-1 flex items-center justify-center p-6">
                  <div className="text-center">
                    <FileText className="h-16 w-16 text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground/50 italic">No file available</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: stacked content (2/3) */}
        <div className="flex-1 flex flex-col gap-6">

          {/* Row 1: AI Summary */}
          <div className="bg-card rounded-xl border p-6">
            <h3 className="font-medium text-sm mb-3 -mx-6 -mt-6 px-6 py-2 bg-slate-300 rounded-t-lg">AI Summary</h3>
            {doc.summary ? (
              <p className="text-sm text-muted-foreground leading-relaxed">{doc.summary}</p>
            ) : (
              <p className="text-sm text-muted-foreground/50 italic">Not yet processed. Click "AI Process" to generate.</p>
            )}
          </div>

          {/* Row 2: Receipt Details */}
          {transaction && (
            <div className="bg-card rounded-xl border p-6">
              <h3 className="font-medium text-sm mb-3 -mx-6 -mt-6 px-6 py-2 bg-slate-300 rounded-t-lg">Receipt Details</h3>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3 text-sm">
                {transaction.store_brand && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Store</p>
                    <p className="font-medium">{transaction.store_brand}</p>
                    {transaction.store_location && <p className="text-xs text-muted-foreground">{transaction.store_location}</p>}
                  </div>
                )}
                {transaction.transaction_date && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Date</p>
                    <p>{moment(transaction.transaction_date, 'YYYYMMDD').format('D MMM YYYY')}
                    {transaction.transaction_time && ` at ${transaction.transaction_time}`}</p>
                  </div>
                )}
                {transaction.amount && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Total</p>
                    <p className="text-lg font-semibold">${transaction.amount.toFixed(2)}</p>
                  </div>
                )}
                {transaction.transaction_type && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Type</p>
                    <p className="capitalize">{transaction.transaction_type}</p>
                  </div>
                )}
                </div>
                {transaction.items?.length > 0 && (
                  <div className="space-y-3 text-sm">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Items</p>
                    <div className="space-y-1 text-xs">
                      {transaction.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between text-muted-foreground">
                          <span>{item.name} {item.quantity && `x${item.quantity}`}</span>
                          {item.total_price && <span>${item.total_price.toFixed(2)}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Row 3: Notes */}
          <div className="bg-card rounded-xl border p-6">
            <div className="flex items-center justify-between mb-3 -mx-6 -mt-6 px-6 py-2 bg-slate-300 rounded-t-lg">
              <h3 className="font-medium text-sm">Notes</h3>
              {notesChanged && (
                <SaveButton size="sm" onSave={handleSaveNotes}>Save Notes</SaveButton>
              )}
            </div>
            <Textarea value={editData.notes} onChange={e => {
              setEditData({...editData, notes: e.target.value});
              setNotesChanged(true);
            }} rows={4} placeholder="Add your notes..." />
          </div>

          {/* Row 3: Tags + Details side by side */}
          <div className="grid grid-cols-2 gap-6">

            {/* Tags */}
            <div className="bg-card rounded-xl border p-6">
              <h3 className="font-medium text-sm mb-3 -mx-6 -mt-6 px-6 py-2 bg-slate-300 rounded-t-lg">Tags</h3>
              {editing ? (
                <Input value={editData.tags} onChange={e => setEditData({...editData, tags: e.target.value})} placeholder="comma, separated, tags" className="text-sm" />
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {doc.tags?.length > 0 ? doc.tags.map(tag => (
                    <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                  )) : (
                    <p className="text-xs text-muted-foreground/50 italic">No tags</p>
                  )}
                </div>
              )}
            </div>

            {/* Details */}
            <div className="bg-card rounded-xl border p-6 space-y-4">
              <h3 className="font-medium text-sm -mx-6 -mt-6 px-6 py-2 bg-slate-300 rounded-t-lg">Details</h3>
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Copy className="h-4 w-4" />
                  <span className="font-mono text-xs" title={doc.id}>{doc.id}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>Uploaded {moment(doc.created_date).format("MMM D, YYYY")}</span>
                </div>
                {doc.document_date && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>Document date: {moment(doc.document_date).format("MMM D, YYYY")}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-muted-foreground">
                  <FolderOpen className="h-4 w-4" />
                  {editing ? (
                    <Select value={editData.folder_id} onValueChange={v => {
                      const sel = folders.find(f => f.id === v);
                      const suggested = sel?.vault_path ? `${sel.vault_path}/${doc.original_filename || doc.title}` : "";
                      setSuggestedVaultPath(suggested);
                      setEditData({...editData, folder_id: v, vault_path: editData.vault_path || suggested});
                    }}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select folder" /></SelectTrigger>
                      <SelectContent>
                        {folders.map(f => <SelectItem key={f.id} value={f.id}>{f.path || f.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span>{folder?.path || folder?.name || "Unfiled"}</span>
                  )}
                </div>
                {doc.file_size && (
                  <div className="text-muted-foreground">
                    Size: {(doc.file_size / 1024).toFixed(0)} KB
                  </div>
                )}
                {editing ? (
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Vault Path</label>
                    <Input
                      value={editData.vault_path}
                      onChange={e => setEditData({...editData, vault_path: e.target.value})}
                      placeholder="/vault/path/file.pdf"
                      className="mt-1 text-xs font-mono h-8"
                    />
                    {suggestedVaultPath && editData.vault_path !== suggestedVaultPath && (
                      <button onClick={() => setEditData({...editData, vault_path: suggestedVaultPath})} className="text-[10px] text-primary hover:underline mt-1">
                        Use suggested: {suggestedVaultPath}
                      </button>
                    )}
                  </div>
                ) : doc.vault_path ? (
                  <div className="text-muted-foreground text-xs font-mono bg-muted/50 p-2 rounded break-all">
                    🔒 {doc.vault_path}
                  </div>
                ) : null}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}