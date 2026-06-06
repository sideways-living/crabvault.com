import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const FIELD_TYPES = [
  { value: "text", label: "Text input" },
  { value: "document_upload", label: "Document upload (single PDF)" },
  { value: "document_upload_pair", label: "Document upload (two PDFs)" },
];

const PROFILE_PATHS = [
  { value: "", label: "— no profile update —" },
  { value: "phone", label: "Crab: main phone" },
  { value: "email", label: "Crab: main email" },
  { value: "yellowbank_last_branch", label: "YellowBank: last branch visited" },
  { value: "yellowbank_last_branch_purpose", label: "YellowBank: last branch purpose" },
];

/**
 * Inline editor for a step's completion_fields array.
 * Used inside WorkflowTemplateEditor per step.
 */
export default function StepCompletionFieldsEditor({ fields, onChange }) {
  const add = () => {
    onChange([...fields, {
      key: `field_${Date.now()}`,
      label: "",
      type: "text",
      default_value: "",
      profile_update_path: "",
      required: false,
    }]);
  };

  const update = (idx, patch) => {
    onChange(fields.map((f, i) => i === idx ? { ...f, ...patch } : f));
  };

  const remove = (idx) => {
    onChange(fields.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Completion Fields
        </span>
        <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1 px-2" onClick={add}>
          <Plus className="h-3 w-3" /> Add field
        </Button>
      </div>

      {fields.length === 0 && (
        <p className="text-[10px] text-muted-foreground italic">
          No fields — task completes immediately with no data collected.
        </p>
      )}

      {fields.map((f, idx) => (
        <div key={f.key || idx} className="border rounded-lg p-2.5 bg-muted/20 space-y-2">
          <div className="flex gap-2 items-start">
            <div className="flex-1 space-y-1.5">
              <Input
                className="h-7 text-xs"
                placeholder="Label (shown to user)"
                value={f.label}
                onChange={e => update(idx, { label: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-1.5">
                <select
                  className="border rounded-md h-7 px-2 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                  value={f.type}
                  onChange={e => update(idx, { type: e.target.value })}
                >
                  {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <select
                  className="border rounded-md h-7 px-2 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                  value={f.profile_update_path || ""}
                  onChange={e => update(idx, { profile_update_path: e.target.value })}
                >
                  {PROFILE_PATHS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              {f.type === "text" && (
                <Input
                  className="h-7 text-xs"
                  placeholder="Default value (optional)"
                  value={f.default_value || ""}
                  onChange={e => update(idx, { default_value: e.target.value })}
                />
              )}
              <label className="flex items-center gap-1.5 text-[10px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!f.required}
                  onChange={e => update(idx, { required: e.target.checked })}
                />
                Required
              </label>
            </div>
            <Button
              size="sm" variant="ghost"
              className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive shrink-0 mt-0.5"
              onClick={() => remove(idx)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}