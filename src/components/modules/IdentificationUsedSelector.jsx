import { ShieldCheck } from "lucide-react";
import { Label } from "@/components/ui/label";

// Extracts unique ID type labels from a crab's id_numbers array
function getIdTypes(idNumbers) {
  const types = new Set();
  (idNumbers || []).forEach(entry => {
    const colonIdx = entry.label?.indexOf(": ");
    if (colonIdx > -1) {
      types.add(entry.label.slice(0, colonIdx));
    }
  });
  return [...types];
}

export default function IdentificationUsedSelector({ crab, selected = [], onChange }) {
  const idTypes = getIdTypes(crab?.id_numbers);

  if (idTypes.length === 0) return null;

  const toggle = (idType) => {
    const updated = selected.includes(idType)
      ? selected.filter(t => t !== idType)
      : [...selected, idType];
    onChange(updated);
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs flex items-center gap-1">
        <ShieldCheck className="h-3 w-3" /> Identification Used
      </Label>
      <div className="flex flex-wrap gap-2">
        {idTypes.map(idType => (
          <button
            key={idType}
            type="button"
            onClick={() => toggle(idType)}
            className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${
              selected.includes(idType)
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-muted text-muted-foreground border-border hover:border-primary hover:text-foreground"
            }`}
          >
            {idType}
          </button>
        ))}
      </div>
    </div>
  );
}