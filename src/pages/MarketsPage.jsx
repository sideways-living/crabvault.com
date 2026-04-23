import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Building2, X, Save, Loader2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function MarketsPage() {
  const [markets, setMarkets] = useState([]);
  const [activities, setActivities] = useState([]);
  const [crabs, setCrabs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newMarket, setNewMarket] = useState({ name: "", industry: "", description: "" });
  const [saving, setSaving] = useState(false);

  const load = () => {
    Promise.all([
      base44.entities.TargetMarket.list("name", 200),
      base44.entities.CrabMarketActivity.list("-created_date", 500),
      base44.entities.Crab.filter({ is_deleted: false }, "full_name", 500),
    ]).then(([mkts, acts, crbs]) => {
      setMarkets(mkts);
      setActivities(acts);
      setCrabs(crbs);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!newMarket.name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    await base44.entities.TargetMarket.create(newMarket);
    toast.success("Market added");
    setNewMarket({ name: "", industry: "", description: "" });
    setAdding(false);
    setSaving(false);
    load();
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this market?")) return;
    await base44.entities.TargetMarket.delete(id);
    toast.success("Market deleted");
    load();
  };

  const getMarketCrabs = (marketId) => {
    const crabIds = activities.filter(a => a.market_id === marketId).map(a => a.crab_id);
    return crabs.filter(c => crabIds.includes(c.id));
  };

  const getAvgRating = (marketId) => {
    const acts = activities.filter(a => a.market_id === marketId && a.rating);
    if (!acts.length) return null;
    return (acts.reduce((s, a) => s + a.rating, 0) / acts.length).toFixed(1);
  };

  if (loading) return (
    <div className="flex justify-center py-16">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Target Markets</h1>
          <p className="text-sm text-muted-foreground mt-1">{markets.length} market{markets.length !== 1 ? "s" : ""}</p>
        </div>
        <Button onClick={() => setAdding(true)} className="gap-2"><Plus className="h-4 w-4" /> Add Market</Button>
      </div>

      {adding && (
        <div className="bg-card border rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-sm">New Target Market</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label className="text-xs">Market Name *</Label>
              <Input className="mt-1" value={newMarket.name} onChange={e => setNewMarket(m => ({ ...m, name: e.target.value }))} placeholder="e.g. Retail Returns" />
            </div>
            <div>
              <Label className="text-xs">Industry / Sector</Label>
              <Input className="mt-1" value={newMarket.industry} onChange={e => setNewMarket(m => ({ ...m, industry: e.target.value }))} placeholder="e.g. Retail" />
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Input className="mt-1" value={newMarket.description} onChange={e => setNewMarket(m => ({ ...m, description: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleAdd} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </Button>
            <Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {markets.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Building2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No target markets yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {markets.map(market => {
            const linked = getMarketCrabs(market.id);
            const avg = getAvgRating(market.id);
            return (
              <div key={market.id} className="bg-card border rounded-xl p-5 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold">{market.name}</h3>
                    {market.industry && <p className="text-xs text-muted-foreground">{market.industry}</p>}
                  </div>
                  <button onClick={() => handleDelete(market.id)} className="text-muted-foreground hover:text-destructive">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {market.description && <p className="text-xs text-muted-foreground">{market.description}</p>}
                <div className="flex items-center justify-between text-xs pt-1 border-t">
                  <span className="text-muted-foreground">{linked.length} crab{linked.length !== 1 ? "s" : ""}</span>
                  {avg && (
                    <span className="flex items-center gap-1 text-amber-600 font-medium">
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" /> {avg} avg
                    </span>
                  )}
                </div>
                {linked.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {linked.slice(0, 4).map(c => (
                      <span key={c.id} className="text-[10px] bg-secondary px-1.5 py-0.5 rounded-full">{c.full_name}</span>
                    ))}
                    {linked.length > 4 && <span className="text-[10px] text-muted-foreground">+{linked.length - 4}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}