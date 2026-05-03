import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Users, FileText, Building2, AlertTriangle, Clock, CheckCircle2, ArrowRight, Settings, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// eslint-disable-next-line no-unused-vars

export default function CrabVaultDashboard() {
  const [stats, setStats] = useState(null);
  const [recentCrabs, setRecentCrabs] = useState([]);
  const [pendingDocs, setPendingDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    Promise.all([
      base44.entities.Crab.filter({ is_deleted: false }, "-created_date", 500),
      base44.entities.CrabDocument.filter({ is_deleted: false }, "-created_date", 200),
      base44.entities.TargetMarket.list("name", 200),
    ]).then(([crabs, docs, markets]) => {
      setRecentCrabs(crabs.slice(0, 6));
      setPendingDocs(docs.filter(d => ["needs_review", "pending", "processing"].includes(d.processing_status)).slice(0, 5));
      setStats({
        totalCrabs: crabs.length,
        activeCrabs: crabs.filter(c => c.status === "active").length,
        totalDocs: docs.length,
        pendingDocs: docs.filter(d => ["pending", "processing", "needs_review"].includes(d.processing_status)).length,
        totalMarkets: markets.length,
        syncedDocs: docs.filter(d => d.synced_to_vault).length,
      });
      setLoading(false);
    });
  }, []);

  if (loading) return (
    <div className="flex justify-center py-16">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const STATUS_COLORS = {
    active: "bg-emerald-100 text-emerald-700",
    inactive: "bg-gray-100 text-gray-600",
    banned: "bg-red-100 text-red-700",
    watch: "bg-amber-100 text-amber-700",
  };

  const handleDeleteDoc = async (doc, e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete "${doc.title}"? This cannot be undone.`)) return;
    await base44.entities.CrabDocument.update(doc.id, { is_deleted: true });
    toast.success("Document deleted");
    setPendingDocs(prev => prev.filter(d => d.id !== doc.id));
  };

  const handleUpdateVaultPaths = async () => {
    setUpdating(true);
    try {
      const result = await base44.functions.invoke('updateCrabDocumentVaultPaths', {});
      toast.success(`Updated ${result.data.updated} document vault path(s)`);
    } catch (error) {
      toast.error('Failed to update vault paths');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">CrabVault</h1>
          <p className="text-sm text-muted-foreground mt-1">Intelligence overview</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleUpdateVaultPaths}
          disabled={updating}
          className="gap-2"
        >
          <Settings className="h-4 w-4" />
          {updating ? "Updating..." : "Update Vault Paths"}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {[
          { label: "Total Crabs", value: stats.totalCrabs, sub: `${stats.activeCrabs} active`, icon: Users, color: "text-primary" },
          { label: "Documents", value: stats.totalDocs, sub: `${stats.syncedDocs} vaulted`, icon: FileText, color: "text-emerald-600" },
          { label: "Needs Attention", value: stats.pendingDocs, sub: "pending / review", icon: AlertTriangle, color: "text-amber-600" },
          { label: "Markets", value: stats.totalMarkets, sub: "target sectors", icon: Building2, color: "text-purple-600" },
        ].map(s => (
          <div key={s.label} className="bg-card border rounded-xl p-5">
            <s.icon className={`h-5 w-5 ${s.color} mb-3`} />
            <div className="text-2xl font-bold">{s.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Crabs */}
        <div className="bg-card border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Recent Crabs</h2>
            <Link to="/crabs" className="text-xs text-primary hover:underline flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {recentCrabs.map(crab => (
              <Link key={crab.id} to={`/crabs/${crab.id}`}>
                <div className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/40 transition-colors">
                  {crab.photo_url ? (
                    <img src={crab.photo_url} alt={crab.full_name} className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
                      {crab.full_name?.[0]?.toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{crab.full_name}</p>
                    {(crab.aliases || []).length > 0 && (
                      <p className="text-xs text-muted-foreground truncate">aka {crab.aliases.join(", ")}</p>
                    )}
                  </div>
                  <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded shrink-0 ${STATUS_COLORS[crab.status] || ""}`}>
                    {crab.status}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Pending Documents */}
        <div className="bg-card border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Needs Attention</h2>
            <Link to="/needs-attention" className="text-xs text-primary hover:underline flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {pendingDocs.length === 0 ? (
            <div className="flex items-center gap-2 text-emerald-600 text-sm py-4">
              <CheckCircle2 className="h-4 w-4" />
              All documents are up to date
            </div>
          ) : (
            <div className="space-y-2">
              {pendingDocs.map(doc => (
                <div key={doc.id} className="flex items-center gap-1 group">
                  <Link to={`/crab-documents/${doc.id}`} className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/40 transition-colors">
                      <Clock className="h-4 w-4 text-amber-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{doc.title}</p>
                        <p className="text-xs text-muted-foreground capitalize">{doc.processing_status?.replace("_", " ")}</p>
                      </div>
                    </div>
                  </Link>
                  <button
                    onClick={(e) => handleDeleteDoc(doc, e)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive p-1.5 shrink-0"
                    title="Delete document"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}