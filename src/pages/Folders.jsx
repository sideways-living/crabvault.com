import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import FolderTreeView from "../components/FolderTreeView";
import CreateFolderDialog from "../components/CreateFolderDialog";

export default function Folders() {
  const [folders, setFolders] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const loadData = async () => {
    const [flds, docs, cats] = await Promise.all([
      base44.entities.Folder.list(),
      base44.entities.Document.list("-created_date", 200),
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Folders</h1>
          <p className="text-sm text-muted-foreground mt-1">Browse your document hierarchy</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <FolderPlus className="h-4 w-4" /> New Folder
        </Button>
      </div>

      <div className="bg-card rounded-xl border p-4">
        <FolderTreeView folders={folders} documents={documents} />
      </div>

      <CreateFolderDialog open={createOpen} onOpenChange={setCreateOpen} folders={folders} categories={categories} onCreated={loadData} />
    </div>
  );
}