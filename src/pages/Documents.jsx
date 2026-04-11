import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Upload, LayoutGrid, List, Trash2, RefreshCw, ClipboardList, Pencil, CheckSquare, Layout } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DocumentCard from "../components/DocumentCard";
import DocumentListView from "../components/DocumentListView";
import UploadDialog from "../components/UploadDialog";
import BatchEditDialog from "../components/BatchEditDialog";
import DocumentTreeView from "../components/DocumentTreeView";
import DocumentIconView from "../components/DocumentIconView";

export default function Documents() {
  const [allDocuments, setAllDocuments] = useState([]);
  const [folders, setFolders] = useState([]);
  const [categories, setCategories] = useState([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [quickSearch, setQuickSearch] = useState("");
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('docViewMode') || 'grid');
  const setViewModeAndPersist = (mode) => { setViewMode(mode); localStorage.setItem('docViewMode', mode); };
  const [selectedIds, setSelectedIds] = useState([]);
  const [batchEditOpen, setBatchEditOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const activeSection = searchParams.get("section") || "completed";

  const loadData = async () => {
    try {
      const [docs, flds, cats] = await Promise.all([
        base44.entities.Document.filter({ is_deleted: false }, "-created_date", 100),
      base44.entities.Folder.list(),
      base44.entities.Category.list(),
    ]);
      setAllDocuments(docs);
      setFolders(flds);
      setCategories(cats);
    } catch (error) {
      console.error('Failed to load documents:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  useEffect(() => { setSelectedIds([]); }, [activeSection]);

  const getDocsByStatus = (status) => allDocuments.filter(d => d.processing_status === status);
  const pendingDocs = getDocsByStatus('pending');
  const processingDocs = getDocsByStatus('processing');
  const reviewDocs = getDocsByStatus('needs_review');
  const completedDocs = getDocsByStatus('completed');

  const sectionDocs = {
    pending: pendingDocs,
    processing: processingDocs,
    review: reviewDocs,
    completed: completedDocs
  }[activeSection] || [];

  const documents = sectionDocs;

  const filtered = documents.filter(doc => {
    if (filterCategory !== "all" && doc.category_id !== filterCategory) return false;
    if (filterStatus !== "all" && doc.processing_status !== filterStatus) return false;
    if (quickSearch) {
      const q = quickSearch.toLowerCase();
      return (
        doc.title?.toLowerCase().includes(q) ||
        doc.summary?.toLowerCase().includes(q) ||
        doc.tags?.some(t => t.toLowerCase().includes(q)) ||
        doc.original_filename?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filtered.length) setSelectedIds([]);
    else setSelectedIds(filtered.map(d => d.id));
  };

  const handleBatchReprocess = async () => {
    if (!confirm(`Re-process ${selectedIds.length} document(s) with AI?`)) return;
    await Promise.all(selectedIds.map(id => base44.entities.Document.update(id, { processing_status: 'pending', is_searchable_pdf: false })));
    setSelectedIds([]);
    await loadData();
    toast.success(`${selectedIds.length} document(s) queued for reprocessing`);
    try {
      await base44.functions.invoke('processQueuedDocuments', {});
    } catch (e) {
      // 504 = running in background, not an error
    }
  };

  const handleBatchProcessNow = async () => {
    if (!confirm(`Process ${selectedIds.length} document(s) with AI now?`)) return;
    // Set to pending so processQueuedDocuments picks them up
    await Promise.all(selectedIds.map(id => base44.entities.Document.update(id, { processing_status: 'pending', summary: undefined, ai_data: undefined })));
    setSelectedIds([]);
    setSearchParams({ section: 'pending' });
    await loadData();
    toast.success(`${selectedIds.length} document(s) queued for AI processing…`);
    try {
      await base44.functions.invoke('processQueuedDocuments', {});
    } catch (e) {
      // 504 = running in background
    }
    await loadData();
  };

  const handleBatchReview = async () => {
    await Promise.all(selectedIds.map(id => base44.entities.Document.update(id, { processing_status: 'needs_review' })));
    setSelectedIds([]);
    loadData();
  };

  const handleBatchDelete = async () => {
    if (!confirm(`Move ${selectedIds.length} document(s) to trash?`)) return;
    const now = new Date().toISOString();
    await Promise.all(selectedIds.map(id => base44.entities.Document.update(id, { is_deleted: true, deleted_date: now })));
    setSelectedIds([]);
    loadData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Section tabs */}
      <div className="flex gap-2 border-b overflow-x-auto -mx-6 px-6">
        <button
          onClick={() => setSearchParams({ section: 'pending' })}
          className={`text-sm font-medium pb-3 transition-colors border-b-2 ${activeSection === 'pending' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          Pending ({pendingDocs.length})
        </button>
        <button
          onClick={() => setSearchParams({ section: 'processing' })}
          className={`text-sm font-medium pb-3 transition-colors border-b-2 ${activeSection === 'processing' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          Processing ({processingDocs.length})
        </button>
        <button
          onClick={() => setSearchParams({ section: 'review' })}
          className={`text-sm font-medium pb-3 transition-colors border-b-2 ${activeSection === 'review' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          Review ({reviewDocs.length})
        </button>
        <button
          onClick={() => setSearchParams({ section: 'completed' })}
          className={`text-sm font-medium pb-3 transition-colors border-b-2 ${activeSection === 'completed' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          Documents ({completedDocs.length})
        </button>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ display: 'none' }}>Documents</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center border rounded-md">
            <button onClick={() => setViewModeAndPersist('grid')} className={`p-2 rounded-l-md transition-colors ${viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}><LayoutGrid className="h-4 w-4" /></button>
            <button onClick={() => setViewModeAndPersist('list')} className={`p-2 transition-colors ${viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}><List className="h-4 w-4" /></button>
            <button onClick={() => setViewModeAndPersist('tree')} className={`p-2 transition-colors ${viewMode === 'tree' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}><Layout className="h-4 w-4" /></button>
            <button onClick={() => setViewModeAndPersist('icon')} className={`p-2 rounded-r-md transition-colors ${viewMode === 'icon' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}><LayoutGrid className="h-4 w-4" /></button>
          </div>
          <Button onClick={() => setUploadOpen(true)} className="gap-2">
            <Upload className="h-4 w-4" /> Upload
          </Button>
        </div>
      </div>

      {/* Bulk action toolbar */}
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 bg-primary/5 border border-primary/20 rounded-xl px-4 py-3">
          <span className="text-sm font-medium text-primary">{selectedIds.length} selected</span>
          <div className="h-4 w-px bg-border mx-1" />
          <Button size="sm" variant="outline" className="gap-1.5" onClick={handleBatchProcessNow}><RefreshCw className="h-3.5 w-3.5" /> Process with AI</Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={handleBatchReprocess}><RefreshCw className="h-3.5 w-3.5" /> Re-process (reset)</Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={handleBatchReview}><ClipboardList className="h-3.5 w-3.5" /> Send to Review Queue</Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setBatchEditOpen(true)}><Pencil className="h-3.5 w-3.5" /> Batch Edit</Button>
          <Button size="sm" variant="outline" className="gap-1.5 text-destructive hover:bg-destructive/10 border-destructive/30" onClick={handleBatchDelete}><Trash2 className="h-3.5 w-3.5" /> Delete</Button>
          <button className="ml-auto text-xs text-muted-foreground hover:text-foreground" onClick={() => setSelectedIds([])}>Clear selection</button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-center">
        <button
          onClick={toggleSelectAll}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <CheckSquare className="h-4 w-4" />
          {selectedIds.length === filtered.length && filtered.length > 0 ? 'Deselect all' : 'Select all'}
        </button>
        <Input
          placeholder="Quick search..."
          value={quickSearch}
          onChange={e => setQuickSearch(e.target.value)}
          className="sm:max-w-xs"
        />
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="sm:w-48">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="sm:w-48">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Documents */}
      {filtered.length === 0 ? (
        <div className="bg-card rounded-xl border p-12 text-center">
          <p className="text-muted-foreground text-sm">
            {documents.length === 0 ? "No documents yet." : "No documents match your filters."}
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(doc => (
            <DocumentCard key={doc.id} document={doc} categories={categories} selected={selectedIds.includes(doc.id)} onToggleSelect={toggleSelect} />
          ))}
        </div>
      ) : viewMode === 'list' ? (
        <DocumentListView documents={filtered} categories={categories} selectedIds={selectedIds} onToggleSelect={toggleSelect} />
      ) : viewMode === 'tree' ? (
        <DocumentTreeView documents={filtered} folders={folders} categories={categories} />
      ) : (
        <DocumentIconView documents={filtered} folders={folders} categories={categories} />
      )}

      <BatchEditDialog
        open={batchEditOpen}
        onOpenChange={setBatchEditOpen}
        selectedIds={selectedIds}
        folders={folders}
        categories={categories}
        onDone={() => { setSelectedIds([]); loadData(); }}
      />

      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} folders={folders} categories={categories} onUploaded={loadData} />
    </div>
  );
}