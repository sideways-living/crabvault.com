import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Copy, Trash2, Loader2, ExternalLink, AlertTriangle, GitMerge, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";
import moment from "moment";
import { toast } from "sonner";

function groupDuplicates(docs) {
  const groups = [];
  const used = new Set();

  for (let i = 0; i < docs.length; i++) {
    if (used.has(i)) continue;
    const a = docs[i];
    const group = [a];
    used.add(i);

    for (let j = i + 1; j < docs.length; j++) {
      if (used.has(j)) continue;
      const b = docs[j];

      const sameSize = a.file_size && b.file_size && a.file_size === b.file_size;
      const sameDay = moment(a.created_date).isSame(moment(b.created_date), 'day');
      const titleA = (a.title || '').toLowerCase().replace(/\.[^/.]+$/, '').trim();
      const titleB = (b.title || '').toLowerCase().replace(/\.[^/.]+$/, '').trim();
      const sameTitle = titleA && titleB && (titleA === titleB || titleA.includes(titleB) || titleB.includes(titleA));
      const sameFilename = a.original_filename && b.original_filename &&
        a.original_filename.toLowerCase() === b.original_filename.toLowerCase();

      if (sameFilename || sameSize || (sameDay && sameTitle)) {
        group.push(b);
        used.add(j);
      }
    }

    if (group.length > 1) groups.push(group);
  }

  return groups;
}

function reasonLabel(doc, group) {
  const reasons = [];
  const others = group.filter(d => d.id !== doc.id);
  if (others.some(o => o.original_filename?.toLowerCase() === doc.original_filename?.toLowerCase())) reasons.push('same filename');
  if (others.some(o => o.file_size && o.file_size === doc.file_size)) reasons.push('same size');
  if (others.some(o => moment(o.created_date).isSame(moment(doc.created_date), 'day'))) reasons.push('same date');
  return reasons.join(', ');
}

// Modal for resolving a duplicate group
function ResolveDialog({ group, folders, onResolved, onClose }) {
  const [keepId, setKeepId] = useState(group[0].id);
  const [titleSource, setTitleSource] = useState(group[0].id);
  const [folderSource, setFolderSource] = useState(group[0].id);
  const [saving, setSaving] = useState(false);

  const keepDoc = group.find(d => d.id === keepId);
  const titleDoc = group.find(d => d.id === titleSource);
  const folderDoc = group.find(d => d.id === folderSource);

  const handleMerge = async () => {
    setSaving(true);
    // Update keeper with chosen title/folder
    await base44.entities.Document.update(keepId, {
      title: titleDoc.title,
      folder_id: folderDoc.folder_id || undefined,
    });
    // Delete the rest
    const toDelete = group.filter(d => d.id !== keepId);
    await Promise.all(toDelete.map(d => base44.entities.Document.delete(d.id)));
    setSaving(false);
    toast.success(`Merged: kept "${titleDoc.title}", deleted ${toDelete.length} duplicate${toDelete.length !== 1 ? 's' : ''}`);
    onResolved(group);
  };

  const handleDeleteAll = async () => {
    if (!confirm(`Delete all ${group.length} duplicates? This cannot be undone.`)) return;
    setSaving(true);
    await Promise.all(group.map(d => base44.entities.Document.delete(d.id)));
    setSaving(false);
    toast.success(`Deleted ${group.length} documents`);
    onResolved(group);
  };

  const folderName = (folderId) => {
    if (!folderId) return '(no folder)';
    const f = folders.find(f => f.id === folderId);
    return f ? (f.path || f.name) : '(unknown folder)';
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Resolve Duplicates</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 text-sm">
          {/* Step 1: Choose which file to keep */}
          <div>
            <p className="font-medium mb-2">1. Which file do you want to keep?</p>
            <div className="space-y-2">
              {group.map(doc => (
                <label key={doc.id} className={`flex items-start gap-3 border rounded-lg px-3 py-2.5 cursor-pointer transition-colors ${keepId === doc.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'}`}>
                  <input type="radio" name="keep" value={doc.id} checked={keepId === doc.id} onChange={() => setKeepId(doc.id)} className="mt-0.5" />
                  <div className="min-w-0">
                    <p className="font-medium truncate">{doc.title}</p>
                    <p className="text-xs text-muted-foreground">{doc.original_filename} • {doc.file_size ? `${(doc.file_size / 1024).toFixed(0)} KB • ` : ''}{moment(doc.created_date).format('D MMM YYYY')}</p>
                    <p className="text-xs text-muted-foreground">{folderName(doc.folder_id)}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Step 2: Choose title */}
          <div>
            <p className="font-medium mb-2">2. Which title should be used?</p>
            <div className="space-y-1.5">
              {group.map(doc => (
                <label key={doc.id} className={`flex items-center gap-3 border rounded-lg px-3 py-2 cursor-pointer transition-colors ${titleSource === doc.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'}`}>
                  <input type="radio" name="title" value={doc.id} checked={titleSource === doc.id} onChange={() => setTitleSource(doc.id)} />
                  <span className="truncate">{doc.title}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Step 3: Choose folder */}
          <div>
            <p className="font-medium mb-2">3. Which folder location should be used?</p>
            <div className="space-y-1.5">
              {group.map(doc => (
                <label key={doc.id} className={`flex items-center gap-3 border rounded-lg px-3 py-2 cursor-pointer transition-colors ${folderSource === doc.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'}`}>
                  <input type="radio" name="folder" value={doc.id} checked={folderSource === doc.id} onChange={() => setFolderSource(doc.id)} />
                  <span className="text-muted-foreground">{folderName(doc.folder_id)}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Summary */}
          <div className="bg-muted/40 rounded-lg px-4 py-3 text-xs space-y-1 text-muted-foreground">
            <p><span className="font-medium text-foreground">Will keep:</span> "{titleDoc?.title}"</p>
            <p><span className="font-medium text-foreground">In folder:</span> {folderName(folderDoc?.folder_id)}</p>
            <p><span className="font-medium text-foreground">Will delete:</span> {group.length - 1} other document{group.length - 1 !== 1 ? 's' : ''}</p>
          </div>

          <div className="flex gap-2 pt-1">
            <Button onClick={handleMerge} disabled={saving} className="flex-1 gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitMerge className="h-4 w-4" />}
              Merge & Keep One
            </Button>
            <Button onClick={handleDeleteAll} disabled={saving} variant="destructive" className="gap-2">
              <Trash2 className="h-4 w-4" />
              Delete All
            </Button>
            <Button onClick={onClose} disabled={saving} variant="outline">Cancel</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function DuplicateFinder() {
  const [groups, setGroups] = useState(null);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(null); // group being resolved

  const handleScan = async () => {
    setLoading(true);
    setGroups(null);
    const [docs, flds] = await Promise.all([
      base44.entities.Document.list('-created_date', 500),
      base44.entities.Folder.list(),
    ]);
    setFolders(flds);
    setGroups(groupDuplicates(docs));
    setLoading(false);
  };

  const handleResolved = (resolvedGroup) => {
    setResolving(null);
    setGroups(prev => prev.filter(g => g !== resolvedGroup));
  };

  return (
    <div className="bg-card rounded-xl border p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Copy className="h-5 w-5 text-chart-3" />
        <h2 className="font-semibold">Duplicate Finder</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Scans all documents for potential duplicates based on filename, file size, and creation date.
      </p>

      <Button onClick={handleScan} disabled={loading} variant="outline">
        {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
        {loading ? 'Scanning...' : 'Scan for Duplicates'}
      </Button>

      {groups !== null && (
        <div className="space-y-4 pt-2">
          {groups.length === 0 ? (
            <div className="text-sm text-emerald-600 bg-emerald-50 rounded-lg px-4 py-3 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> No duplicates found.
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 rounded-lg px-4 py-2">
                <AlertTriangle className="h-4 w-4" />
                Found {groups.length} duplicate group{groups.length !== 1 ? 's' : ''} ({groups.reduce((a, g) => a + g.length, 0)} documents total)
              </div>
              {groups.map((group, gi) => (
                <div key={gi} className="border rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between bg-muted/40 px-4 py-2">
                    <span className="text-xs font-medium text-muted-foreground">Group {gi + 1} — {group.length} duplicates</span>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => setResolving(group)}>
                      <GitMerge className="h-3.5 w-3.5" /> Resolve
                    </Button>
                  </div>
                  <div className="divide-y">
                    {group.map((doc) => (
                      <div key={doc.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{doc.title}</p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="text-xs text-muted-foreground">{doc.original_filename}</span>
                            {doc.file_size && <span className="text-xs text-muted-foreground">• {(doc.file_size / 1024).toFixed(0)} KB</span>}
                            <span className="text-xs text-muted-foreground">• {moment(doc.created_date).format('D MMM YYYY')}</span>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">{reasonLabel(doc, group)}</Badge>
                          </div>
                        </div>
                        <Link to={`/documents/${doc.id}`} className="text-muted-foreground hover:text-primary transition-colors">
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {resolving && (
        <ResolveDialog
          group={resolving}
          folders={folders}
          onResolved={handleResolved}
          onClose={() => setResolving(null)}
        />
      )}
    </div>
  );
}