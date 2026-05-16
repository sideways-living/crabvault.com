import React, { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function PhoneSelector({ crab, selectedType, selectedIndex, onChange }) {
  const options = [];
  if (crab.phone) options.push({ id: "main", label: `Main: ${crab.phone}` });
  (crab.additional_phones || []).forEach((p, i) => {
    options.push({ id: `additional-${i}`, label: `${p.label}: ${p.number}` });
  });

  if (options.length === 0) {
    return <p className="text-xs text-muted-foreground">No phone numbers available</p>;
  }

  const currentValue = selectedType === "main" ? "main" : `additional-${selectedIndex}`;

  return (
    <Select value={currentValue} onValueChange={(v) => {
      if (v === "main") onChange("main", undefined);
      else {
        const idx = parseInt(v.split("-")[1]);
        onChange("additional", idx);
      }
    }}>
      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
      <SelectContent>
        {options.map(opt => (
          <SelectItem key={opt.id} value={opt.id}>{opt.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function EmailSelector({ crab, selectedType, selectedIndex, onChange }) {
  const options = [];
  if (crab.email) options.push({ id: "main", label: `Main: ${crab.email}` });
  (crab.additional_emails || []).forEach((e, i) => {
    options.push({ id: `additional-${i}`, label: `${e.label}: ${e.email}` });
  });

  if (options.length === 0) {
    return <p className="text-xs text-muted-foreground">No emails available</p>;
  }

  const currentValue = selectedType === "main" ? "main" : `additional-${selectedIndex}`;

  return (
    <Select value={currentValue} onValueChange={(v) => {
      if (v === "main") onChange("main", undefined);
      else {
        const idx = parseInt(v.split("-")[1]);
        onChange("additional", idx);
      }
    }}>
      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
      <SelectContent>
        {options.map(opt => (
          <SelectItem key={opt.id} value={opt.id}>{opt.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function buildAddressLines(a1, a2, suburb, state, postcode) {
  const line1 = a1 || "";
  const line2 = [a2, [suburb, state, postcode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return { line1, line2 };
}

export function AddressSelector({ crab, selectedType, selectedIndex, onChange }) {
  const [editing, setEditing] = useState(false);

  const options = [];
  const { line1: mL1, line2: mL2 } = buildAddressLines(crab.address1, crab.address2, crab.suburb, crab.state, crab.postcode);
  if (mL1 || mL2) options.push({ id: "main_residential", line1: mL1, line2: mL2, label: `Main Residential: ${[mL1, mL2].filter(Boolean).join(", ")}` });
  (crab.additional_addresses || []).forEach((a, i) => {
    const { line1, line2 } = buildAddressLines(a.address1, a.address2, a.suburb, a.state, a.postcode);
    options.push({ id: `additional-${i}`, line1, line2, label: `${a.label}: ${[line1, line2].filter(Boolean).join(", ")}` });
  });

  if (options.length === 0) {
    return <p className="text-xs text-muted-foreground">No addresses available</p>;
  }

  const currentValue = selectedType === "main_residential" ? "main_residential" : `additional-${selectedIndex ?? 0}`;
  const selected = options.find(o => o.id === currentValue) || options[0];

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="text-left text-xs text-foreground hover:text-primary transition-colors group w-full"
      >
        {selected.line1 && <div className="leading-snug">{selected.line1}</div>}
        {selected.line2 && <div className="leading-snug text-muted-foreground">{selected.line2}</div>}
        {options.length > 1 && (
          <span className="text-[10px] text-muted-foreground/60 group-hover:text-primary/60">click to change</span>
        )}
      </button>
    );
  }

  return (
    <Select
      value={currentValue}
      open
      onOpenChange={(open) => { if (!open) setEditing(false); }}
      onValueChange={(v) => {
        if (v === "main_residential") onChange("main_residential", undefined);
        else {
          const idx = parseInt(v.split("-")[1]);
          onChange("additional", idx);
        }
        setEditing(false);
      }}
    >
      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
      <SelectContent>
        {options.map(opt => (
          <SelectItem key={opt.id} value={opt.id}>
            <span className="flex flex-col">
              <span>{opt.line1}</span>
              {opt.line2 && <span className="text-muted-foreground text-[11px]">{opt.line2}</span>}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}