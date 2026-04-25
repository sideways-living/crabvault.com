import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, MapPin } from "lucide-react";

function formatBSB(raw) {
  const digits = raw.replace(/\D/g, "").slice(0, 6);
  if (digits.length > 3) return digits.slice(0, 3) + "-" + digits.slice(3);
  return digits;
}

export default function RedBankAccountForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(
    initial || { bank: "Westpac", account_type: "", bsb: "", account_number: "" }
  );
  const [bsbInfo, setBsbInfo] = useState(
    initial?.bsb_institution_name
      ? { institution_name: initial.bsb_institution_name, branch_name: initial.bsb_branch_name, address: initial.bsb_address }
      : null
  );
  const [bsbLoading, setBsbLoading] = useState(false);
  const [bsbError, setBsbError] = useState("");
  const [saving, setSaving] = useState(false);

  const lookupBSB = async (bsb) => {
    const clean = bsb.replace(/\D/g, "");
    if (clean.length !== 6) { setBsbInfo(null); setBsbError(""); return; }
    setBsbLoading(true);
    setBsbError("");
    try {
      const res = await fetch(`https://bsbfinder.com/api/v1/bsb/${bsb}`);
      const json = await res.json();
      if (json.success) {
        setBsbInfo(json.data);
        setForm(f => ({ ...f, bank: json.data.institution_name, bsb_institution_name: json.data.institution_name, bsb_branch_name: json.data.branch_name, bsb_address: json.data.address + ", " + json.data.suburb + " " + json.data.state }));
      } else {
        setBsbInfo(null);
        setBsbError("BSB not found");
      }
    } catch {
      setBsbError("Lookup failed");
    }
    setBsbLoading(false);
  };

  const handleBSBChange = (e) => {
    const formatted = formatBSB(e.target.value);
    setForm(f => ({ ...f, bsb: formatted }));
    if (formatted.replace(/\D/g, "").length === 6) lookupBSB(formatted);
    else { setBsbInfo(null); setBsbError(""); }
  };

  const handleSave = async () => {
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return (
    <div className="space-y-3 p-4 bg-muted/30 rounded-xl border">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Bank</Label>
          <Input className="mt-1" value={form.bank} onChange={e => setForm(f => ({ ...f, bank: e.target.value }))} />
        </div>
        <div>
          <Label className="text-xs">Account Type</Label>
          <Input className="mt-1" placeholder="e.g. Savings, Cheque…" value={form.account_type} onChange={e => setForm(f => ({ ...f, account_type: e.target.value }))} />
        </div>
        <div>
          <Label className="text-xs">BSB</Label>
          <Input className="mt-1 font-mono" placeholder="XXX-XXX" value={form.bsb} onChange={handleBSBChange} maxLength={7} />
          {bsbLoading && <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Looking up…</p>}
          {bsbInfo && !bsbLoading && (
            <p className="text-xs text-emerald-700 mt-1 flex items-start gap-1">
              <MapPin className="h-3 w-3 shrink-0 mt-0.5" />
              {bsbInfo.institution_name} — {bsbInfo.branch_name}
              {bsbInfo.address ? `, ${bsbInfo.address}` : ""}
            </p>
          )}
          {bsbError && <p className="text-xs text-destructive mt-1">{bsbError}</p>}
        </div>
        <div>
          <Label className="text-xs">Account Number</Label>
          <Input className="mt-1 font-mono" value={form.account_number} onChange={e => setForm(f => ({ ...f, account_number: e.target.value }))} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1">
          {saving && <Loader2 className="h-3 w-3 animate-spin" />} Save
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}