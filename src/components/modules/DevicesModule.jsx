import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Pencil, Trash2, Smartphone, Check, X, Upload } from "lucide-react";
import { toast } from "sonner";

const MODULES = [
  { key: "redbank", label: "RedBank", color: "bg-red-100 text-red-700 border-red-200" },
  { key: "yellowbank", label: "YellowBank", color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
];

const EMPTY_FORM = { brand: "", model: "", imei: "", colour: "", image_url: "", used_for: [], notes: "" };

function DeviceForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setForm(f => ({ ...f, image_url: file_url }));
    setUploading(false);
  };

  const toggleModule = (key) => {
    setForm(f => ({
      ...f,
      used_for: f.used_for.includes(key)
        ? f.used_for.filter(k => k !== key)
        : [...f.used_for, key],
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return (
    <div className="p-4 bg-muted/30 rounded-lg border space-y-3">
      {/* Image upload */}
      <div>
        <Label className="text-xs">Device Image</Label>
        <div className="flex items-center gap-3 mt-1.5">
          {form.image_url ? (
            <div className="relative shrink-0">
              <img src={form.image_url} alt="Device" className="w-16 h-16 object-cover rounded-lg border" />
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, image_url: "" }))}
                className="absolute -top-1.5 -right-1.5 bg-destructive text-white rounded-full h-4 w-4 flex items-center justify-center"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          ) : (
            <div className="w-16 h-16 rounded-lg border-2 border-dashed border-border flex items-center justify-center bg-muted/30 shrink-0">
              <Smartphone className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
          <label className="cursor-pointer">
            <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploading} />
            <div className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border transition-colors ${uploading ? "opacity-50" : "hover:bg-accent cursor-pointer"} border-input bg-background`}>
              <Upload className="h-3 w-3" />
              {uploading ? "Uploading…" : form.image_url ? "Replace Image" : "Upload Image"}
            </div>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Brand</Label>
          <Input className="mt-1" placeholder="e.g. Apple" value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))} />
        </div>
        <div>
          <Label className="text-xs">Model</Label>
          <Input className="mt-1" placeholder="e.g. iPhone 15 Pro" value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} />
        </div>
        <div>
          <Label className="text-xs">IMEI</Label>
          <Input className="mt-1 font-mono" placeholder="15-digit IMEI" value={form.imei} onChange={e => setForm(f => ({ ...f, imei: e.target.value.replace(/\D/g, "").slice(0, 15) }))} />
        </div>
        <div>
          <Label className="text-xs">Colour</Label>
          <Input className="mt-1" placeholder="e.g. Midnight Black" value={form.colour} onChange={e => setForm(f => ({ ...f, colour: e.target.value }))} />
        </div>
      </div>

      <div>
        <Label className="text-xs">Used For</Label>
        <div className="flex flex-wrap gap-2 mt-1.5">
          {MODULES.map(mod => {
            const active = form.used_for.includes(mod.key);
            return (
              <button
                key={mod.key}
                type="button"
                onClick={() => toggleModule(mod.key)}
                className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded border transition-colors ${
                  active ? mod.color : "bg-muted text-muted-foreground border-border hover:border-primary"
                }`}
              >
                {active && <Check className="h-3 w-3" />}
                {mod.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <Label className="text-xs">Notes</Label>
        <Input className="mt-1" placeholder="Optional notes…" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
      </div>

      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1">
          <Check className="h-3 w-3" /> {saving ? "Saving…" : "Save"}
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel} className="gap-1">
          <X className="h-3 w-3" /> Cancel
        </Button>
      </div>
    </div>
  );
}

function DeviceRow({ device, onEdit, onDelete }) {
  const usedForModules = MODULES.filter(m => (device.used_for || []).includes(m.key));

  return (
    <div className="p-3 bg-muted/40 rounded-lg">
      <div className="flex items-start gap-3">
        {/* Image */}
        {device.image_url ? (
          <img src={device.image_url} alt="Device" className="w-14 h-14 object-contain rounded-lg border shrink-0 bg-white" />
        ) : (
          <div className="w-14 h-14 rounded-lg border bg-muted/60 flex items-center justify-center shrink-0">
            <Smartphone className="h-5 w-5 text-muted-foreground" />
          </div>
        )}

        {/* Details */}
        <div className="space-y-1 flex-1 min-w-0">
          <div className="flex items-start justify-between">
            <div>
              <span className="font-medium text-sm">{[device.brand, device.model].filter(Boolean).join(" ") || "Unknown Device"}</span>
              {device.colour && <span className="text-xs text-muted-foreground ml-1.5">· {device.colour}</span>}
            </div>
            <div className="flex gap-1 shrink-0 ml-2">
              <button onClick={onEdit} className="text-muted-foreground hover:text-foreground p-1"><Pencil className="h-3.5 w-3.5" /></button>
              <button onClick={onDelete} className="text-muted-foreground hover:text-destructive p-1"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          </div>
          {device.imei && (
            <p className="text-xs font-mono text-muted-foreground">IMEI: {device.imei}</p>
          )}
          {usedForModules.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {usedForModules.map(mod => (
                <span key={mod.key} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${mod.color}`}>
                  {mod.label}
                </span>
              ))}
            </div>
          )}
          {device.notes && (
            <p className="text-xs text-muted-foreground italic">{device.notes}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DevicesModule({ crabId }) {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    const devs = await base44.entities.CrabDevice.filter({ crab_id: crabId }, "created_date");
    setDevices(devs);
    setLoading(false);
  };

  useEffect(() => { load(); }, [crabId]);

  const handleSave = async (form) => {
    if (editing) {
      await base44.entities.CrabDevice.update(editing.id, form);
      toast.success("Device updated");
      setEditing(null);
    } else {
      await base44.entities.CrabDevice.create({ ...form, crab_id: crabId });
      toast.success("Device added");
      setAdding(false);
    }
    load();
  };

  const handleDelete = async (device) => {
    const label = [device.brand, device.model].filter(Boolean).join(" ") || "this device";
    if (!confirm(`Delete ${label}?`)) return;
    await base44.entities.CrabDevice.delete(device.id);
    toast.success("Device deleted");
    load();
  };

  if (loading) return (
    <div className="flex justify-center py-6">
      <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="bg-card border rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold text-sm">Devices</h3>
        </div>
        <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => { setAdding(true); setEditing(null); }}>
          <Plus className="h-3 w-3" /> Add Device
        </Button>
      </div>

      {adding && (
        <DeviceForm onSave={handleSave} onCancel={() => setAdding(false)} />
      )}

      {devices.length === 0 && !adding && (
        <p className="text-xs text-muted-foreground italic">No devices added yet</p>
      )}

      {devices.map(device => (
        <div key={device.id}>
          {editing?.id === device.id ? (
            <DeviceForm initial={device} onSave={handleSave} onCancel={() => setEditing(null)} />
          ) : (
            <DeviceRow
              device={device}
              onEdit={() => { setEditing(device); setAdding(false); }}
              onDelete={() => handleDelete(device)}
            />
          )}
        </div>
      ))}
    </div>
  );
}