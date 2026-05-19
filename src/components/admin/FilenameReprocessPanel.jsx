import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Loader2, FileText, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";

export default function FilenameReprocessPanel() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [showResults, setShowResults] = useState(false);
  const [limit, setLimit] = useState(10);

  const run = async (reprocessAll = false) => {
    setLoading(true);
    setResults(null);
    try {
      const res = await base44.functions.invoke("reprocessCrabFilenames", {
        limit,
        reprocess_all: reprocessAll,
      });
      setResults(res.data);
      setShowResults(true);
      toast.success(`Reprocessed ${res.data.processed} document(s) — ${res.data.high_confidence} high confidence`);
    } catch (err) {
      toast.error("Reprocess failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border p-4 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            Bulk Filename Reprocessing
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Generate suggested filenames for existing CrabDocuments using current naming rules.
            Never renames files or changes vault paths — results go to <code className="bg-muted px-1 rounded">suggested_filename</code> for review.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={limit}
            onChange={e => setLimit(Number(e.target.value))}
            className="text-xs border rounded-md px-2 py-1.5 bg-background"
          >
            {[5, 10, 20, 50].map(n => (
              <option key={n} value={n}>{n} docs</option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={() => run(false)} disabled={loading} className="gap-1.5">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
            Process New
          </Button>
          <Button variant="outline" size="sm" onClick={() => run(true)} disabled={loading} className="gap-1.5">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
            Reprocess All
          </Button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Processing documents — this may take a moment…
        </div>
      )}

      {results && !loading && (
        <div className="space-y-3">
          {/* Summary row */}
          <div className="flex items-center gap-4 text-xs flex-wrap">
            <span className="flex items-center gap-1 text-emerald-600 font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {results.processed} processed
            </span>
            <span className="text-muted-foreground">· {results.high_confidence} high confidence</span>
            <span className="text-muted-foreground">· {results.needs_review} needs review</span>
            <button
              onClick={() => setShowResults(v => !v)}
              className="ml-auto flex items-center gap-1 text-primary hover:underline"
            >
              {showResults ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {showResults ? "Hide" : "Show"} details
            </button>
          </div>

          {showResults && results.results?.length > 0 && (
            <div className="max-h-80 overflow-y-auto space-y-1.5 border rounded-lg p-2">
              {results.results.map((r, i) => (
                <div key={i} className="text-xs p-2 bg-muted/30 rounded-md space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`font-medium ${r.confidence === 'high' ? 'text-emerald-700' : r.confidence === 'medium' ? 'text-amber-700' : 'text-red-700'}`}>
                      [{r.confidence}]
                    </span>
                    <span className="font-mono truncate max-w-xs">{r.suggested_filename || "(no suggestion)"}</span>
                  </div>
                  <div className="text-muted-foreground truncate">Current: {r.title}</div>
                  {r.review_reason && (
                    <div className="flex items-center gap-1 text-amber-600">
                      <AlertTriangle className="h-3 w-3 shrink-0" />
                      {r.review_reason}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}