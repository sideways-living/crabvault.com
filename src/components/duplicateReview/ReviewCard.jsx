import { CheckCircle2, Copy, FileText, GitBranch } from "lucide-react";
import DocCard from "./DocCard";
import ReviewActions from "./ReviewActions";

const TYPE_META = {
  exact_duplicate:   { label: "Exact Duplicate",   headerCls: "bg-red-50 border-red-200 text-red-700",   icon: Copy },
  renamed_duplicate: { label: "Renamed Duplicate",  headerCls: "bg-amber-50 border-amber-200 text-amber-700", icon: FileText },
  possible_version:  { label: "Possible Version",   headerCls: "bg-blue-50 border-blue-200 text-blue-700",  icon: GitBranch },
};

const STATUS_BADGE = {
  pending:   "bg-amber-100 text-amber-700",
  resolved:  "bg-emerald-100 text-emerald-700",
  dismissed: "bg-gray-100 text-gray-500",
};

function formatDate(s) {
  if (!s) return "—";
  return new Date(s).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" });
}

export default function ReviewCard({ review, documents, crabs, isResolving, onResolve }) {
  const meta = TYPE_META[review.review_type] || TYPE_META.exact_duplicate;
  const TypeIcon = meta.icon;

  const primaryDoc = documents[review.primary_document_id];
  const candidateDocs = (review.candidate_document_ids || [])
    .map(id => documents[id])
    .filter(Boolean);

  const getCrab = (doc) => {
    if (!doc) return null;
    const id = (doc.crab_ids || [])[0] || doc.matched_crab_id;
    return id ? crabs[id] : null;
  };

  return (
    <div className="bg-card border rounded-2xl overflow-hidden shadow-sm">
      {/* Header bar */}
      <div className={`flex items-center justify-between px-5 py-3 border-b ${meta.headerCls}`}>
        <div className="flex items-center gap-2.5">
          <TypeIcon className="h-4 w-4 shrink-0" />
          <span className="font-semibold text-sm">{meta.label}</span>
          {review.match_reasons?.length > 0 && (
            <span className="text-xs opacity-60 hidden sm:inline">
              · {review.match_reasons.join(", ").replace(/_/g, " ")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2.5">
          {review.match_score != null && (
            <span className="text-[10px] font-mono opacity-60">
              {Math.round(review.match_score * 100)}% confidence
            </span>
          )}
          <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${STATUS_BADGE[review.status] || STATUS_BADGE.pending}`}>
            {review.status}
          </span>
          <span className="text-[10px] text-current opacity-50 hidden sm:inline">
            {formatDate(review.created_date)}
          </span>
        </div>
      </div>

      {/* Document comparison */}
      <div className="p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <DocCard
            doc={primaryDoc}
            crab={getCrab(primaryDoc)}
            label="Incoming"
            isNew={true}
          />
          {candidateDocs.length > 0 ? (
            <DocCard
              doc={candidateDocs[0]}
              crab={getCrab(candidateDocs[0])}
              label="Existing"
              isNew={false}
            />
          ) : (
            <div className="flex-1 rounded-xl border border-dashed border-border p-5 flex items-center justify-center text-muted-foreground text-sm">
              No candidate document
            </div>
          )}
        </div>

        {/* Actions (pending only) */}
        {review.status === "pending" && (
          <ReviewActions
            review={review}
            isResolving={isResolving}
            onResolve={onResolve}
          />
        )}

        {/* Resolved summary */}
        {review.status !== "pending" && review.user_decision && (
          <div className="mt-4 pt-4 border-t flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            <span>Decision:</span>
            <span className="font-medium text-foreground capitalize">
              {review.user_decision.replace(/_/g, " ")}
            </span>
            {review.resolved_at && (
              <span className="text-xs">· {formatDate(review.resolved_at)}</span>
            )}
            {review.decision_notes && (
              <span className="text-xs italic">· {review.decision_notes}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}