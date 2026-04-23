import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, Save, Trash2, Plus, X, FileText,
  Phone, Mail, MapPin, User, AlertTriangle, Loader2, Star
} from "lucide-react";
import { toast } from "sonner";

const STATUS_COLORS = {
  active: "bg-emerald-100 text-emerald-700",
  inactive: "bg-gray-100 text-gray-600",
  banned: "bg-red-100 text-red-700",
  watch: "bg-amber-100 text-amber-700",
};

const isNew = (id) => id === "new";

export default function CrabDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const creating = isNew(id);

  const [crab, setCrab] = useState({
    full_name: "", aliases: [], date_of_birth: "", photo_url: "",
    phone: "", email: "", address: "", id_numbers: [],
    emergency_summary: "", notes: "", status: "active", tags: [],
  });
  const [documents, setDocuments] = useState([]);
  const [markets, setMarkets] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(!creating);
  const [saving, setSaving] = useState(false);
  const [aliasInput, setAliasInput] = useState("");
  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    if (creating) return;
    Promise.all([
      base44.entities.Crab.filter({ id }, "full_name", 1),
      base44.entities.CrabDocument.filter({ is_deleted: false }, "-created_date", 200),
      base44.entities.TargetMarket.list("name", 200),
      base44.entities.CrabMarketActivity.filter({ crab_id: id }, "-created_date", 100),
    ]).then(([crabs, docs, mkts, acts]) => {
      if (crabs[0]) setCrab(crabs[0]);
      setDocuments(docs.filter(d => (d.crab_ids || []).includes(id)));
      setMarkets(mkts);
      setActivities(acts);
      setLoading(false);
    });
  }, [id]);

  const handleSave = async () => {
    if (!crab.full_name.trim()) { toast.error("Full name is required"); return; }
    setSaving(true);
    try {
      if (creating) {
        const created = await base44.entities.Crab.create(crab);
        toast.success("Crab profile created");
        navigate(`/crabs/${created.id}`);
      } else {
        await base44.entities.Crab.update(id, crab);
        toast.success("Profile saved");
      }
    } catch (e) {
      toast.error(e.message);
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirm(`Delete profile for ${crab.full_name}? This cannot be undone.`)) return;
    await base44.entities.Crab.update(id, { is_deleted: true });
    toast.success("Profile deleted");
    navigate("/crabs");
  };

  const addAlias = () => {
    if (!aliasInput.trim()) return;
    setCrab(c => ({ ...c, aliases: [...(c.aliases || []), aliasInput.trim()] }));
    setAliasInput("");
  };

  const addTag = () => {
    if (!tagInput.trim()) return;
    setCrab(c => ({ ...c, tags: [...(c.tags || []), tagInput.trim()] }));
    setTagInput("");
  };

  const addIdNumber = () => setCrab(c => ({ ...c, id_numbers: [...(c.id_numbers || []), { label: "", value: "" }] }));
  const updateIdNumber = (i, field, val) =>
    setCrab(c => ({ ...c, id_numbers: c.id_numbers.map((n, idx) => idx === i ? { ...n, [field]: val } : n) }));
  const removeIdNumber = (i) =>
    setCrab(c => ({ ...c, id_numbers: c.id_numbers.filter((_, idx) => idx !== i) }));

  if (loading) return (
    <div className="flex justify-center py-16">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/crabs"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">{creating ? "New Crab Profile" : crab.full_name}</h1>
          {!creating && <p className="text-xs text-muted-foreground">ID: {id}</p>}
        </div>
        <div className="flex gap-2">
          {!creating && (
            <Button variant="ghost" size="icon" onClick={handleDelete} className="text-destructive hover:bg-destructive/10">
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left col — core profile */}
        <div className="lg:col-span-2 space-y-5">

          {/* Basic info */}
          <div className="bg-card border rounded-xl p-5 space-y-4">
            <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Profile</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label className="text-xs">Full Name *</Label>
                <Input className="mt-1" value={crab.full_name} onChange={e => setCrab(c => ({ ...c, full_name: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Date of Birth</Label>
                <Input type="date" className="mt-1" value={crab.date_of_birth || ""} onChange={e => setCrab(c => ({ ...c, date_of_birth: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Status</Label>
                <Select value={crab.status} onValueChange={v => setCrab(c => ({ ...c, status: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="banned">Banned</SelectItem>
                    <SelectItem value="watch">Watch</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Phone</Label>
                <Input className="mt-1" value={crab.phone || ""} onChange={e => setCrab(c => ({ ...c, phone: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Email</Label>
                <Input className="mt-1" value={crab.email || ""} onChange={e => setCrab(c => ({ ...c, email: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Address</Label>
                <Input className="mt-1" value={crab.address || ""} onChange={e => setCrab(c => ({ ...c, address: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Photo URL</Label>
                <Input className="mt-1" value={crab.photo_url || ""} onChange={e => setCrab(c => ({ ...c, photo_url: e.target.value }))} />
              </div>
            </div>
          </div>

          {/* Aliases */}
          <div className="bg-card border rounded-xl p-5 space-y-3">
            <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Known Aliases</h2>
            <div className="flex gap-2">
              <Input value={aliasInput} onChange={e => setAliasInput(e.target.value)} placeholder="Add alias…" onKeyDown={e => e.key === "Enter" && addAlias()} className="flex-1" />
              <Button variant="outline" onClick={addAlias} size="sm">Add</Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {(crab.aliases || []).map((a, i) => (
                <span key={i} className="flex items-center gap-1 bg-secondary text-sm px-2.5 py-1 rounded-full">
                  {a}
                  <button onClick={() => setCrab(c => ({ ...c, aliases: c.aliases.filter((_, idx) => idx !== i) }))}><X className="h-3 w-3" /></button>
                </span>
              ))}
            </div>
          </div>

          {/* ID Numbers */}
          <div className="bg-card border rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">ID Numbers / References</h2>
              <Button variant="outline" size="sm" onClick={addIdNumber} className="gap-1"><Plus className="h-3 w-3" /> Add</Button>
            </div>
            {(crab.id_numbers || []).map((n, i) => (
              <div key={i} className="flex gap-2 items-center">
                <Input placeholder="Label (e.g. Passport)" className="w-40" value={n.label} onChange={e => updateIdNumber(i, "label", e.target.value)} />
                <Input placeholder="Value" className="flex-1" value={n.value} onChange={e => updateIdNumber(i, "value", e.target.value)} />
                <button onClick={() => removeIdNumber(i)} className="text-muted-foreground hover:text-destructive"><X className="h-4 w-4" /></button>
              </div>
            ))}
          </div>

          {/* Emergency Summary */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <h2 className="font-semibold text-sm text-amber-800">Emergency Summary</h2>
            </div>
            <p className="text-xs text-amber-700">Quick facts to answer questions on the spot</p>
            <textarea
              className="w-full mt-1 text-sm border border-amber-200 rounded-lg px-3 py-2 bg-white resize-none focus-visible:ring-1 focus-visible:ring-amber-400 outline-none"
              rows={4}
              value={crab.emergency_summary || ""}
              onChange={e => setCrab(c => ({ ...c, emergency_summary: e.target.value }))}
              placeholder="Key facts, red flags, known methods…"
            />
          </div>

          {/* Notes */}
          <div className="bg-card border rounded-xl p-5 space-y-2">
            <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Notes</h2>
            <textarea
              className="w-full mt-1 text-sm border rounded-lg px-3 py-2 bg-background resize-none focus-visible:ring-1 focus-visible:ring-ring outline-none"
              rows={4}
              value={crab.notes || ""}
              onChange={e => setCrab(c => ({ ...c, notes: e.target.value }))}
              placeholder="Additional notes…"
            />
          </div>
        </div>

        {/* Right col — tags, docs, markets */}
        <div className="space-y-5">

          {/* Tags */}
          <div className="bg-card border rounded-xl p-5 space-y-3">
            <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Tags</h2>
            <div className="flex gap-2">
              <Input value={tagInput} onChange={e => setTagInput(e.target.value)} placeholder="Add tag…" onKeyDown={e => e.key === "Enter" && addTag()} className="flex-1 text-sm" />
              <Button variant="outline" size="sm" onClick={addTag}>Add</Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(crab.tags || []).map((t, i) => (
                <span key={i} className="flex items-center gap-1 bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-full">
                  {t}
                  <button onClick={() => setCrab(c => ({ ...c, tags: c.tags.filter((_, idx) => idx !== i) }))}><X className="h-2.5 w-2.5" /></button>
                </span>
              ))}
            </div>
          </div>

          {/* Market Activity */}
          {!creating && (
            <div className="bg-card border rounded-xl p-5 space-y-3">
              <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Market Activity</h2>
              {activities.length === 0 ? (
                <p className="text-xs text-muted-foreground">No market activity recorded</p>
              ) : (
                <div className="space-y-2">
                  {activities.map(a => {
                    const market = markets.find(m => m.id === a.market_id);
                    return (
                      <div key={a.id} className="flex items-center justify-between text-sm">
                        <span className="text-sm truncate">{market?.name || "Unknown"}</span>
                        <div className="flex items-center gap-1">
                          {[1,2,3,4,5].map(s => (
                            <Star key={s} className={`h-3 w-3 ${s <= (a.rating || 0) ? "text-amber-400 fill-amber-400" : "text-muted-foreground"}`} />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <Link to={`/markets`}>
                <Button variant="outline" size="sm" className="w-full text-xs mt-1">Manage Markets</Button>
              </Link>
            </div>
          )}

          {/* Linked Documents */}
          {!creating && (
            <div className="bg-card border rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Documents</h2>
                <span className="text-xs text-muted-foreground">{documents.length}</span>
              </div>
              {documents.length === 0 ? (
                <p className="text-xs text-muted-foreground">No documents linked yet</p>
              ) : (
                <div className="space-y-1.5">
                  {documents.slice(0, 8).map(d => (
                    <Link key={d.id} to={`/crab-documents/${d.id}`}>
                      <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-xs truncate">{d.title}</span>
                      </div>
                    </Link>
                  ))}
                  {documents.length > 8 && (
                    <p className="text-xs text-muted-foreground text-center pt-1">+{documents.length - 8} more</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}