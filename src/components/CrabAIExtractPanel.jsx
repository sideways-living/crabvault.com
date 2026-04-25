import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, CheckCheck, X, ChevronDown, ChevronUp, AlertCircle } from "lucide-react";
import { toast } from "sonner";

const FIELD_LABELS = {
  first_name: "First Name",
  middle_name: "Middle Name",
  surname: "Surname",
  date_of_birth: "Date of Birth",
  phone: "Phone",
  email: "Email",
  address1: "Address Line 1",
  address2: "Address Line 2",
  suburb: "Suburb",
  state: "State",
  postcode: "Postcode",
  aliases: "Aliases",
  id_numbers: "ID Numbers",
  notes: "Notes",
};

const SCALAR_FIELDS = ["first_name", "middle_name", "surname", "date_of_birth", "phone", "email", "address1", "address2", "suburb", "state", "postcode"];

function formatValue(field, value) {
  if (value === null || value === undefined) return null;
  if (field === "aliases") return Array.isArray(value) ? value.join(", ") : value;
  if (field === "id_numbers") return Array.isArray(value) ? value.map(n => `${n.label}: ${n.value}`).join(" | ") : value;
  return value;
}

export default function CrabAIExtractPanel({ crabId, currentCrab, onApply }) {
  const [loading, setLoading] = useState(false);
  const [extraction, setExtraction] = useState(null);
  const [docCount, setDocCount] = useState(0);
  const [selected, setSelected] = useState({});
  const [expanded, setExpanded] = useState(true);
  const [error, setError] = useState(null);

  const runExtraction = async () => {
    setLoading(true);
    setError(null);
    setExtraction(null);
    setSelected({});
    let res;
    try {
      res = await base44.functions.invoke("aiExtractCrabProfile", { crab_id: crabId });
    } catch (e) {
      setLoading(false);
      setError(e.response?.data?.error || e.message || "Extraction failed");
      return;
    }
    setLoading(false);
    if (res.data?.error) {
      setError(res.data.error);
      return;
    }
    const ext = res.data?.extraction || {};
    setExtraction(ext);
    setDocCount(res.data?.doc_count || 0);
    // Pre-select all fields that have a value and differ from current
    const preSelected = {};
    SCALAR_FIELDS.forEach(f => {
      if (ext[f] && ext[f] !== currentCrab[f]) preSelected[f] = true;
    });
    if (ext.aliases?.length) preSelected.aliases = true;
    if (ext.id_numbers?.length) preSelected.id_numbers = true;
    if (ext.notes) preSelected.notes = true;
    setSelected(preSelected);
  };

  const toggleField = (field) => setSelected(s => ({ ...s, [field]: !s[field] }));

  const applySelected = () => {
    const updates = {};
    SCALAR_FIELDS.forEach(f => {
      if (selected[f] && extraction[f] != null) updates[f] = extraction[f];
    });
    if (selected.aliases && extraction.aliases?.length) {
      // Merge new aliases with existing
      const existing = currentCrab.aliases || [];
      const merged = [...new Set([...existing, ...extraction.aliases])];
      updates.aliases = merged;
    }
    if (selected.id_numbers && extraction.id_numbers?.length) {
      const existing = currentCrab.id_numbers || [];
      updates.id_numbers = [...existing, ...extraction.id_numbers];
    }
    if (selected.notes && extraction.notes) {
      const existing = currentCrab.notes || "";
      updates.notes = existing ? existing + "\n\n[AI Extracted]\n" + extraction.notes : extraction.notes;
    }
    onApply(updates);
    toast.success("Applied AI suggestions — remember to save");
  };

  const hasFindings = extraction && Object.keys(extraction).some(k => {
    if (["confidence", "sources"].includes(k)) return false;
    const v = extraction[k];
    return v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0);
  });

  const selectedCount = Object.values(selected).filter(Boolean).length;

  return (
    <div className="bg-violet-50 border border-violet-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-600" />
          <h2 className="font-semibold text-sm text-violet-900">AI Profile Extraction</h2>
          {extraction && (
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase ${
              extraction.confidence === "high" ? "bg-emerald-100 text-emerald-700" :
              extraction.confidence === "medium" ? "bg-amber-100 text-amber-700" :
              "bg-red-100 text-red-700"
            }`}>
              {extraction.confidence || "?"} confidence
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {extraction && (
            <button onClick={() => setExpanded(e => !e)} className="text-violet-500 hover:text-violet-700">
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          )}
          <Button size="sm" onClick={runExtraction} disabled={loading} className="gap-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {loading ? "Analysing…" : extraction ? "Re-analyse" : "Analyse Documents"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="px-5 pb-4 flex items-center gap-2 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {extraction && expanded && (
        <div className="border-t border-violet-200 px-5 py-4 space-y-4">
          {extraction.sources && (
            <p className="text-xs text-violet-700 italic">Sources: {extraction.sources} ({docCount} document{docCount !== 1 ? "s" : ""})</p>
          )}

          {!hasFindings && (
            <p className="text-xs text-muted-foreground italic">No new information could be extracted from the documents.</p>
          )}

          {hasFindings && (
            <>
              <div className="space-y-2">
                {[...SCALAR_FIELDS, "aliases", "id_numbers", "notes"].map(field => {
                  const raw = extraction[field];
                  const display = formatValue(field, raw);
                  if (!display) return null;
                  const current = formatValue(field, currentCrab[field]);
                  const isDifferent = display !== current;
                  return (
                    <label key={field} className={`flex items-start gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${selected[field] ? "bg-violet-100" : "bg-white/60 hover:bg-white"}`}>
                      <input
                        type="checkbox"
                        checked={!!selected[field]}
                        onChange={() => toggleField(field)}
                        className="mt-0.5 rounded accent-violet-600"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-violet-800">{FIELD_LABELS[field] || field}</span>
                          {isDifferent && current && (
                            <span className="text-[10px] text-amber-600 font-medium">differs from current</span>
                          )}
                          {!current && (
                            <span className="text-[10px] text-emerald-600 font-medium">new</span>
                          )}
                        </div>
                        <p className="text-xs text-foreground mt-0.5 break-words">{display}</p>
                        {isDifferent && current && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">Current: {current}</p>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className="flex items-center gap-3 pt-2 border-t border-violet-200">
                <Button
                  size="sm"
                  onClick={applySelected}
                  disabled={selectedCount === 0}
                  className="gap-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Apply {selectedCount} field{selectedCount !== 1 ? "s" : ""}
                </Button>
                <button onClick={() => setSelected({})} className="text-xs text-violet-500 hover:text-violet-700">Deselect all</button>
                <button
                  onClick={() => {
                    const all = {};
                    [...SCALAR_FIELDS, "aliases", "id_numbers", "notes"].forEach(f => {
                      if (formatValue(f, extraction[f])) all[f] = true;
                    });
                    setSelected(all);
                  }}
                  className="text-xs text-violet-500 hover:text-violet-700"
                >
                  Select all
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}