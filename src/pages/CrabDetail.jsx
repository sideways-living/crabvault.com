import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, Save, Trash2, Plus, X, FileText,
  Phone, Mail, MapPin, User, AlertTriangle, Loader2, Pencil
} from "lucide-react";
import RedBankModule from "@/components/modules/RedBankModule";
import YellowBankModule from "@/components/modules/YellowBankModule";
import ModuleSelector from "@/components/modules/ModuleSelector";
import CollapsibleModuleCard from "@/components/modules/CollapsibleModuleCard";
import CrabAIExtractPanel from "@/components/CrabAIExtractPanel";
import { toast } from "sonner";

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
  const [enabledModules, setEnabledModules] = useState([]);
  const [loading, setLoading] = useState(!creating);
  const [saving, setSaving] = useState(false);
  const [aliasInput, setAliasInput] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [editing, setEditing] = useState(creating);

  useEffect(() => {
    if (creating) return;
    Promise.all([
      base44.entities.Crab.filter({ id }, "full_name", 1),
      base44.entities.CrabDocument.filter({ is_deleted: false }, "-created_date", 200),
      base44.entities.CrabModule.filter({ crab_id: id }),
    ]).then(([crabs, docs, mods]) => {
      if (crabs[0]) setCrab(crabs[0]);
      setDocuments(docs.filter(d => (d.crab_ids || []).includes(id)));
      setEnabledModules(mods.map(m => m.module_type));
      setLoading(false);
    });
  }, [id]);

  const toTitleCase = (str) => str.replace(/\b\w/g, c => c.toUpperCase());

  const set = (field) => (e) => setCrab(c => ({ ...c, [field]: e.target.value }));
  const setTitle = (field) => (e) => setCrab(c => ({ ...c, [field]: toTitleCase(e.target.value) }));
  const setUpper = (field) => (e) => setCrab(c => ({ ...c, [field]: e.target.value.toUpperCase() }));

  const formatPhone = (raw) => {
    // Strip everything except digits and leading +
    let digits = raw.replace(/[^\d]/g, '');
    if (!digits) return raw;
    // If starts with 0, replace with 61
    if (digits.startsWith('0')) digits = '61' + digits.slice(1);
    // If starts with 61, format as +61 XXX XXX XXX
    if (digits.startsWith('61') && digits.length >= 3) {
      const local = digits.slice(2); // e.g. "412345678"
      const p1 = local.slice(0, 3);
      const p2 = local.slice(3, 6);
      const p3 = local.slice(6, 9);
      return ('+61 ' + [p1, p2, p3].filter(Boolean).join(' ')).trim();
    }
    return '+' + digits;
  };

  const handlePhoneBlur = () => {
    if (crab.phone) setCrab(c => ({ ...c, phone: formatPhone(c.phone) }));
  };

  const computedFullName = [crab.first_name, crab.middle_name, crab.surname].filter(Boolean).join(" ");

  const computeAge = (dob) => {
    if (!dob) return null;
    const birth = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  };

  const computeStarSign = (dob) => {
    if (!dob) return null;
    const d = new Date(dob);
    const day = d.getDate();
    const month = d.getMonth() + 1;
    if ((month === 3 && day >= 21) || (month === 4 && day <= 19)) return "♈ Aries";
    if ((month === 4 && day >= 20) || (month === 5 && day <= 20)) return "♉ Taurus";
    if ((month === 5 && day >= 21) || (month === 6 && day <= 20)) return "♊ Gemini";
    if ((month === 6 && day >= 21) || (month === 7 && day <= 22)) return "♋ Cancer";
    if ((month === 7 && day >= 23) || (month === 8 && day <= 22)) return "♌ Leo";
    if ((month === 8 && day >= 23) || (month === 9 && day <= 22)) return "♍ Virgo";
    if ((month === 9 && day >= 23) || (month === 10 && day <= 22)) return "♎ Libra";
    if ((month === 10 && day >= 23) || (month === 11 && day <= 21)) return "♏ Scorpio";
    if ((month === 11 && day >= 22) || (month === 12 && day <= 21)) return "♐ Sagittarius";
    if ((month === 12 && day >= 22) || (month === 1 && day <= 19)) return "♑ Capricorn";
    if ((month === 1 && day >= 20) || (month === 2 && day <= 18)) return "♒ Aquarius";
    return "♓ Pisces";
  };

  const age = computeAge(crab.date_of_birth);
  const starSign = computeStarSign(crab.date_of_birth);

  const STATUS_COLORS = {
    active: "text-emerald-700 bg-emerald-50 border-emerald-200",
    inactive: "text-gray-600 bg-gray-50 border-gray-200",
    banned: "text-red-700 bg-red-50 border-red-200",
    watch: "text-amber-700 bg-amber-50 border-amber-200",
  };

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
        setEditing(false);
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

  const handleModuleToggle = async (moduleType, currentlyEnabled) => {
    if (currentlyEnabled) {
      // Disable: delete the module record
      const mods = await base44.entities.CrabModule.filter({ crab_id: id, module_type: moduleType });
      if (mods[0]) await base44.entities.CrabModule.delete(mods[0].id);
      setEnabledModules(em => em.filter(m => m !== moduleType));
    } else {
      // Enable: create the module record
      await base44.entities.CrabModule.create({ crab_id: id, module_type: moduleType });
      setEnabledModules(em => [...em, moduleType]);
    }
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
          {!editing && (
            <Button variant="outline" onClick={() => setEditing(true)} className="gap-2">
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          )}
          {editing && (
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Saving…" : "Save"}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left col — core profile */}
        <div className="lg:col-span-2 space-y-5">

          {/* Basic info */}
          <div className="bg-card border rounded-xl p-5 space-y-4">
            {editing ? (
              <>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label className="text-xs">First Name</Label>
                    <Input className="mt-1" value={crab.first_name || ""} onChange={setTitle("first_name")} />
                  </div>
                  <div>
                    <Label className="text-xs">Middle Name</Label>
                    <Input className="mt-1" value={crab.middle_name || ""} onChange={setTitle("middle_name")} />
                  </div>
                  <div>
                    <Label className="text-xs">Surname *</Label>
                    <Input className="mt-1" value={crab.surname || ""} onChange={setUpper("surname")} />
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
                    <Input className="mt-1" value={crab.phone || ""} onChange={set("phone")} onBlur={handlePhoneBlur} placeholder="+61 XXX XXX XXX" />
                  </div>
                  <div>
                    <Label className="text-xs">Email</Label>
                    <Input className="mt-1" value={crab.email || ""} onChange={set("email")} />
                  </div>
                  <div>
                    <Label className="text-xs">Photo URL</Label>
                    <Input className="mt-1" value={crab.photo_url || ""} onChange={set("photo_url")} />
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-1.5">
                {/* Row 1: Name + badges right */}
                <div className="flex items-center justify-between gap-4">
                  <p className="text-lg font-semibold">{computedFullName || <span className="text-muted-foreground italic">No name</span>}</p>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border capitalize ${STATUS_COLORS[crab.status] || STATUS_COLORS.active}`}>
                      {crab.status || "active"}
                    </span>
                    {enabledModules.includes("redbank") && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">RedBank</span>
                    )}
                    {enabledModules.includes("yellowbank") && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 border border-yellow-200">YellowBank</span>
                    )}
                  </div>
                </div>
                {/* Row 2: DOB left, Phone right */}
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{crab.date_of_birth ? new Date(crab.date_of_birth).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }) : <span className="italic">No date of birth</span>}</span>
                  {crab.phone && <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 shrink-0" />{crab.phone}</span>}
                </div>
                {/* Row 3: Age + star sign left, Email right */}
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{age !== null ? `${age} yrs${starSign ? `  ·  ${starSign}` : ""}` : ""}</span>
                  {crab.email && <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 shrink-0" />{crab.email}</span>}
                </div>
              </div>
            )}
          </div>

          {/* Addresses */}
          <div className="bg-card border rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Address</h2>
              {!editing && <button onClick={() => setEditing(true)} className="text-muted-foreground hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>}
            </div>

            {/* Residential */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Residential</p>
              {editing ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <Label className="text-xs">Address Line 1</Label>
                    <Input className="mt-1" value={crab.address1 || ""} onChange={setTitle("address1")} placeholder="Street number and name" />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Address Line 2</Label>
                    <Input className="mt-1" value={crab.address2 || ""} onChange={setTitle("address2")} placeholder="Unit, apartment, floor…" />
                  </div>
                  <div>
                    <Label className="text-xs">Suburb</Label>
                    <Input className="mt-1" value={crab.suburb || ""} onChange={e => setCrab(c => ({ ...c, suburb: e.target.value.toUpperCase() }))} />
                  </div>
                  <div>
                    <Label className="text-xs">State</Label>
                    <Input className="mt-1" value={crab.state || ""} onChange={setTitle("state")} />
                  </div>
                  <div>
                    <Label className="text-xs">Postcode</Label>
                    <Input className="mt-1" value={crab.postcode || ""} onChange={set("postcode")} />
                  </div>
                  <div>
                    <Label className="text-xs">Country</Label>
                    <Input className="mt-1" value={crab.country || "Australia"} onChange={setTitle("country")} />
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground space-y-0.5">
                  {crab.address1 && <p>{crab.address1}</p>}
                  {crab.address2 && <p>{crab.address2}</p>}
                  {(crab.suburb || crab.state || crab.postcode) && (
                    <p>{[crab.suburb, crab.state, crab.postcode].filter(Boolean).join("  ")}</p>
                  )}
                  {crab.country && crab.country !== "Australia" && <p>{crab.country}</p>}
                  {!crab.address1 && !crab.suburb && <p className="italic">No address recorded</p>}
                </div>
              )}
            </div>

            {/* Mailing */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground">Mailing</p>
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
              {(crab.mailing_same_as_residential ?? true) ? (
                <p className="text-xs text-muted-foreground italic">Using residential address for mail</p>
              ) : editing ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <Label className="text-xs">Address Line 1</Label>
                    <Input className="mt-1" value={crab.mailing_address1 || ""} onChange={setTitle("mailing_address1")} placeholder="Street number and name" />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Address Line 2</Label>
                    <Input className="mt-1" value={crab.mailing_address2 || ""} onChange={setTitle("mailing_address2")} placeholder="Unit, PO Box, locked bag…" />
                  </div>
                  <div>
                    <Label className="text-xs">Suburb</Label>
                    <Input className="mt-1" value={crab.mailing_suburb || ""} onChange={e => setCrab(c => ({ ...c, mailing_suburb: e.target.value.toUpperCase() }))} />
                  </div>
                  <div>
                    <Label className="text-xs">State</Label>
                    <Input className="mt-1" value={crab.mailing_state || ""} onChange={setTitle("mailing_state")} />
                  </div>
                  <div>
                    <Label className="text-xs">Postcode</Label>
                    <Input className="mt-1" value={crab.mailing_postcode || ""} onChange={set("mailing_postcode")} />
                  </div>
                  <div>
                    <Label className="text-xs">Country</Label>
                    <Input className="mt-1" value={crab.mailing_country || "Australia"} onChange={setTitle("mailing_country")} />
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground space-y-0.5">
                  {crab.mailing_address1 && <p>{crab.mailing_address1}</p>}
                  {crab.mailing_address2 && <p>{crab.mailing_address2}</p>}
                  {(crab.mailing_suburb || crab.mailing_state || crab.mailing_postcode) && (
                    <p>{[crab.mailing_suburb, crab.mailing_state, crab.mailing_postcode].filter(Boolean).join("  ")}</p>
                  )}
                  {crab.mailing_country && crab.mailing_country !== "Australia" && <p>{crab.mailing_country}</p>}
                </div>
              )}
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

          {/* AI Extraction */}
          {!creating && (
            <CrabAIExtractPanel
              crabId={id}
              currentCrab={crab}
              onApply={(updates) => setCrab(c => ({ ...c, ...updates }))}
            />
          )}

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

          {/* Active Module Cards — drop into main stack */}
          {!creating && enabledModules.includes("redbank") && (
            <CollapsibleModuleCard
              label="RedBank"
              badgeClass="bg-red-100 text-red-700 border-red-200"
            >
              <RedBankModule crabId={id} />
            </CollapsibleModuleCard>
          )}
          {!creating && enabledModules.includes("yellowbank") && (
            <CollapsibleModuleCard
              label="YellowBank"
              badgeClass="bg-yellow-100 text-yellow-700 border-yellow-200"
            >
              <YellowBankModule crabId={id} />
            </CollapsibleModuleCard>
          )}
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

          {/* Module Selector */}
          {!creating && (
            <ModuleSelector enabledModules={enabledModules} onToggle={handleModuleToggle} />
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
                <div className="space-y-1.5 max-h-96 overflow-y-auto">
                  {documents.map(d => (
                    <Link key={d.id} to={`/crab-documents/${d.id}`}>
                      <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-xs truncate">{d.title}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}