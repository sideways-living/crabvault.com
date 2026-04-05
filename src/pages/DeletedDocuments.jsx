import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Trash2, RotateCcw, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import moment from "moment";

export default function DeletedDocuments() {
  const [deleted, setDeleted] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState([]);

  const loadDeleted = async () => {
    const docs = await base44.entities.Document.filter({ is_deleted: true }, "-deleted_date", 100);
    setDeleted(docs);
    setLoading(false);
  };

  useEffect(() => { loadDeleted(); }, []);

  const getDaysUntilPermanent = (deletedDate) => {
    const days = moment().diff(moment(deletedDate), 'days');
    return Math.max(0, 30 - days);
  };

  const handleRestore = async (ids) => {
    const idArray = Array.isArray(ids) ? ids : [ids];
    await Promise.all(idArray.map(id => base44.entities.Document.update(id, { is_deleted: false, deleted_date: null })));
    loadDeleted();
  };

  const handlePermanentDelete = async (ids) => {
    const idArray = Array.isArray(ids) ? ids : [ids];
    if (!confirm(`Permanently delete ${idArray.length} document(s)? This cannot be undone.`)) return;
    await Promise.all(idArray.map(id => base44.entities.Document.delete(id)));
    loadDeleted();
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === deleted.length) setSelectedIds([]);
    else setSelectedIds(deleted.map(d => d.id));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (deleted.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Deleted Documents</h1>
        <div className="bg-card rounded-xl border p-12 text-center">
          <p className="text-muted-foreground">No deleted documents.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Deleted Documents</h1>
        <p className="text-sm text-muted-foreground mt-1">{deleted.length} in trash</p>
      </div>

      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <span className="text-sm font-medium text-amber-700">{selectedIds.length} selected</span>
          <div className="h-4 w-px bg-border mx-1" />
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => handleRestore(selectedIds)}>
            <RotateCcw className="h-3.5 w-3.5" /> Restore
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 text-destructive hover:bg-destructive/10 border-destructive/30" onClick={() => handlePermanentDelete(selectedIds)}>
            <Trash2 className="h-3.5 w-3.5" /> Delete Permanently
          </Button>
          <button className="ml-auto text-xs text-muted-foreground hover:text-foreground" onClick={() => setSelectedIds([])}>
            Clear selection
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={toggleSelectAll}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {selectedIds.length === deleted.length && deleted.length > 0 ? 'Deselect all' : 'Select all'}
        </button>
      </div>

      <div className="bg-card rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="w-10 px-4 py-3" />
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Deleted</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {deleted.map(doc => {
              const isSelected = selectedIds.includes(doc.id);
              const daysLeft = getDaysUntilPermanent(doc.deleted_date);
              const isExpiring = daysLeft <= 7;

              return (
                <tr key={doc.id} className={`border-b last:border-0 hover:bg-muted/20 transition-colors ${isSelected ? 'bg-primary/5' : ''}`}>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleSelect(doc.id)}
                      className={`h-5 w-5 rounded border-2 flex items-center justify-center transition-all shadow-sm ${
                        isSelected ? 'bg-primary border-primary' : 'border-slate-400 bg-muted hover:border-primary'
                      }`}
                    >
                      {isSelected && (
                        <svg className="h-3 w-3 text-primary-foreground" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium truncate">{doc.title}</p>
                      <p className="text-xs text-muted-foreground">{doc.original_filename}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{moment(doc.deleted_date).format("D MMM")}</span>
                      {isExpiring && (
                        <div className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
                          <AlertTriangle className="h-3 w-3" />
                          {daysLeft} day{daysLeft !== 1 ? 's' : ''}
                        </div>
                      )}
                      {daysLeft === 0 && (
                        <span className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded font-medium">Deleting today</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRestore(doc.id)}
                        className="gap-1.5 text-xs"
                      >
                        <RotateCcw className="h-3 w-3" /> Restore
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}