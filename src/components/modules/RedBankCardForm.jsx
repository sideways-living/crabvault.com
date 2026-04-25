import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

function formatCardNumber(raw) {
  const digits = raw.replace(/\D/g, "").slice(0, 16);
  return digits.replace(/(.{4})/g, "$1 ").trim();
}

function formatExpiry(raw) {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  if (digits.length > 2) return digits.slice(0, 2) + "/" + digits.slice(2);
  return digits;
}

export default function RedBankCardForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(
    initial || { card_number: "", expiry: "", ccv: "" }
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return (
    <div className="space-y-3 p-4 bg-muted/30 rounded-xl border">
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-3">
          <Label className="text-xs">Card Number</Label>
          <Input
            className="mt-1 font-mono tracking-widest"
            placeholder="XXXX XXXX XXXX XXXX"
            value={form.card_number}
            onChange={e => setForm(f => ({ ...f, card_number: formatCardNumber(e.target.value) }))}
            maxLength={19}
          />
        </div>
        <div>
          <Label className="text-xs">Expiry</Label>
          <Input
            className="mt-1 font-mono"
            placeholder="MM/YY"
            value={form.expiry}
            onChange={e => setForm(f => ({ ...f, expiry: formatExpiry(e.target.value) }))}
            maxLength={5}
          />
        </div>
        <div>
          <Label className="text-xs">CCV</Label>
          <Input
            className="mt-1 font-mono"
            placeholder="3-4 digits"
            value={form.ccv}
            onChange={e => setForm(f => ({ ...f, ccv: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
            maxLength={4}
          />
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