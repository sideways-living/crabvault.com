import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertTriangle, CheckCircle2, FileX, Copy, RefreshCw,
  Loader2, FolderSearch, Upload, ExternalLink
} from "lucide-react";
import moment from "moment";
import { toast } from "sonner";

const STATUS_COLORS = {
  completed: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-700",
  processing: "bg-blue-100 text-blue-700",
  needs_review: "bg-purple-100 text-purple-700",
  failed: "bg-red-100 text-red-700",
};

export default function IngressScanner() {
  const [scan, setScan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("missing");
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0, current: "" });
  const fileInputRef = useRef(null);

  const loadScan = async () => {
    setLoading(true);
    try {
      const results = await base44.entities.IngressScan.list("-scanned_at", 1);
      setScan(results[0] || null);
    } catch (e) {
      // no scan yet
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadScan(); }, []);

  const filtered = (list) => {
    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter(item => {
      const name = item.name || item.file?.name || "";
      return name.toLowerCase().includes(q);
    });
  };

  const missingNames = new Set((scan?.missing_files || []).map(f => f.name));

  const handleUploadMissing = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    // Only upload files that are in the missing list
    const toUpload = files.filter(f => missingNames.has(f.name));
    const skipped = files.length - toUpload.length;

    if (toUpload.length === 0) {
      toast.error("None of the selected files match the missing list.");
      return;
    }
    if (skipped > 0) {
      toast.info(`${skipped} file(s) were not in the missing list and will be skipped.`);
    }

    setUploading(true);
    setUploadProgress({ done: 0, total: toUpload.length, current: "" });
    let succeeded = 0;
    let failed = 0;

    for (const file of toUpload) {
      setUploadProgress(p => ({ ...p, current: file.name }));
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("filename", file.name);
        await fetch("/api/functions/ingestDocument", {
          method: "POST",
          headers: { "x-api-key": "" }, // key handled server-side via env
          body: formData,
        });
        succeeded++;
      } catch {
        failed++;
      }
      setUploadProgress(p => ({ ...p, done: p.done + 1 }));
    }

    setUploading(false);
    setUploadProgress({ done: 0, total: 0, current: "" });
    fileInputRef.current.value = "";

    if (succeeded > 0) toast.success(`Uploaded ${succeeded} file(s) successfully.`);
    if (failed > 0) toast.error(`${failed} file(s) failed to upload.`);
    await loadScan();
  };

  const copyMissingList = () => {
    if (!scan?.missing_files) return;
    const text = scan.missing_files.map(f => f.name).join('\n');
    navigator.clipboard.writeText(text);
    toast.success(`Copied ${scan.missing_files.length} filenames`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ingress Scanner</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Compare your local ingress folder against documents in the app
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleUploadMissing}
          />
          <Button variant="outline" onClick={loadScan} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        </div>
      </div>

      {/* Setup instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-5 space-y-2 text-sm text-blue-900">
        <p className="font-semibold flex items-center gap-2"><FolderSearch className="h-4 w-4" /> How to run a scan</p>
        <ol className="list-decimal ml-5 space-y-1 text-blue-800 text-xs">
          <li>Add <code className="bg-white px-1 rounded border border-blue-200">SCAN_URL={window.location.origin}/api/functions/scanIngressFolder</code> to your <code className="bg-white px-1 rounded border border-blue-200">watcher/.env</code></li>
          <li>Run <code className="bg-white px-1 rounded border border-blue-200">node watcher/scan-ingress.js</code> from your project root</li>
          <li>Click <strong>Refresh</strong> above to see results</li>
        </ol>
      </div>

      {!scan ? (
        <div className="bg-card border rounded-xl p-16 text-center flex flex-col items-center gap-3 text-muted-foreground">
          <FolderSearch className="h-10 w-10 opacity-30" />
          <p className="font-medium">No scan results yet</p>
          <p className="text-sm">Run <code className="bg-muted px-1.5 py-0.5 rounded text-xs">node watcher/scan-ingress.js</code> to get started</p>
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="text-xs text-muted-foreground">
            Last scanned: <strong>{moment(scan.scanned_at).format("D MMM YYYY [at] h:mm a")}</strong>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: "Total in Folder", value: scan.total_ingress, color: "text-foreground" },
              { label: "Supported Types", value: scan.total_supported, color: "text-foreground" },
              { label: "Found in App", value: scan.total_found, color: "text-emerald-600" },
              { label: "Missing", value: scan.total_missing, color: "text-red-600" },
              { label: "Duplicates", value: scan.total_duplicates, color: "text-amber-600" },
              { label: "Unsupported", value: scan.total_unsupported, color: "text-muted-foreground" },
            ].map(s => (
              <div key={s.label} className="bg-card border rounded-lg p-4 text-center">
                <p className={`text-2xl font-bold ${s.color}`}>{s.value ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b">
            {[
              { key: "missing", label: `Missing (${scan.total_missing ?? 0})`, icon: FileX },
              { key: "duplicates", label: `Duplicates (${scan.total_duplicates ?? 0})`, icon: Copy },
              { key: "found", label: `Found (${scan.total_found ?? 0})`, icon: CheckCircle2 },
            ].map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                  tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            ))}
          </div>

          {/* Search + actions */}
          <div className="flex items-center gap-2">
            <Input
              placeholder="Search filenames…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="max-w-xs h-8 text-sm"
            />
            {tab === "missing" && scan.total_missing > 0 && (
              <>
                <Button variant="outline" size="sm" onClick={copyMissingList} className="gap-1.5 h-8">
                  <Copy className="h-3.5 w-3.5" /> Copy missing list
                </Button>
                <Button
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="gap-1.5 h-8"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {uploadProgress.done}/{uploadProgress.total} — {uploadProgress.current}
                    </>
                  ) : (
                    <>
                      <Upload className="h-3.5 w-3.5" /> Upload missing files
                    </>
                  )}
                </Button>
              </>
            )}
          </div>

          {/* Missing tab */}
          {tab === "missing" && (
            <div className="space-y-1">
              {scan.total_missing === 0 ? (
                <div className="text-center py-10 text-emerald-600 flex flex-col items-center gap-2">
                  <CheckCircle2 className="h-8 w-8" />
                  <p className="font-medium">All files are accounted for!</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <p>{scan.total_missing} files are in the ingress folder but not in the app. Use your watcher to re-upload them, or check if they were skipped due to errors.</p>
                  </div>
                  <div className="rounded-xl border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground">Filename</th>
                          <th className="text-right px-4 py-2.5 font-medium text-xs text-muted-foreground w-24">Size</th>
                          <th className="text-right px-4 py-2.5 font-medium text-xs text-muted-foreground w-36">Modified</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {filtered(scan.missing_files || []).map((f, i) => (
                          <tr key={i} className="hover:bg-muted/30">
                            <td className="px-4 py-2.5 font-mono text-xs">{f.name}</td>
                            <td className="px-4 py-2.5 text-right text-xs text-muted-foreground">
                              {f.size_bytes ? `${(f.size_bytes / 1024).toFixed(0)} KB` : "—"}
                            </td>
                            <td className="px-4 py-2.5 text-right text-xs text-muted-foreground">
                              {f.modified_iso ? moment(f.modified_iso).format("D MMM YY") : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Duplicates tab */}
          {tab === "duplicates" && (
            <div className="space-y-1">
              {(scan.duplicate_files || []).length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">No duplicates found</div>
              ) : (
                <div className="rounded-xl border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground">Filename</th>
                        <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground">Statuses</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filtered(scan.duplicate_files || []).map((d, i) => (
                        <tr key={i} className="hover:bg-muted/30">
                          <td className="px-4 py-2.5 font-mono text-xs">{d.file?.name}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex flex-wrap gap-1">
                              {(d.doc_statuses || []).map((s, j) => (
                                <span key={j} className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${STATUS_COLORS[s] || "bg-muted"}`}>{s}</span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Found tab */}
          {tab === "found" && (
            <div className="rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground">Filename</th>
                    <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground w-32">Status</th>
                    <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground w-24">View</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered(scan.found_files || []).map((f, i) => (
                    <tr key={i} className="hover:bg-muted/30">
                      <td className="px-4 py-2.5 font-mono text-xs">{f.name}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${STATUS_COLORS[f.status] || "bg-muted"}`}>{f.status}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <a href={`/documents/${f.doc_id}`} className="text-primary hover:underline text-xs flex items-center gap-1">
                          <ExternalLink className="h-3 w-3" /> Open
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}