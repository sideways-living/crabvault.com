import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Receipt, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import ReceiptsTable from "../components/ReceiptsTable";
import { toast } from "sonner";

export default function ReceiptsPage() {
  const [rescanning, setRescanning] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRescan = async () => {
    if (!confirm("This will reset all receipt documents to pending and reprocess them through AI. Continue?")) return;
    setRescanning(true);
    try {
      const res = await base44.functions.invoke("rescanReceipts", {});
      toast.success(`Queued ${res.data?.queued ?? 0} receipt(s) for reprocessing`);
      setRefreshKey(k => k + 1);
    } catch (err) {
      toast.error("Rescan failed: " + err.message);
    } finally {
      setRescanning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Receipt className="h-6 w-6 text-primary" /> Receipts
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            All scanned receipts with full transaction detail
          </p>
        </div>
        <Button onClick={handleRescan} disabled={rescanning} variant="outline" className="gap-2">
          {rescanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {rescanning ? "Queuing rescan…" : "Rescan All Receipts"}
        </Button>
      </div>

      <div className="bg-card rounded-xl border p-4">
        <ReceiptsTable key={refreshKey} />
      </div>
    </div>
  );
}