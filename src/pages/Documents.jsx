import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Upload, LayoutGrid, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DocumentCard from "../components/DocumentCard";
import DocumentListView from "../components/DocumentListView";
import UploadDialog from "../components/UploadDialog";

export default function Documents() {
  const [documents, setDocuments] = useState([]);
  const [folders, setFolders] = useState([]);
  const [categories, setCategories] = useState([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [quickSearch, setQuickSearch] = useState("");
  const [viewMode, setViewMode] = useState("grid");

  const loadData = async () => {
    const [docs, flds, cats] = await Promise.all([
      base44.entities.Document.list("-created_date", 100),
      base44.entities.Folder.list(),
      base44.entities.Category.list(),
    ]);
    setDocuments(docs);
    setFolders(flds);
    setCategories(cats);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
          <p className="text-sm text-muted-foreground mt-1">{documents.length} total documents</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center border rounded-md">
            <button onClick={() => setViewMode('grid')} className={`p-2 rounded-l-md transition-colors ${viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}><LayoutGrid className="h-4 w-4" /></button>
            <button onClick={() => setViewMode('list')} className={`p-2 rounded-r-md transition-colors ${viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}><List className="h-4 w-4" /></button>
          </div>
          <Button onClick={() => setUploadOpen(true)} className="gap-2">
            <Upload className="h-4 w-4" /> Upload
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
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
            <DocumentCard key={doc.id} document={doc} categories={categories} />
          ))}
        </div>
      ) : (
        <DocumentListView documents={filtered} categories={categories} />
      )}

      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} folders={folders} categories={categories} onUploaded={loadData} />
    </div>
  );
}