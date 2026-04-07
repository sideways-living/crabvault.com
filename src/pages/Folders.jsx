import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { FolderPlus, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import FolderTreeView from "../components/FolderTreeView";
import CreateFolderDialog from "../components/CreateFolderDialog";


export default function Folders() {
  const [folders, setFolders] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [categories, setCategories] = useState([]);
  const [showFiles, setShowFiles] = useState(false);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const loadData = async () => {
    const [flds, docs, cats] = await Promise.all([
      base44.entities.Folder.list(),
      base44.entities.Document.list("-created_date", 500),
      base44.entities.Category.list(),
    ]);
    setFolders(flds);
    setDocuments(docs);
    setCategories(cats);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Split root folders into Documents and Receipts columns by category name
  const rootFolders = folders.filter(f => !f.parent_folder_id);
  const docCatIds = new Set(categories.filter(c => /document/i.test(c.name)).map(c => c.id));
  const recCatIds = new Set(categories.filter(c => /receipt/i.test(c.name)).map(c => c.id));
  const docRootIds = new Set(rootFolders.filter(f => docCatIds.has(f.category_id) || /document/i.test(f.name)).map(f => f.id));
  const recRootIds = new Set(rootFolders.filter(f => recCatIds.has(f.category_id) || /receipt/i.test(f.name)).map(f => f.id));
  const otherRootIds = new Set(rootFolders.filter(f => !docRootIds.has(f.id) && !recRootIds.has(f.id)).map(f => f.id));
  const showTwoCol = docRootIds.size > 0 || recRootIds.size > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">        
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Folders</h1>
          <p className="text-sm text-muted-foreground mt-1">Browse your document hierarchy</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFiles(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
              showFiles ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:bg-muted'
            }`}
          >
            <FileText className="h-4 w-4" />
            {showFiles ? 'Files on' : 'Files off'}
          </button>
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <FolderPlus className="h-4 w-4" /> New Folder
          </Button>
        </div>
      </div>

      {showTwoCol ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-card rounded-xl border p-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Documents</h2>
            <FolderTreeView folders={folders} documents={showFiles ? documents : []} onFoldersChanged={loadData} onlyRootIds={new Set([...docRootIds, ...otherRootIds])} showFiles={showFiles} />
          </div>
          <div className="bg-card rounded-xl border p-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Receipt Folders</h2>
            <FolderTreeView folders={folders} documents={showFiles ? documents : []} onFoldersChanged={loadData} onlyRootIds={recRootIds} showFiles={showFiles} />
          </div>
        </div>
      ) : (
        <div className="bg-card rounded-xl border p-4">
          <FolderTreeView folders={folders} documents={showFiles ? documents : []} onFoldersChanged={loadData} showFiles={showFiles} />
        </div>
      )}

      <CreateFolderDialog open={createOpen} onOpenChange={setCreateOpen} folders={folders} categories={categories} onCreated={loadData} />
    </div>
  );
}