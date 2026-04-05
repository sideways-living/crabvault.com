import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Copy, Trash2, Loader2, ExternalLink, AlertTriangle, GitMerge, CheckCircle2, FileText, Plus, FolderPlus } from "lucide-react";
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
      if (sameFilename || sameSize || (sameDay && sameTitle)) { group.push(b); used.add(j); }
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

function FilePreview({ doc }) {
  const isPdf = doc.file_type === 'pdf';
  const isImage = ['jpg', 'jpeg', 'png'].includes(doc.file_type);

  if (!doc.file_url) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-muted-foreground bg-muted/30 rounded-lg">
        <FileText className="h-10 w-10" />
        <span className="text-xs">No preview</span>
      </div>
    );
  }

  if (isImage) {
    return <img src={doc.file_url} alt={doc.title} className="w-full h-full object-contain rounded-lg bg-muted/20" />;
  }

  if (isPdf) {
    return (
      <iframe
        src={doc.file_url}
        title={doc.title}
        className="w-full h-full rounded-lg border"
        style={{ minHeight: 300 }}
      />
    );
  }

  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-muted-foreground bg-muted/30 rounded-lg">
      <FileText className="h-10 w-10" />
      <span className="text-xs uppercase font-medium">{doc.file_type || 'file'}</span>
      <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
        <ExternalLink className="h-3 w-3" /> Open file
      </a>
    </div>
  );
}

function ResolveDialog({ group, folders: initialFolders, onResolved, onClose }) {
  const [keepId, setKeepId] = useState(group[0].id);
  const [titleSource, setTitleSource] = useState(group[0].id);
  const [customTitle, setCustomTitle] = useState('');
  const [useCustomTitle, setUseCustomTitle] = useState(false);
  const docsWithFolders = group.filter(d => d.folder_id);
  const [folderSource, setFolderSource] = useState(docsWithFolders[0]?.id || group[0].id);
  const [useCustomFolder, setUseCustomFolder] = useState(docsWithFolders.length === 0);
  const [customFolderId, setCustomFolderId] = useState('');
  const [folders, setFolders] = useState(initialFolders);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderParent, setNewFolderParent] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewDoc, setPreviewDoc] = useState(group[0]);

  const folderName = (folderId) => {
    if (!folderId) return '(no folder)';
    const f = folders.find(f => f.id === folderId);
    return f ? (f.path || f.name) : '(unknown folder)';
  };

  const finalTitle = useCustomTitle ? customTitle : (group.find(d => d.id === titleSource)?.title || '');
  const finalFolderId = useCustomFolder ? customFolderId : (group.find(d => d.id === folderSource)?.folder_id || undefined);
  const finalFolderName = folderName(finalFolderId);

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    setCreatingFolder(true);
    const parentFolder = folders.find(f => f.id === newFolderParent);
    const path = parentFolder ? `${parentFolder.path || '/' + parentFolder.name}/${newFolderName.trim()}` : `/${newFolderName.trim()}`;
    const created = await base44.entities.Folder.create({
      name: newFolderName.trim(),
      parent_folder_id: newFolderParent || undefined,
      path,
    });
    const updatedFolders = await base44.entities.Folder.list();
    setFolders(updatedFolders);
    setCustomFolderId(created.id);
    setUseCustomFolder(true);
    setShowNewFolder(false);
    setNewFolderName('');
    setNewFolderParent('');
    setCreatingFolder(false);
    toast.success(`Folder "${newFolderName.trim()}" created`);
  };

  const handleMerge = async () => {
    setSaving(true);
    const keepDoc = group.find(d => d.id === keepId);
    const ext = keepDoc?.original_filename?.split('.').pop() || keepDoc?.file_type || '';
    const newFilename = ext ? `${finalTitle}.${ext}` : finalTitle;
    await base44.entities.Document.update(keepId, {
      title: finalTitle,
      original_filename: newFilename,
      folder_id: finalFolderId || undefined,
    });
    const toDelete = group.filter(d => d.id !== keepId);
    await Promise.all(toDelete.map(d => base44.entities.Document.delete(d.id)));
    setSaving(false);
    toast.success(`Merged: kept "${finalTitle}", deleted ${toDelete.length} duplicate${toDelete.length !== 1 ? 's' : ''}`);
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

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl w-full">
        <DialogHeader>
          <DialogTitle>Resolve Duplicates — {group.length} files</DialogTitle>
        </DialogHeader>

        <div className="flex gap-5" style={{ minHeight: 420 }}>
          {/* Left: Preview */}
          <div className="w-64 shrink-0 flex flex-col gap-2">
            <div className="flex-1 border rounded-lg overflow-hidden" style={{ minHeight: 280 }}>
              <FilePreview doc={previewDoc} />
            </div>
            <div className="flex gap-1 flex-wrap">
              {group.map(doc => (
                <button
                  key={doc.id}
                  onClick={() => setPreviewDoc(doc)}
                  className={`text-[10px] px-2 py-1 rounded border transition-colors truncate max-w-[90px] ${previewDoc.id === doc.id ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'}`}
                  title={doc.title}
                >
                  {doc.title?.substring(0, 14) || 'File'}
                </button>
              ))}
            </div>
            <a href={previewDoc.file_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1 justify-center">
              <ExternalLink className="h-3 w-3" /> Open in new tab
            </a>
          </div>

          {/* Right: Options */}
          <div className="flex-1 overflow-y-auto space-y-5 text-sm pr-1">
            {/* Step 1: Keep which file */}
            <div>
              <p className="font-medium mb-2">1. Which file to keep?</p>
              <div className="space-y-2">
                {group.map(doc => (
                  <label key={doc.id} className={`flex items-start gap-3 border rounded-lg px-3 py-2.5 cursor-pointer transition-colors ${keepId === doc.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'}`}>
                    <input type="radio" name="keep" value={doc.id} checked={keepId === doc.id} onChange={() => setKeepId(doc.id)} className="mt-0.5" />
                    <div className="min-w-0">
                      <p className="font-medium truncate">{doc.title}</p>
                      <p className="text-xs text-muted-foreground">{doc.original_filename}{doc.file_size ? ` • ${(doc.file_size / 1024).toFixed(0)} KB` : ''} • {moment(doc.created_date).format('D MMM YYYY')}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Step 2: Title */}
            <div>
              <p className="font-medium mb-2">2. Which title?</p>
              <div className="space-y-1.5">
                {group.map(doc => (
                  <label key={doc.id} className={`flex items-center gap-3 border rounded-lg px-3 py-2 cursor-pointer transition-colors ${!useCustomTitle && titleSource === doc.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'}`}>
                    <input type="radio" name="title" value={doc.id} checked={!useCustomTitle && titleSource === doc.id} onChange={() => { setTitleSource(doc.id); setUseCustomTitle(false); }} />
                    <span className="truncate">{doc.title}</span>
                  </label>
                ))}
                <label className={`flex items-center gap-3 border rounded-lg px-3 py-2 cursor-pointer transition-colors ${useCustomTitle ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'}`}>
                  <input type="radio" name="title" checked={useCustomTitle} onChange={() => setUseCustomTitle(true)} />
                  <span className="text-muted-foreground shrink-0">Custom:</span>
                  <Input
                    value={customTitle}
                    onChange={e => { setCustomTitle(e.target.value); setUseCustomTitle(true); }}
                    onClick={() => setUseCustomTitle(true)}
                    placeholder="Enter custom title…"
                    className="h-7 text-xs flex-1"
                  />
                </label>
              </div>
            </div>

            {/* Step 3: Folder */}
            <div>
              <p className="font-medium mb-2">3. Which folder?</p>
              <div className="space-y-1.5">
                {/* Only show options for docs that actually have a folder */}
                {group.filter(doc => doc.folder_id).map(doc => (
                  <label key={doc.id} className={`flex items-center gap-3 border rounded-lg px-3 py-2 cursor-pointer transition-colors ${!useCustomFolder && folderSource === doc.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'}`}>
                    <input type="radio" name="folder" value={doc.id} checked={!useCustomFolder && folderSource === doc.id} onChange={() => { setFolderSource(doc.id); setUseCustomFolder(false); }} />
                    <span className="text-muted-foreground">{folderName(doc.folder_id)}</span>
                  </label>
                ))}
                {/* Custom existing folder */}
                <label className={`flex items-center gap-3 border rounded-lg px-3 py-2 cursor-pointer transition-colors ${useCustomFolder && !showNewFolder ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'}`}>
                  <input type="radio" name="folder" checked={useCustomFolder && !showNewFolder} onChange={() => { setUseCustomFolder(true); setShowNewFolder(false); }} />
                  <span className="text-muted-foreground shrink-0">Choose:</span>
                  <select
                    value={customFolderId}
                    onChange={e => { setCustomFolderId(e.target.value); setUseCustomFolder(true); setShowNewFolder(false); }}
                    onClick={() => { setUseCustomFolder(true); setShowNewFolder(false); }}
                    className="flex-1 h-7 text-xs border rounded px-2 bg-background"
                  >
                    <option value="">— no folder —</option>
                    {folders.map(f => (
                      <option key={f.id} value={f.id}>{f.path || f.name}</option>
                    ))}
                  </select>
                </label>
                {/* Create new folder */}
                <button
                  type="button"
                  onClick={() => { setShowNewFolder(true); setUseCustomFolder(true); }}
                  className={`w-full flex items-center gap-2 border rounded-lg px-3 py-2 text-xs text-primary hover:bg-primary/5 transition-colors ${showNewFolder ? 'border-primary bg-primary/5' : 'border-dashed'}`}
                >
                  <FolderPlus className="h-3.5 w-3.5" /> Create new folder…
                </button>
                {showNewFolder && (
                  <div className="border rounded-lg px-3 py-3 space-y-2 bg-muted/20">
                    <Input
                      placeholder="Folder name"
                      value={newFolderName}
                      onChange={e => setNewFolderName(e.target.value)}
                      className="h-7 text-xs"
                    />
                    <select
                      value={newFolderParent}
                      onChange={e => setNewFolderParent(e.target.value)}
                      className="w-full h-7 text-xs border rounded px-2 bg-background"
                    >
                      <option value="">— no parent (root) —</option>
                      {folders.map(f => (
                        <option key={f.id} value={f.id}>{f.path || f.name}</option>
                      ))}
                    </select>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleCreateFolder} disabled={creatingFolder || !newFolderName.trim()} className="h-7 text-xs gap-1">
                        {creatingFolder ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                        Create
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setShowNewFolder(false)} className="h-7 text-xs">Cancel</Button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Summary */}
            <div className="bg-muted/40 rounded-lg px-4 py-3 text-xs space-y-1 text-muted-foreground">
              <p><span className="font-medium text-foreground">Title:</span> {finalTitle || '(none)'}</p>
              <p><span className="font-medium text-foreground">Folder:</span> {finalFolderName}</p>
              <p><span className="font-medium text-foreground">Delete:</span> {group.length - 1} other file{group.length - 1 !== 1 ? 's' : ''}</p>
            </div>

            <div className="flex gap-2 pt-1">
              <Button onClick={handleMerge} disabled={saving} className="flex-1 gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitMerge className="h-4 w-4" />}
                Merge & Keep One
              </Button>
              <Button onClick={handleDeleteAll} disabled={saving} variant="destructive" className="gap-2">
                <Trash2 className="h-4 w-4" /> Delete All
              </Button>
              <Button onClick={onClose} disabled={saving} variant="outline">Cancel</Button>
            </div>
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
  const [resolving, setResolving] = useState(null);

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