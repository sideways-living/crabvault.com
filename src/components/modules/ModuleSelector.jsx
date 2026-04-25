import { Layers } from "lucide-react";

const AVAILABLE_MODULES = [
  {
    key: "redbank",
    label: "RedBank",
    description: "Banking accounts, cards & login",
    color: "bg-red-100 text-red-700 border-red-200",
  },
];

export { AVAILABLE_MODULES };

export default function ModuleSelector({ enabledModules, onToggle }) {
  return (
    <div className="bg-card border rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Layers className="h-4 w-4 text-muted-foreground" />
        <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Modules</h2>
      </div>
      <div className="space-y-2">
        {AVAILABLE_MODULES.map(mod => {
          const enabled = enabledModules.includes(mod.key);
          return (
            <label key={mod.key} className="flex items-center justify-between cursor-pointer group">
              <div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${mod.color}`}>{mod.label}</span>
                <p className="text-xs text-muted-foreground mt-0.5">{mod.description}</p>
              </div>
              <button
                onClick={() => onToggle(mod.key, enabled)}
                className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                  enabled ? "bg-primary" : "bg-muted"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    enabled ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </label>
          );
        })}
      </div>
    </div>
  );
}