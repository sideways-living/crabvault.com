import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Trash2, Loader2, ExternalLink, AlertTriangle } from "lucide-react";
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

      // Match by file_size (if both have it)
      const sameSize = a.file_size && b.file_size && a.file_size === b.file_size;

      // Match by same day created
      const sameDay = moment(a.created_date).isSame(moment(b.created_date), 'day');

      // Match by very similar title (strip ext, lowercase, trim)
      const titleA = (a.title || '').toLowerCase().replace(/\.[^/.]+$/, '').trim();
      const titleB = (b.title || '').toLowerCase().replace(/\.[^/.]+$/, '').trim();
      const sameTitle = titleA && titleB && (titleA === titleB || titleA.includes(titleB) || titleB.includes(titleA));

      // Match by same original filename
      const sameFilename = a.original_filename && b.original_filename &&
        a.original_filename.toLowerCase() === b.original_filename.toLowerCase();

      if (sameFilename || sameSize || (sameDay && sameTitle)) {
        group.push(b);
        used.add(j);
      }
    }

    if (group.length > 1) {
      groups.push(group);
    }
  }

  return groups;
}

export default function DuplicateFinder() {
  const [groups, setGroups] = useState(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const handleScan = async () => {
    setLoading(true);
    setGroups(null);
    const docs = await base44.entities.Document.list('-created_date', 500);
    setGroups(groupDuplicates(docs));
    setLoading(false);
  };

  const handleDelete = async (docId) => {
    if (!confirm('Delete this document? This cannot be undone.')) return;
    setDeleting(docId);
    await base44.entities.Document.delete(docId);
    setGroups(prev => prev
      .map(g => g.filter(d => d.id !== docId))
      .filter(g => g.length > 1)
    );
    setDeleting(null);
    toast.success('Document deleted');
  };

  const reasonLabel = (doc, group) => {
    const reasons = [];
    const others = group.filter(d => d.id !== doc.id);
    if (others.some(o => o.original_filename?.toLowerCase() === doc.original_filename?.toLowerCase())) reasons.push('same filename');
    if (others.some(o => o.file_size && o.file_size === doc.file_size)) reasons.push('same size');
    if (others.some(o => moment(o.created_date).isSame(moment(doc.created_date), 'day'))) reasons.push('same date');
    return reasons.join(', ');
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
              ✅ No duplicates found.
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 rounded-lg px-4 py-2">
                <AlertTriangle className="h-4 w-4" />
                Found {groups.length} duplicate group{groups.length !== 1 ? 's' : ''} ({groups.reduce((a, g) => a + g.length, 0)} documents total)
              </div>
              {groups.map((group, gi) => (
                <div key={gi} className="border rounded-lg overflow-hidden">
                  <div className="bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground">
                    Group {gi + 1} — {group.length} duplicates
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
                        <button
                          onClick={() => handleDelete(doc.id)}
                          disabled={deleting === doc.id}
                          className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
                        >
                          {deleting === doc.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}