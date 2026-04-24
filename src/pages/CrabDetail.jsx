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
    first_name: "", middle_name: "", surname: "", full_name: "",
    aliases: [], date_of_birth: "", photo_url: "",
    phone: "", email: "",
    address1: "", address2: "", suburb: "", state: "", postcode: "", country: "Australia",
    mailing_same_as_residential: true,
    mailing_address1: "", mailing_address2: "", mailing_suburb: "", mailing_state: "", mailing_postcode: "", mailing_country: "Australia",
    id_numbers: [], emergency_summary: "", notes: "", status: "active", tags: [],
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

  const set = (field) => (e) => setCrab(c => ({ ...c, [field]: e.target.value }));

  const computedFullName = [crab.first_name, crab.middle_name, crab.surname].filter(Boolean).join(" ");

  const handleSave = async () => {
    if (!crab.surname?.trim()) { toast.error("Surname is required"); return; }
    setSaving(true);
    // auto-compute full_name before saving
    const saveData = { ...crab, full_name: computedFullName };
    try {
      if (creating) {
        const created = await base44.entities.Crab.create(saveData);
        toast.success("Crab profile created");
        navigate(`/crabs/${created.id}`);
      } else {
        await base44.entities.Crab.update(id, saveData);
        toast.success("Profile saved");
      }
    } catch (e) {
      toast.error(e.message);
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirm(`Delete profile for ${computedFullName || crab.full_name}? This cannot be undone.`)) return;
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
          <h1 className="text-xl font-semibold">{creating ? "New Crab Profile" : (computedFullName || crab.full_name)}</h1>
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
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-xs">First Name</Label>
                <Input className="mt-1" value={crab.first_name || ""} onChange={set("first_name")} />
              </div>
              <div>
                <Label className="text-xs">Middle Name</Label>
                <Input className="mt-1" value={crab.middle_name || ""} onChange={set("middle_name")} />
              </div>
              <div>
                <Label className="text-xs">Surname *</Label>
                <Input className="mt-1" value={crab.surname || ""} onChange={set("surname")} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Date of Birth</Label>
                <Input type="date" className="mt-1" value={crab.date_of_birth || ""} onChange={set("date_of_birth")} />
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
                <Input className="mt-1" value={crab.phone || ""} onChange={set("phone")} />
              </div>
              <div>
                <Label className="text-xs">Email</Label>
                <Input className="mt-1" value={crab.email || ""} onChange={set("email")} />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Photo URL</Label>
                <Input className="mt-1" value={crab.photo_url || ""} onChange={set("photo_url")} />
              </div>
            </div>
          </div>

          {/* Residential Address */}
          <div className="bg-card border rounded-xl p-5 space-y-4">
            <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Residential Address</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label className="text-xs">Address Line 1</Label>
                <Input className="mt-1" value={crab.address1 || ""} onChange={set("address1")} placeholder="Street number and name" />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Address Line 2</Label>
                <Input className="mt-1" value={crab.address2 || ""} onChange={set("address2")} placeholder="Unit, apartment, floor…" />
              </div>
              <div>
                <Label className="text-xs">Suburb</Label>
                <Input className="mt-1" value={crab.suburb || ""} onChange={set("suburb")} />
              </div>
              <div>
                <Label className="text-xs">State</Label>
                <Input className="mt-1" value={crab.state || ""} onChange={set("state")} />
              </div>
              <div>
                <Label className="text-xs">Postcode</Label>
                <Input className="mt-1" value={crab.postcode || ""} onChange={set("postcode")} />
              </div>
              <div>
                <Label className="text-xs">Country</Label>
                <Input className="mt-1" value={crab.country || "Australia"} onChange={set("country")} />
              </div>
            </div>
          </div>

          {/* Mailing Address */}
          <div className="bg-card border rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Mailing Address</h2>
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={crab.mailing_same_as_residential ?? true}
                  onChange={e => setCrab(c => ({ ...c, mailing_same_as_residential: e.target.checked }))}
                  className="rounded"
                />
                Same as residential
              </label>
            </div>
            {!(crab.mailing_same_as_residential ?? true) && (
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label className="text-xs">Address Line 1</Label>
                  <Input className="mt-1" value={crab.mailing_address1 || ""} onChange={set("mailing_address1")} placeholder="Street number and name" />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Address Line 2</Label>
                  <Input className="mt-1" value={crab.mailing_address2 || ""} onChange={set("mailing_address2")} placeholder="Unit, PO Box, locked bag…" />
                </div>
                <div>
                  <Label className="text-xs">Suburb</Label>
                  <Input className="mt-1" value={crab.mailing_suburb || ""} onChange={set("mailing_suburb")} />
                </div>
                <div>
                  <Label className="text-xs">State</Label>
                  <Input className="mt-1" value={crab.mailing_state || ""} onChange={set("mailing_state")} />
                </div>
                <div>
                  <Label className="text-xs">Postcode</Label>
                  <Input className="mt-1" value={crab.mailing_postcode || ""} onChange={set("mailing_postcode")} />
                </div>
                <div>
                  <Label className="text-xs">Country</Label>
                  <Input className="mt-1" value={crab.mailing_country || "Australia"} onChange={set("mailing_country")} />
                </div>
              </div>
            )}
            {(crab.mailing_same_as_residential ?? true) && (
              <p className="text-xs text-muted-foreground italic">Using residential address for mail</p>
            )}
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