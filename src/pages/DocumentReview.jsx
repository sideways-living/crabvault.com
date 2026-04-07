import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, CheckCircle2, ClipboardList, Copy } from "lucide-react";
import ReviewDetail from "../components/ReviewDetail";

export default function DocumentReview() {
  const [queue, setQueue] = useState([]);
  const [folders, setFolders] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  const getDuplicates = (doc, allDocs) => {
    return allDocs.filter(d => {
      if (d.id === doc.id) return false;
      const sameFilename = doc.original_filename && d.original_filename &&
        doc.original_filename.toLowerCase() === d.original_filename.toLowerCase();
      const sameSize = doc.file_size && d.file_size && doc.file_size === d.file_size;
      const sameAiTitle = doc.title && d.title && doc.title.toLowerCase() === d.title.toLowerCase();
      return sameFilename || sameSize || sameAiTitle;
    });
  };

  const loadQueue = async () => {
    const docs = await base44.entities.Document.filter({ processing_status: "needs_review" }, "-created_date", 100);
    const flds = await base44.entities.Folder.list();
    const cats = await base44.entities.Category.list();
    setQueue(docs);
    setFolders(flds);
    setCategories(cats);
    if (docs.length > 0 && !selected) setSelected(docs[0]);
    setLoading(false);
  };

  useEffect(() => { loadQueue(); }, []);

  const handleConfirmed = (docIds) => {
    const ids = Array.isArray(docIds) ? docIds : [docIds];
    const remaining = queue.filter(d => !ids.includes(d.id));
    setQueue(remaining);
    setSelected(remaining[0] || null);
  };

  const handleFolderCreated = async () => {
    const flds = await base44.entities.Folder.list();
    setFolders(flds);
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
          {queue.map(doc => {
            const dups = getDuplicates(doc, queue);
            return (
              <button
                key={doc.id}
                onClick={() => setSelected(doc)}
                className={`text-left px-3 py-2.5 rounded-lg border transition-all ${
                  selected?.id === doc.id
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-transparent hover:bg-muted/60"
                }`}
              >
                 <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium truncate flex-1">{doc.title}</p>
                  {dups.length > 0 && (
                    <span title={`${dups.length} possible duplicate(s)`}>
                      <Copy className="h-3 w-3 text-amber-500 shrink-0" />
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{doc.original_filename}</p>
                {doc.ai_data?.is_receipt && (() => {
                  const ai = doc.ai_data;
                  const txType = ai.transaction_type;
                  const tender = ai.tender_type;
                  const last4 = ai.last_four_digits;
                  const amount = ai.amount;
                  const items = ai.items || [];
                  const txColors = { purchase: 'text-emerald-600', return: 'text-red-500', exchange: 'text-blue-500' };
                  return (
                    <div className="mt-1.5 space-y-1">
                      <div className="flex flex-wrap gap-1">
                        {txType && <span className={`text-[10px] font-semibold uppercase ${txColors[txType] || 'text-muted-foreground'}`}>{txType}</span>}
                        {amount != null && <span className="text-[10px] font-mono text-foreground">${Number(amount).toFixed(2)}</span>}
                        {tender && <span className="text-[10px] text-muted-foreground">{tender}{last4 ? ` ••${last4}` : ''}</span>}
                      </div>
                      {items.length > 0 && (
                        <div className="text-[10px] text-muted-foreground space-y-0.5">
                          {items.slice(0, 4).map((item, i) => (
                            <div key={i} className="flex justify-between gap-2">
                              <span className="truncate">{item.name || '—'}</span>
                              <span className="shrink-0 font-mono">{item.total_price != null ? `$${Number(item.total_price).toFixed(2)}` : ''}</span>
                            </div>
                          ))}
                          {items.length > 4 && <p className="text-muted-foreground/60">+{items.length - 4} more</p>}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </button>
            );
          })}
        </div>

        {/* Detail panel */}
        <div className="flex-1 overflow-y-auto">
          {selected && (
           <ReviewDetail
             key={selected.id}
             doc={selected}
             folders={folders}
             categories={categories}
             duplicates={getDuplicates(selected, queue)}
             onConfirmed={handleConfirmed}
             onFolderCreated={handleFolderCreated}
           />
          )}
        </div>
      </div>
    </div>
  );
}