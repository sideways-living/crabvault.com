import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, CheckCircle2, ScanSearch, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import ReviewCard from "@/components/duplicateReview/ReviewCard";

const FILTERS = ["pending", "resolved", "dismissed", "all"];

export default function DuplicateReviewPage() {
  const [reviews, setReviews] = useState([]);
  const [documents, setDocuments] = useState({});
  const [crabs, setCrabs] = useState({});
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(null); // review.id being resolved
  const [scanning, setScanning] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [filter, setFilter] = useState("pending");

  const load = useCallback(async () => {
    setLoading(true);
    const [allReviews, allDocs, allCrabs] = await Promise.all([
      base44.entities.DuplicateReview.list("-created_date", 500),
      base44.entities.CrabDocument.list("-created_date", 2000),
      base44.entities.Crab.list("full_name", 500),
    ]);
    setReviews(allReviews);
    setDocuments(Object.fromEntries(allDocs.map(d => [d.id, d])));
    setCrabs(Object.fromEntries(allCrabs.map(c => [c.id, c])));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const resolve = async (review, decision) => {
    setResolving(review.id);
    const now = new Date().toISOString();
    const primaryDoc = documents[review.primary_document_id];
    const candidateDocs = (review.candidate_document_ids || [])
      .map(id => documents[id])
      .filter(Boolean);
    const existingDoc = candidateDocs[0]; // primary comparison target

    try {
      if (decision === "keep_existing") {
        // New/incoming doc is the confirmed duplicate — mark it, leave existing untouched
        if (primaryDoc) {
          await base44.entities.CrabDocument.update(primaryDoc.id, {
            duplicate_status: "confirmed_duplicate",
            duplicate_review_status: "resolved",
            duplicate_of_document_id: existingDoc?.id || null,
            is_latest_version: false,
            duplicate_decision: {
              action: "keep_existing",
              decided_at: now,
            },
          });
        }
      } else if (decision === "keep_new") {
        // Existing doc is now the duplicate — mark it; clear flags on new doc
        if (existingDoc) {
          await base44.entities.CrabDocument.update(existingDoc.id, {
            duplicate_status: "confirmed_duplicate",
            duplicate_review_status: "resolved",
            duplicate_of_document_id: primaryDoc?.id || null,
            is_latest_version: false,
            duplicate_decision: {
              action: "keep_new",
              decided_at: now,
            },
          });
        }
        if (primaryDoc) {
          await base44.entities.CrabDocument.update(primaryDoc.id, {
            duplicate_status: "none",
            duplicate_review_status: "resolved",
            is_latest_version: true,
          });
        }
      } else if (decision === "keep_both") {
        // Dismiss the match — treat both as independent docs
        const ids = [primaryDoc?.id, existingDoc?.id].filter(Boolean);
        for (const id of ids) {
          await base44.entities.CrabDocument.update(id, {
            duplicate_status: "ignored",
            duplicate_review_status: "resolved",
            duplicate_decision: { action: "keep_both", decided_at: now },
          });
        }
      } else if (decision === "merge_as_version") {
        // Confirm version chain
        const versionGroupId =
          review.version_group_id ||
          primaryDoc?.version_group_id ||
          existingDoc?.version_group_id ||
          crypto.randomUUID();

        const prevVersionNumber = existingDoc?.version_number || existingDoc?.version || 1;
        const newVersionNumber = prevVersionNumber + 1;

        // Existing doc → no longer latest
        if (existingDoc) {
          await base44.entities.CrabDocument.update(existingDoc.id, {
            is_latest_version: false,
            version_group_id: versionGroupId,
            duplicate_status: "confirmed_version",
            duplicate_review_status: "resolved",
          });
        }
        // New doc → latest version
        if (primaryDoc) {
          await base44.entities.CrabDocument.update(primaryDoc.id, {
            duplicate_status: "confirmed_version",
            duplicate_review_status: "resolved",
            version_number: newVersionNumber,
            version_group_id: versionGroupId,
            previous_version_id: existingDoc?.id || null,
            is_latest_version: true,
            duplicate_decision: {
              action: "merge_as_version",
              decided_at: now,
            },
          });
        }
      } else if (decision === "dismiss") {
        const ids = [primaryDoc?.id, existingDoc?.id].filter(Boolean);
        for (const id of ids) {
          await base44.entities.CrabDocument.update(id, {
            duplicate_status: "ignored",
            duplicate_review_status: "resolved",
            duplicate_decision: { action: "ignore", decided_at: now },
          });
        }
      }

      // Mark the review itself as resolved/dismissed
      await base44.entities.DuplicateReview.update(review.id, {
        status: decision === "dismiss" ? "dismissed" : "resolved",
        user_decision: decision,
        resolved_at: now,
      });

      toast.success("Review resolved");
      await load();
    } catch (err) {
      toast.error("Failed: " + err.message);
    } finally {
      setResolving(null);
    }
  };

  const filtered = filter === "all"
    ? reviews
    : reviews.filter(r => r.status === filter);

  const pendingCount = reviews.filter(r => r.status === "pending").length;

  const runBackfill = async () => {
    setBackfilling(true);
    try {
      const res = await base44.functions.invoke("backfillContentHashes", {});
      const { hashes_updated, skipped } = res.data;
      toast.success(`Hash backfill complete — ${hashes_updated} updated, ${skipped} skipped`);
    } catch (err) {
      toast.error("Backfill failed: " + err.message);
    } finally {
      setBackfilling(false);
    }
  };

  const runScan = async () => {
    setScanning(true);
    try {
      const res = await base44.functions.invoke("scanExistingDuplicates", {});
      const { new_reviews_created, scanned_crab_documents, scanned_documents } = res.data;
      toast.success(
        `Scan complete — ${scanned_crab_documents + scanned_documents} docs scanned, ${new_reviews_created} new review${new_reviews_created !== 1 ? "s" : ""} created`
      );
      await load();
    } catch (err) {
      toast.error("Scan failed: " + err.message);
    } finally {
      setScanning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Duplicate Review</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {pendingCount} pending · {reviews.length} total
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={runBackfill}
            disabled={backfilling || loading}
            className="gap-2"
          >
            {backfilling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Hash className="h-3.5 w-3.5" />}
            {backfilling ? "Backfilling…" : "Backfill Hashes"}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={runScan}
            disabled={scanning || loading}
            className="gap-2"
          >
            {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanSearch className="h-3.5 w-3.5" />}
            {scanning ? "Scanning…" : "Scan Existing Documents"}
          </Button>

          {/* Filter tabs */}
          <div className="flex gap-0.5 border rounded-lg p-0.5 bg-muted/30">
            {FILTERS.map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${
                  filter === f
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f === "pending" && pendingCount > 0 ? `Pending (${pendingCount})` : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center py-24 gap-3 text-muted-foreground">
          <CheckCircle2 className="h-12 w-12 text-emerald-400 opacity-60" />
          <p className="font-medium">
            {filter === "pending" ? "No pending reviews — all clear!" : `No ${filter} reviews`}
          </p>
          {filter !== "all" && (
            <button onClick={() => setFilter("all")} className="text-xs text-primary hover:underline">
              View all reviews
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {filtered.map(review => (
            <ReviewCard
              key={review.id}
              review={review}
              documents={documents}
              crabs={crabs}
              isResolving={resolving === review.id}
              onResolve={resolve}
            />
          ))}
        </div>
      )}
    </div>
  );
}