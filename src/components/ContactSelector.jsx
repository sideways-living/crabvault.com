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

export function AddressSelector({ crab, selectedType, selectedIndex, onChange }) {
  const options = [];
  const mainAddr = [crab.address1, crab.suburb, crab.state].filter(Boolean).join(", ");
  if (mainAddr) options.push({ id: "main_residential", label: `Main Residential: ${mainAddr}` });
  (crab.additional_addresses || []).forEach((a, i) => {
    const addr = [a.address1, a.suburb, a.state].filter(Boolean).join(", ");
    options.push({ id: `additional-${i}`, label: `${a.label}: ${addr}` });
  });

  if (options.length === 0) {
    return <p className="text-xs text-muted-foreground">No addresses available</p>;
  }

  const currentValue = selectedType === "main_residential" ? "main_residential" : `additional-${selectedIndex}`;

  return (
    <Select value={currentValue} onValueChange={(v) => {
      if (v === "main_residential") onChange("main_residential", undefined);
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