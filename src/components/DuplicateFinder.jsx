import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Copy, Trash2, Loader2, ExternalLink, AlertTriangle,
  CheckCircle2, FileText, RefreshCw, Shield
} from "lucide-react";
import moment from "moment";
import { toast } from "sonner";

// ─── Duplicate grouping ───────────────────────────────────────────────────────
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

function reasonTags(doc, group) {
  const tags = [];
  const others = group.filter(d => d.id !== doc.id);
  if (others.some(o => o.original_filename?.toLowerCase() === doc.original_filename?.toLowerCase())) tags.push('same filename');
  if (others.some(o => o.file_size && o.file_size === doc.file_size)) tags.push('same size');
  if (others.some(o => moment(o.created_date).isSame(moment(doc.created_date), 'day'))) tags.push('same date');
  return tags;
}

// ─── File Preview ─────────────────────────────────────────────────────────────
function FilePreview({ doc }) {
  const type = (doc.file_type || '').toLowerCase();
  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(type);

  if (!doc.file_url) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-muted-foreground bg-muted/20">
        <FileText className="h-12 w-12 opacity-30" />
        <span className="text-xs">No preview</span>
      </div>
    );
  }
  if (isImage) {
    return <img src={doc.file_url} alt={doc.title} className="w-full h-full object-contain bg-zinc-50" />;
  }
  if (type === 'pdf') {
    return <iframe src={doc.file_url} title={doc.title} className="w-full h-full border-0" style={{ display: 'block' }} />;
  }
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-muted-foreground bg-muted/20">
      <FileText className="h-12 w-12 opacity-30" />
      <span className="text-xs uppercase font-medium">{type || 'file'}</span>
      <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
        <ExternalLink className="h-3 w-3" /> Open file
      </a>
    </div>
  );
}

// ─── Comparison Panel ─────────────────────────────────────────────────────────
function ComparisonPanel({ group, onResolved }) {
  const [keepId, setKeepId] = useState(group[0].id);
  const [saving, setSaving] = useState(false);

  const handleKeepOne = async () => {
    setSaving(true);
    const toDelete = group.filter(d => d.id !== keepId);
    await Promise.all(toDelete.map(d => base44.entities.Document.delete(d.id)));
    await base44.entities.LearningLog.create({
      action_type: 'duplicate_resolved',
      original_title: group.find(d => d.id === keepId)?.title || '',
      new_title: group.find(d => d.id === keepId)?.title || '',
      duplicates_deleted: toDelete.length,
      notes: `Resolved ${group.length} duplicates via side-by-side comparison`,
    });
    setSaving(false);
    toast.success(`Kept 1, deleted ${toDelete.length} duplicate${toDelete.length !== 1 ? 's' : ''}`);
    onResolved(group);
  };

  const handleDeleteAll = async () => {
    if (!confirm(`Delete all ${group.length} files in this group?`)) return;
    setSaving(true);
    await Promise.all(group.map(d => base44.entities.Document.delete(d.id)));
    setSaving(false);
    toast.success(`Deleted all ${group.length} files`);
    onResolved(group);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b flex items-center justify-between">
        <div>
          <h2 className="font-semibold">{group.length} duplicate files</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Select the file to keep, then resolve</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleKeepOne} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
            Keep selected, delete rest
          </Button>
          <Button onClick={handleDeleteAll} disabled={saving} variant="destructive" className="gap-2">
            <Trash2 className="h-4 w-4" /> Delete all
          </Button>
        </div>
      </div>

      {/* Side-by-side previews */}
      <div className="flex-1 min-h-0 flex gap-0 divide-x overflow-x-auto">
        {group.map(doc => {
          const isKept = keepId === doc.id;
          const tags = reasonTags(doc, group);
          return (
            <div
              key={doc.id}
              className="flex flex-col min-w-0 cursor-pointer transition-all"
              style={{ flex: `1 1 ${100 / group.length}%`, minWidth: 220 }}
              onClick={() => setKeepId(doc.id)}
            >
              {/* Selection header */}
              <div className={`shrink-0 px-4 py-2.5 flex items-center gap-2 transition-colors ${isKept ? 'bg-primary text-primary-foreground' : 'bg-muted/40 hover:bg-muted/70'}`}>
                <div className={`h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center ${isKept ? 'border-white bg-white' : 'border-current'}`}>
                  {isKept && <div className="h-2 w-2 rounded-full bg-primary" />}
                </div>
                <span className="text-xs font-medium truncate">{isKept ? '✓ Keep this' : 'Click to keep'}</span>
              </div>

              {/* Preview */}
              <div className="flex-1 min-h-0 overflow-hidden">
                <FilePreview doc={doc} />
              </div>

              {/* Metadata footer */}
              <div className={`shrink-0 px-3 py-3 border-t space-y-1 text-xs ${isKept ? 'bg-primary/5' : 'bg-background'}`}>
                <p className="font-medium truncate" title={doc.title}>{doc.title}</p>
                <p className="text-muted-foreground truncate">{doc.original_filename || '—'}</p>
                <div className="flex flex-wrap gap-1 items-center text-muted-foreground">
                  {doc.file_size && <span>{(doc.file_size / 1024).toFixed(0)} KB</span>}
                  <span>• {moment(doc.created_date).format('D MMM YY')}</span>
                </div>
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {tags.map(t => (
                    <Badge key={t} variant="outline" className="text-[10px] px-1.5 py-0 text-amber-700 border-amber-300 bg-amber-50">{t}</Badge>
                  ))}
                </div>
                <a
                  href={doc.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="inline-flex items-center gap-1 text-primary hover:underline mt-1"
                >
                  <ExternalLink className="h-3 w-3" /> Open original
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function DuplicateFinder() {
  const [groups, setGroups] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);

  const handleScan = async () => {
    setLoading(true);
    setGroups(null);
    setSelectedGroup(null);
    const docs = await base44.entities.Document.filter({ is_deleted: false }, '-created_date', 10000);
    const found = groupDuplicates(docs);
    setGroups(found);
    if (found.length > 0) setSelectedGroup(found[0]);
    setLoading(false);
  };

  const handleResolved = (resolvedGroup) => {
    setGroups(prev => {
      const next = prev.filter(g => g !== resolvedGroup);
      setSelectedGroup(next.length > 0 ? next[0] : null);
      return next;
    });
  };

  // Auto-scan on mount
  useEffect(() => { handleScan(); }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
        <Loader2 className="h-7 w-7 animate-spin" />
        <p className="text-sm">Scanning all documents for duplicates…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-130px)]">
      {/* Top bar */}
      <div className="shrink-0 flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Duplicate Finder</h1>
          {groups !== null && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {groups.length === 0
                ? 'No duplicates found'
                : `${groups.length} group${groups.length !== 1 ? 's' : ''} · ${groups.reduce((a, g) => a + g.length, 0)} files`}
            </p>
          )}
        </div>
        <Button onClick={handleScan} variant="outline" className="gap-2">
          <RefreshCw className="h-4 w-4" /> Re-scan
        </Button>
      </div>

      {groups !== null && groups.length === 0 && (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 text-emerald-600 bg-emerald-50 rounded-xl border border-emerald-200">
          <CheckCircle2 className="h-10 w-10" />
          <p className="font-medium">No duplicates found</p>
          <p className="text-sm text-muted-foreground">All your documents appear to be unique.</p>
        </div>
      )}

      {groups !== null && groups.length > 0 && (
        <div className="flex flex-1 min-h-0 gap-4">
          {/* Left: group list */}
          <div className="w-64 shrink-0 flex flex-col gap-1 overflow-y-auto">
            {groups.map((group, gi) => {
              const isSelected = selectedGroup === group;
              return (
                <button
                  key={gi}
                  onClick={() => setSelectedGroup(group)}
                  className={`text-left px-3 py-3 rounded-lg border transition-all ${isSelected ? 'border-primary bg-primary/5 shadow-sm' : 'border-transparent hover:bg-muted/60'}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    <span className="text-xs font-semibold text-amber-700">{group.length} duplicates</span>
                  </div>
                  <p className="text-sm font-medium truncate">{group[0].title}</p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{group[0].original_filename}</p>
                </button>
              );
            })}
          </div>

          {/* Right: comparison panel */}
          <div className="flex-1 min-w-0 border rounded-xl overflow-hidden bg-card">
            {selectedGroup
              ? <ComparisonPanel key={selectedGroup[0].id} group={selectedGroup} onResolved={handleResolved} />
              : <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Select a group to compare</div>
            }
          </div>
        </div>
      )}
    </div>
  );
}