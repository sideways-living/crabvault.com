import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle, CheckCircle2, Wrench, Users, FileWarning, HardDrive, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

function SectionCard({ title, icon: Icon, items, emptyMsg, renderItem }) {
  if (!items || items.length === 0) {
    return (
      <div className="rounded-xl border p-4">
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
          <Icon className="h-4 w-4 text-muted-foreground" /> {title}
        </h3>
        <p className="text-xs text-emerald-600 flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5" /> {emptyMsg}
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border p-4">
      <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
        <Icon className="h-4 w-4 text-amber-500" />
        {title}
        <span className="ml-auto text-xs font-normal bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
          {items.length} issue{items.length !== 1 ? "s" : ""}
        </span>
      </h3>
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {items.map((item, i) => (
          <div key={i} className="text-xs p-2 bg-muted/40 rounded-lg space-y-0.5">
            {renderItem(item)}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminRepairPage() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);

  const run = async (dryRun) => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke("adminRepairTool", { dry_run: dryRun });
      setReport(res.data);
      if (!dryRun && res.data.summary.documents_repaired > 0) {
        toast.success(`Repair complete — ${res.data.summary.documents_repaired} document(s) moved to needs_review`);
      } else if (!dryRun) {
        toast.success("Repair complete — no changes needed");
      }
    } catch (err) {
      toast.error("Repair tool failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admin Repair Tool</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Diagnose and fix integrity issues. Never deletes anything.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => run(true)} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldAlert className="h-3.5 w-3.5" />}
            Dry Run (Report Only)
          </Button>
          <Button size="sm" onClick={() => run(false)} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wrench className="h-3.5 w-3.5" />}
            Run Repairs
          </Button>
        </div>
      </div>

      {!report && !loading && (
        <div className="flex flex-col items-center py-20 gap-3 text-muted-foreground">
          <Wrench className="h-12 w-12 opacity-20" />
          <p className="text-sm">Run a dry-run first to see issues without making changes.</p>
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {report && !loading && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="rounded-xl border p-4 bg-muted/20">
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-semibold">Summary</h3>
              {report.dry_run && (
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Dry Run</span>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: "Duplicate Profiles", value: report.summary.duplicate_profile_groups },
                { label: "Stale AI Results", value: report.summary.stale_ai_results },
                { label: "Preview Sync Issues", value: report.summary.missing_preview_sync },
                { label: "Invalid Vault Paths", value: report.summary.invalid_vault_paths },
                { label: "Unverified Synced Docs", value: report.summary.unverified_synced_docs },
                { label: "Documents Repaired", value: report.summary.documents_repaired },
              ].map(({ label, value }) => (
                <div key={label} className="text-center p-3 bg-card rounded-lg border">
                  <div className={`text-xl font-bold ${value > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                    {value}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
                </div>
              ))}
            </div>
          </div>

          <SectionCard
            title="Duplicate Crab Profiles"
            icon={Users}
            items={report.duplicate_profiles}
            emptyMsg="No duplicate profiles found"
            renderItem={item => (
              <>
                <span className="font-medium">{item.full_name}</span>
                <span className="text-muted-foreground ml-2">({item.count} profiles)</span>
                <div className="text-muted-foreground">Oldest: {item.oldest_id}</div>
                <div className="text-muted-foreground">Duplicates: {item.duplicates.join(", ")}</div>
              </>
            )}
          />

          <SectionCard
            title="Stale AI Results"
            icon={AlertTriangle}
            items={report.stale_ai_results}
            emptyMsg="All AI results match current file hashes"
            renderItem={item => (
              <>
                <span className="font-medium">{item.title}</span>
                <div className="text-muted-foreground">Reason: {item.reason}</div>
                <div className="text-muted-foreground font-mono truncate">ID: {item.id}</div>
              </>
            )}
          />

          <SectionCard
            title="Preview / Summary Sync Issues"
            icon={FileWarning}
            items={report.missing_preview_sync}
            emptyMsg="All summaries bound to correct file URLs"
            renderItem={item => (
              <>
                <span className="font-medium">{item.title}</span>
                <div className="text-muted-foreground">Reason: {item.reason}</div>
                <div className="text-muted-foreground font-mono truncate">ID: {item.id}</div>
              </>
            )}
          />

          <SectionCard
            title="Invalid Vault Paths"
            icon={HardDrive}
            items={report.invalid_vault_paths}
            emptyMsg="All crab-linked documents have valid vault paths"
            renderItem={item => (
              <>
                <span className="font-medium">{item.title}</span>
                <div className="text-muted-foreground">Path: {item.vault_path || "(empty)"}</div>
                <div className="text-muted-foreground font-mono truncate">ID: {item.id}</div>
              </>
            )}
          />

          <SectionCard
            title="Unverified Synced Documents"
            icon={ShieldAlert}
            items={report.unverified_synced_docs}
            emptyMsg="All synced documents have verified hashes"
            renderItem={item => (
              <>
                <span className="font-medium">{item.title}</span>
                <div className="text-muted-foreground">Vault: {item.vault_path}</div>
                <div className="text-muted-foreground font-mono truncate">ID: {item.id}</div>
              </>
            )}
          />

          {report.actions_taken?.length > 0 && (
            <div className="rounded-xl border p-4">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Actions Taken
              </h3>
              <div className="space-y-1">
                {report.actions_taken.map((a, i) => (
                  <div key={i} className="text-xs text-muted-foreground">
                    {a.action}: <span className="font-mono">{a.document_id}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}