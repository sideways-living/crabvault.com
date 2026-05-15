import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Copy, GitMerge, Trash2, X, CheckCircle2, Loader2, FileText, AlertTriangle, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const REVIEW_TYPE_META = {
  exact_duplicate:   { label: "Exact Duplicate",   color: "text-red-600 bg-red-50 border-red-200",    icon: Copy },
  renamed_duplicate: { label: "Renamed Duplicate",  color: "text-amber-600 bg-amber-50 border-amber-200", icon: FileText },
  possible_version:  { label: "Possible Version",   color: "text-blue-600 bg-blue-50 border-blue-200",  icon: GitBranch },
};

const STATUS_META = {
  pending:   { label: "Pending",   color: "text-amber-600 bg-amber-50" },
  resolved:  { label: "Resolved",  color: "text-emerald-600 bg-emerald-50" },
  dismissed: { label: "Dismissed", color: "text-gray-500 bg-gray-100" },
};

function formatBytes(n) {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(s) {
  if (!s) return "—";
  return new Date(s).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" });
}

function MetaRow({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{label}</span>
      <span className="text-sm font-mono break-all">{value || "—"}</span>
    </div>
  );
}

function DocCard({ doc, crab, label, highlight }) {
  if (!doc) return (
    <div className="flex-1 rounded-xl border border-dashed p-5 flex items-center justify-center text-muted-foreground text-sm">
      Document not found
    </div>
  );
  return (
    <div className={`flex-1 rounded-xl border p-5 space-y-4 ${highlight ? "border-primary/40 bg-primary/5" : "bg-card"}`}>
      <div className="flex items-center gap-2">
        <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${highlight ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
          {label}
        </span>
        {doc.processing_status && (
          <span className="text-[10px] text-muted-foreground capitalize">{doc.processing_status?.replace("_", " ")}</span>
        )}
      </div>

      {/* Preview */}
      {doc.file_url && ["jpg", "jpeg", "png", "heic"].includes(doc.file_type) ? (
        <img src={doc.file_url} alt={doc.title} className="w-full max-h-48 object-contain rounded-lg bg-muted" />
      ) : (
        <div className="w-full h-24 rounded-lg bg-muted flex items-center justify-center">
          <FileText className="h-8 w-8 text-muted-foreground/40" />
        </div>
      )}

      <div className="space-y-3">
        <MetaRow label="Title" value={doc.title} />
        <MetaRow label="Filename" value={doc.original_filename} />
        <MetaRow label="Normalised" value={doc.normalized_filename} />
        <MetaRow label="File size" value={formatBytes(doc.file_size)} />
        <MetaRow label="Source modified" value={formatDate(doc.source_modified_at)} />
        <MetaRow label="Uploaded" value={formatDate(doc.created_date)} />
        <MetaRow label="Document date" value={doc.document_date} />
        <MetaRow label="Category" value={doc.category} />
        {crab && <MetaRow label="Profile" value={crab.full_name || crab.canonical_name} />}
        {doc.content_hash && <MetaRow label="Hash (SHA-256)" value={`${doc.content_hash.slice(0, 16)}…`} />}
      </div>

      <Link to={`/crab-documents/${doc.id}`} className="text-xs text-primary hover:underline flex items-center gap-1 mt-2">
        Open document →
      </Link>
    </div>
  );
}

export default function DuplicateReviewPage() {
  const navigate = useNavigate();
  const [reviews, setReviews] = useState([]);
  const [documents, setDocuments] = useState({});
  const [crabs, setCrabs] = useState({});
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(null);
  const [filter, setFilter] = useState("pending");

  const load = useCallback(async () => {
    setLoading(true);
    const allReviews = await base44.entities.DuplicateReview.list("-created_date", 500);

    // Collect all document IDs we need
    const docIds = new Set();
    allReviews.forEach(r => {
      if (r.primary_document_id) docIds.add(r.primary_document_id);
      (r.candidate_document_ids || []).forEach(id => docIds.add(id));
    });

    // Fetch docs and crabs
    const [allDocs, allCrabs] = await Promise.all([
      base44.entities.CrabDocument.list("-created_date", 2000),
      base44.entities.Crab.list("full_name", 500),
    ]);

    const docMap = Object.fromEntries(allDocs.map(d => [d.id, d]));
    const crabMap = Object.fromEntries(allCrabs.map(c => [c.id, c]));

    setDocuments(docMap);
    setCrabs(crabMap);
    setReviews(allReviews);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const getCrabForDoc = (doc) => {
    if (!doc) return null;
    const crabId = (doc.crab_ids || [])[0] || doc.matched_crab_id;
    return crabId ? crabs[crabId] : null;
  };

  const resolve = async (review, decision, notes = "") => {
    setResolving(review.id);
    const primaryDoc = documents[review.primary_document_id];
    const candidateDocs = (review.candidate_document_ids || []).map(id => documents[id]).filter(Boolean);

    try {
      // Apply decision to documents
      if (decision === "keep_existing") {
        // Mark new (primary) as confirmed duplicate, don't delete
        if (primaryDoc) {
          await base44.entities.CrabDocument.update(primaryDoc.id, {
            duplicate_status: "confirmed_duplicate",
            duplicate_review_status: "resolved",
            duplicate_of_document_id: candidateDocs[0]?.id,
            duplicate_decision: { action: "keep_existing", decided_at: new Date().toISOString(), notes },
          });
        }
      } else if (decision === "keep_new") {
        // Mark existing candidates as confirmed duplicates
        for (const cand of candidateDocs) {
          await base44.entities.CrabDocument.update(cand.id, {
            duplicate_status: "confirmed_duplicate",
            duplicate_review_status: "resolved",
            duplicate_of_document_id: primaryDoc?.id,
            duplicate_decision: { action: "keep_new", decided_at: new Date().toISOString(), notes },
          });
        }
        if (primaryDoc) {
          await base44.entities.CrabDocument.update(primaryDoc.id, {
            duplicate_status: "none",
            duplicate_review_status: "resolved",
          });
        }
      } else if (decision === "keep_both") {
        // Clear duplicate flags on both
        const allIds = [primaryDoc?.id, ...candidateDocs.map(d => d.id)].filter(Boolean);
        for (const id of allIds) {
          await base44.entities.CrabDocument.update(id, {
            duplicate_status: "ignored",
            duplicate_review_status: "resolved",
            duplicate_decision: { action: "keep_both", decided_at: new Date().toISOString(), notes },
          });
        }
      } else if (decision === "merge_as_version") {
        // Set up version chain
        const versionGroupId = review.version_group_id || primaryDoc?.version_group_id || crypto.randomUUID();
        if (candidateDocs[0]) {
          await base44.entities.CrabDocument.update(candidateDocs[0].id, {
            is_latest_version: false,
            version_group_id: versionGroupId,
            duplicate_status: "confirmed_version",
            duplicate_review_status: "resolved",
          });
        }
        if (primaryDoc) {
          const prevVersionNumber = candidateDocs[0]?.version_number || candidateDocs[0]?.version || 1;
          await base44.entities.CrabDocument.update(primaryDoc.id, {
            duplicate_status: "confirmed_version",
            duplicate_review_status: "resolved",
            version_number: prevVersionNumber + 1,
            version_group_id: versionGroupId,
            previous_version_id: candidateDocs[0]?.id,
            is_latest_version: true,
            duplicate_decision: { action: "merge_as_version", decided_at: new Date().toISOString(), notes },
          });
        }
      } else if (decision === "dismiss") {
        const allIds = [primaryDoc?.id, ...candidateDocs.map(d => d.id)].filter(Boolean);
        for (const id of allIds) {
          await base44.entities.CrabDocument.update(id, {
            duplicate_status: "ignored",
            duplicate_review_status: "resolved",
            duplicate_decision: { action: "ignore", decided_at: new Date().toISOString(), notes },
          });
        }
      }

      // Update the review record
      await base44.entities.DuplicateReview.update(review.id, {
        status: decision === "dismiss" ? "dismissed" : "resolved",
        user_decision: decision,
        resolved_at: new Date().toISOString(),
        decision_notes: notes,
      });

      toast.success("Review resolved");
      await load();
    } catch (err) {
      toast.error("Failed: " + err.message);
    } finally {
      setResolving(null);
    }
  };

  const filtered = reviews.filter(r => filter === "all" || r.status === filter);
  const pendingCount = reviews.filter(r => r.status === "pending").length;

  if (loading) return (
    <div className="flex justify-center py-16">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Duplicate Review</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {pendingCount} pending review{pendingCount !== 1 ? "s" : ""} · {reviews.length} total
            </p>
          </div>
        </div>
        <div className="flex gap-1 border rounded-lg p-0.5 bg-muted/30">
          {["pending", "resolved", "dismissed", "all"].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${filter === f ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {f}{f === "pending" && pendingCount > 0 ? ` (${pendingCount})` : ""}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center py-24 gap-3 text-muted-foreground">
          <CheckCircle2 className="h-12 w-12 text-emerald-500 opacity-60" />
          <p className="font-medium">No {filter === "all" ? "" : filter} reviews</p>
          {filter !== "all" && (
            <button onClick={() => setFilter("all")} className="text-xs text-primary hover:underline">View all</button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {filtered.map(review => {
            const meta = REVIEW_TYPE_META[review.review_type] || REVIEW_TYPE_META.exact_duplicate;
            const statusMeta = STATUS_META[review.status] || STATUS_META.pending;
            const TypeIcon = meta.icon;
            const primaryDoc = documents[review.primary_document_id];
            const candidateDocs = (review.candidate_document_ids || []).map(id => documents[id]).filter(Boolean);
            const isResolving = resolving === review.id;

            return (
              <div key={review.id} className="bg-card border rounded-2xl overflow-hidden">
                {/* Review header */}
                <div className={`flex items-center justify-between px-5 py-3 border-b ${meta.color} border-opacity-50`}>
                  <div className="flex items-center gap-3">
                    <TypeIcon className="h-4 w-4 shrink-0" />
                    <div>
                      <span className="font-semibold text-sm">{meta.label}</span>
                      {review.match_reasons?.length > 0 && (
                        <span className="ml-2 text-xs opacity-70">· {review.match_reasons.join(", ").replace(/_/g, " ")}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {review.match_score != null && (
                      <span className="text-xs font-mono opacity-70">score: {review.match_score.toFixed(2)}</span>
                    )}
                    <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${statusMeta.color}`}>
                      {statusMeta.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{formatDate(review.created_date)}</span>
                  </div>
                </div>

                {/* Side-by-side document cards */}
                <div className="p-5">
                  <div className="flex gap-4 flex-wrap md:flex-nowrap">
                    <DocCard
                      doc={primaryDoc}
                      crab={getCrabForDoc(primaryDoc)}
                      label="New Document"
                      highlight={true}
                    />
                    {candidateDocs.length > 0 && (
                      <DocCard
                        doc={candidateDocs[0]}
                        crab={getCrabForDoc(candidateDocs[0])}
                        label="Existing Document"
                        highlight={false}
                      />
                    )}
                  </div>

                  {/* Decision buttons — only for pending */}
                  {review.status === "pending" && (
                    <div className="mt-5 pt-4 border-t">
                      <p className="text-xs text-muted-foreground mb-3 font-medium uppercase tracking-wide">
                        {review.review_type === "exact_duplicate" && "This appears to be an exact duplicate. What would you like to do?"}
                        {review.review_type === "renamed_duplicate" && "These appear to be the same file with different names. Which filename do you want to keep?"}
                        {review.review_type === "possible_version" && "This may be a newer version of an existing document. How should it be treated?"}
                      </p>

                      <div className="flex flex-wrap gap-2">
                        {review.review_type === "exact_duplicate" && <>
                          <Button size="sm" variant="outline" disabled={isResolving} onClick={() => resolve(review, "keep_existing")} className="gap-2">
                            {isResolving ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3 text-emerald-600" />}
                            Keep existing
                          </Button>
                          <Button size="sm" variant="outline" disabled={isResolving} onClick={() => resolve(review, "keep_new")} className="gap-2">
                            Keep new
                          </Button>
                          <Button size="sm" variant="outline" disabled={isResolving} onClick={() => resolve(review, "keep_both")} className="gap-2">
                            <Copy className="h-3 w-3" /> Keep both
                          </Button>
                          <Button size="sm" variant="ghost" disabled={isResolving} onClick={() => resolve(review, "dismiss")} className="gap-2 text-muted-foreground">
                            <X className="h-3 w-3" /> Dismiss
                          </Button>
                        </>}

                        {review.review_type === "renamed_duplicate" && <>
                          <Button size="sm" variant="outline" disabled={isResolving} onClick={() => resolve(review, "keep_existing")} className="gap-2">
                            {isResolving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                            Keep existing filename
                          </Button>
                          <Button size="sm" variant="outline" disabled={isResolving} onClick={() => resolve(review, "keep_new")} className="gap-2">
                            Keep new filename
                          </Button>
                          <Button size="sm" variant="outline" disabled={isResolving} onClick={() => resolve(review, "keep_both")} className="gap-2">
                            <Copy className="h-3 w-3" /> Keep both
                          </Button>
                          <Button size="sm" variant="ghost" disabled={isResolving} onClick={() => resolve(review, "dismiss")} className="gap-2 text-muted-foreground">
                            <X className="h-3 w-3" /> Dismiss match
                          </Button>
                        </>}

                        {review.review_type === "possible_version" && <>
                          <Button size="sm" variant="default" disabled={isResolving} onClick={() => resolve(review, "merge_as_version")} className="gap-2">
                            {isResolving ? <Loader2 className="h-3 w-3 animate-spin" /> : <GitMerge className="h-3 w-3" />}
                            Save as new version
                          </Button>
                          <Button size="sm" variant="outline" disabled={isResolving} onClick={() => resolve(review, "keep_both")} className="gap-2">
                            <Copy className="h-3 w-3" /> Keep as separate doc
                          </Button>
                          <Button size="sm" variant="ghost" disabled={isResolving} onClick={() => resolve(review, "dismiss")} className="gap-2 text-muted-foreground">
                            <X className="h-3 w-3" /> Dismiss
                          </Button>
                        </>}
                      </div>
                    </div>
                  )}

                  {/* Resolved state */}
                  {review.status !== "pending" && review.user_decision && (
                    <div className="mt-4 pt-4 border-t flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      Decision: <span className="font-medium capitalize text-foreground">{review.user_decision.replace(/_/g, " ")}</span>
                      {review.resolved_at && <span className="text-xs">· {formatDate(review.resolved_at)}</span>}
                      {review.decision_notes && <span className="text-xs italic">· {review.decision_notes}</span>}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}