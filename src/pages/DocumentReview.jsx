import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, CheckCircle2, ClipboardList } from "lucide-react";
import ReviewDetail from "../components/ReviewDetail";

export default function DocumentReview() {
  const [queue, setQueue] = useState([]);
  const [folders, setFolders] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadQueue = async () => {
    const [docs, flds, cats] = await Promise.all([
      base44.entities.Document.filter({ processing_status: "needs_review" }, "-created_date", 100),
      base44.entities.Folder.list(),
      base44.entities.Category.list(),
    ]);
    setQueue(docs);
    setFolders(flds);
    setCategories(cats);
    if (docs.length > 0 && !selected) setSelected(docs[0]);
    setLoading(false);
  };

  useEffect(() => { loadQueue(); }, []);

  const handleConfirmed = (docId) => {
    const remaining = queue.filter(d => d.id !== docId);
    setQueue(remaining);
    setSelected(remaining[0] || null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (queue.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Review Queue</h1>
        <div className="bg-card border rounded-xl p-16 text-center flex flex-col items-center gap-3">
          <CheckCircle2 className="h-10 w-10 text-emerald-500" />
          <p className="font-medium">All caught up!</p>
          <p className="text-sm text-muted-foreground">No documents awaiting review.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Review Queue</h1>
        <span className="bg-primary text-primary-foreground text-xs font-bold px-2 py-0.5 rounded-full">{queue.length}</span>
      </div>
      <div className="flex gap-4 h-[calc(100vh-160px)]">
        {/* Queue list */}
        <div className="w-64 shrink-0 flex flex-col gap-1 overflow-y-auto">
          {queue.map(doc => (
            <button
              key={doc.id}
              onClick={() => setSelected(doc)}
              className={`text-left px-3 py-2.5 rounded-lg border transition-all ${
                selected?.id === doc.id
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-transparent hover:bg-muted/60"
              }`}
            >
              <p className="text-sm font-medium truncate">{doc.title}</p>
              <p className="text-xs text-muted-foreground truncate mt-0.5">{doc.original_filename}</p>
            </button>
          ))}
        </div>

        {/* Detail panel */}
        <div className="flex-1 overflow-y-auto">
          {selected && (
            <ReviewDetail
              key={selected.id}
              doc={selected}
              folders={folders}
              categories={categories}
              onConfirmed={handleConfirmed}
            />
          )}
        </div>
      </div>
    </div>
  );
}