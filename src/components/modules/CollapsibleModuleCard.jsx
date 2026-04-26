import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

export default function CollapsibleModuleCard({ label, badgeClass, children }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-card border rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center gap-2 p-4 hover:bg-muted/30 transition-colors text-left"
        onClick={() => setOpen(o => !o)}
      >
        <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${badgeClass}`}>{label}</span>
        <span className="font-semibold text-sm uppercase tracking-wider text-muted-foreground flex-1">{label} Module</span>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="px-5 pb-5 space-y-4">
          {children}
        </div>
      )}
    </div>
  );
}