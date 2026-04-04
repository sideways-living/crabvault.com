import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, FileText, Download, Trash2, Clock, CheckCircle2,
  AlertCircle, Loader2, Calendar, Tag, FolderOpen, Save, ExternalLink
} from "lucide-react";
import { toast } from "sonner";
import ProcessDocumentButton from "../components/ProcessDocumentButton";
import moment from "moment";

const statusConfig = {
  pending: { icon: Clock, label: "Pending", className: "bg-amber-100 text-amber-700" },
  processing: { icon: Loader2, label: "Processing", className: "bg-blue-100 text-blue-700" },
  completed: { icon: CheckCircle2, label: "Completed", className: "bg-emerald-100 text-emerald-700" },
  failed: { icon: AlertCircle, label: "Failed", className: "bg-red-100 text-red-700" },
};

export default function DocumentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [doc, setDoc] = useState(null);
  const [folders, setFolders] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({});

  const loadData = async () => {
    const [docs, flds, cats] = await Promise.all([
      base44.entities.Document.filter({ id }),
      base44.entities.Folder.list(),
      base44.entities.Category.list(),
    ]);
    if (docs.length > 0) {
      setDoc(docs[0]);
      setEditData({
        title: docs[0].title,
        folder_id: docs[0].folder_id || "",
        category_id: docs[0].category_id || "",
        notes: docs[0].notes || "",
        tags: docs[0].tags?.join(", ") || "",
      });
    }
    setFolders(flds);
    setCategories(cats);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [id]);

  const handleSave = async () => {
    await base44.entities.Document.update(doc.id, {
      title: editData.title,
      folder_id: editData.folder_id || undefined,
      category_id: editData.category_id || undefined,
      notes: editData.notes || undefined,
      tags: editData.tags ? editData.tags.split(",").map(t => t.trim()).filter(Boolean) : [],
    });
    toast.success("Document updated");
    setEditing(false);
    loadData();
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
    <div className="space-y-6 max-w-4xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Link to="/documents" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <span className="text-sm text-muted-foreground">Documents</span>
        <span className="text-sm text-muted-foreground">/</span>
        <span className="text-sm font-medium truncate">{doc.title}</span>
      </div>

      {/* Header */}
      <div className="bg-card rounded-xl border p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <FileText className="h-6 w-6 text-primary" />
            </div>
            <div>
              {editing ? (
                <Input value={editData.title} onChange={e => setEditData({...editData, title: e.target.value})} className="font-semibold text-lg" />
              ) : (
                <h1 className="text-xl font-semibold">{doc.title}</h1>
              )}
              <p className="text-sm text-muted-foreground mt-0.5">{doc.original_filename}</p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium ${status.className}`}>
                  <StatusIcon className={`h-3 w-3 ${doc.processing_status === 'processing' ? 'animate-spin' : ''}`} />
                  {status.label}
                </span>
                {category && (
                  <Badge variant="secondary">{category.name}</Badge>
                )}
                {doc.file_type && (
                  <Badge variant="outline" className="uppercase text-[10px]">{doc.file_type}</Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <ProcessDocumentButton document={doc} categories={categories} folders={folders} onProcessed={loadData} />
            {!editing ? (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>Edit</Button>
            ) : (
              <>
                <Button size="sm" onClick={handleSave}><Save className="h-4 w-4 mr-1" /> Save</Button>
                <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
              </>
            )}
            {doc.file_url && (
              <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm"><ExternalLink className="h-4 w-4 mr-1" /> Open</Button>
              </a>
            )}
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={handleDelete}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Summary */}
          <div className="bg-card rounded-xl border p-6">
            <h3 className="font-medium text-sm mb-3">AI Summary</h3>
            {doc.summary ? (
              <p className="text-sm text-muted-foreground leading-relaxed">{doc.summary}</p>
            ) : (
              <p className="text-sm text-muted-foreground/50 italic">Not yet processed. Click "AI Process" to generate.</p>
            )}
          </div>

          {/* Notes */}
          <div className="bg-card rounded-xl border p-6">
            <h3 className="font-medium text-sm mb-3">Notes</h3>
            {editing ? (
              <Textarea value={editData.notes} onChange={e => setEditData({...editData, notes: e.target.value})} rows={4} placeholder="Add your notes..." />
            ) : (
              <p className="text-sm text-muted-foreground leading-relaxed">
                {doc.notes || <span className="italic opacity-50">No notes</span>}
              </p>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="bg-card rounded-xl border p-6 space-y-4">
            <h3 className="font-medium text-sm">Details</h3>
            <div className="space-y-3 text-sm">
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
                  <Select value={editData.folder_id} onValueChange={v => setEditData({...editData, folder_id: v})}>
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
              {doc.vault_path && (
                <div className="text-muted-foreground text-xs font-mono bg-muted/50 p-2 rounded">
                  Vault: {doc.vault_path}
                </div>
              )}
            </div>
          </div>

          {/* Tags */}
          <div className="bg-card rounded-xl border p-6">
            <h3 className="font-medium text-sm mb-3">Tags</h3>
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
        </div>
      </div>
    </div>
  );
}