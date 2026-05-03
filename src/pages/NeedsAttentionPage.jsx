import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Cpu, Loader2, CheckCircle2, AlertTriangle, Clock, FileText, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const STATUS_LABELS = {
  pending: { label: "Pending", color: "text-amber-600 bg-amber-50", icon: Clock },
  processing: { label: "Processing", color: "text-blue-600 bg-blue-50", icon: Loader2 },
  needs_review: { label: "Needs Review", color: "text-orange-600 bg-orange-50", icon: AlertTriangle },
  failed: { label: "Failed", color: "text-red-600 bg-red-50", icon: AlertTriangle },
};

export default function NeedsAttentionPage() {
  const navigate = useNavigate();
  const [docs, setDocs] = useState([]);
  const [crabs, setCrabs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingAll, setProcessingAll] = useState(false);
  const [processingId, setProcessingId] = useState(null);

  const load = useCallback(async () => {
    const [allDocs, allCrabs] = await Promise.all([
      base44.entities.CrabDocument.list("-created_date", 500),
      base44.entities.Crab.list("full_name", 500),
    ]);
    const attention = allDocs.filter(d =>
      !d.is_deleted && ["pending", "processing", "needs_review", "failed"].includes(d.processing_status)
    );
    setDocs(attention);
    setCrabs(allCrabs);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const getCrabNames = (crabIds = []) =>
    crabIds.map(id => crabs.find(c => c.id === id)?.full_name).filter(Boolean);

  // Ensure filename starts with the linked crab's full name followed by " - "
  const ensureFilenamePrefix = async (doc) => {
    if (!doc.crab_ids?.length || !doc.original_filename) return;
    const primaryCrab = crabs.find(c => c.id === doc.crab_ids[0]);
    if (!primaryCrab?.full_name) return;
    const crabName = primaryCrab.full_name;
    const prefix = crabName + " - ";
    if (!doc.original_filename.toLowerCase().startsWith(prefix.toLowerCase())) {
      const newFilename = prefix + doc.original_filename;
      const newVaultPath = doc.vault_path
        ? doc.vault_path.replace(doc.original_filename, newFilename)
        : `/crabs/${crabName}/documents/${newFilename}`;
      await base44.entities.CrabDocument.update(doc.id, {
        original_filename: newFilename,
        vault_path: newVaultPath,
      });
    }
  };

  const processOne = async (doc) => {
    setProcessingId(doc.id);
    try {
      await ensureFilenamePrefix(doc);
      await base44.functions.invoke("processCrabDocument", { document_id: doc.id });
      toast.success(`Processed: ${doc.title}`);
      await load();
    } catch {
      toast.error("Processing failed");
    } finally {
      setProcessingId(null);
    }
  };

  const processAll = async () => {
    const pending = docs.filter(d => d.processing_status === "pending");
    if (pending.length === 0) {
      toast.error("No unprocessed documents");
      return;
    }
    setProcessingAll(true);
    for (const doc of pending) {
      setProcessingId(doc.id);
      try {
        await ensureFilenamePrefix(doc);
        await base44.functions.invoke("processCrabDocument", { document_id: doc.id });
      } catch {
        // continue
      }
    }
    setProcessingId(null);
    setProcessingAll(false);
    toast.success("Done processing");
    await load();
  };

  const pendingCount = docs.filter(d => d.processing_status === "pending").length;
  const needsReviewCount = docs.filter(d => d.processing_status === "needs_review").length;

  if (loading) return (
    <div className="flex justify-center py-16">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Needs Attention</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {docs.length} document{docs.length !== 1 ? "s" : ""} —{" "}
              {pendingCount > 0 && <span>{pendingCount} unprocessed, </span>}
              {needsReviewCount} awaiting review
            </p>
          </div>
        </div>
        {pendingCount > 0 && (
          <Button onClick={processAll} disabled={processingAll} className="gap-2">
            {processingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cpu className="h-4 w-4" />}
            Process All ({pendingCount})
          </Button>
        )}
      </div>

      {docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
          <CheckCircle2 className="h-12 w-12 text-emerald-500 opacity-60" />
          <p className="font-medium">All caught up!</p>
          <p className="text-sm">No documents need attention right now.</p>
          <Link to="/crab-documents"><Button variant="outline" className="mt-2">View All Documents</Button></Link>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Document</th>
                <th className="text-left px-4 py-3 font-medium">Linked Profiles</th>
                <th className="text-left px-4 py-3 font-medium">Summary</th>
                <th className="text-left px-4 py-3 font-medium">Suggested Filename</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {docs.map(doc => {
                const statusDef = STATUS_LABELS[doc.processing_status] || STATUS_LABELS.pending;
                const StatusIcon = statusDef.icon;
                const isProcessingThis = processingId === doc.id;
                const crabNames = getCrabNames(doc.crab_ids);

                return (
                  <tr key={doc.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium truncate max-w-[200px]">{doc.title}</p>
                      {doc.original_filename && (
                        <p className="text-[10px] font-mono text-muted-foreground truncate max-w-[200px]">{doc.original_filename}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {crabNames.length > 0 ? crabNames.map(n => (
                          <span key={n} className="text-[10px] bg-secondary px-1.5 py-0.5 rounded-full">{n}</span>
                        )) : <span className="text-xs text-muted-foreground italic">None</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 max-w-[220px]">
                      {doc.summary ? (
                        <p className="text-xs text-muted-foreground line-clamp-2">{doc.summary}</p>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Not processed yet</span>
                      )}
                    </td>
                    <td className="px-4 py-3 max-w-[180px]">
                      {doc.vault_path ? (
                        <p className="text-[10px] font-mono text-muted-foreground truncate" title={doc.vault_path}>{doc.vault_path.split("/").pop()}</p>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusDef.color}`}>
                        {isProcessingThis
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <StatusIcon className="h-3 w-3" />
                        }
                        {isProcessingThis ? "Processing…" : statusDef.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        {doc.processing_status === "pending" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1 px-2"
                            disabled={isProcessingThis || processingAll}
                            onClick={() => processOne(doc)}
                          >
                            {isProcessingThis ? <Loader2 className="h-3 w-3 animate-spin" /> : <Cpu className="h-3 w-3" />}
                            Process
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs gap-1 px-2"
                          onClick={() => navigate(`/crab-documents/${doc.id}`)}
                        >
                          Review <ChevronRight className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}