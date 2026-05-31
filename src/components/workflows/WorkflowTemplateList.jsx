import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Pencil, Archive, Play, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const STATUS_COLOR = {
  draft: "bg-yellow-100 text-yellow-800",
  active: "bg-green-100 text-green-800",
  archived: "bg-gray-100 text-gray-500",
};

export default function WorkflowTemplateList({ onEdit, onStart, onCreate }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const all = await base44.entities.WorkflowTemplate.list("name", 200);
    setTemplates(all.filter(t => t.status !== 'archived'));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleArchive = async (t) => {
    if (!confirm(`Archive "${t.name}"? It will no longer be available for new runs.`)) return;
    await base44.entities.WorkflowTemplate.update(t.id, { status: 'archived' });
    toast.success("Template archived");
    load();
  };

  const handleActivate = async (t) => {
    await base44.entities.WorkflowTemplate.update(t.id, { status: 'active' });
    toast.success("Template activated");
    load();
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Workflow Templates</h2>
        <Button size="sm" className="gap-1.5" onClick={onCreate}>
          <Plus className="h-3.5 w-3.5" /> New Template
        </Button>
      </div>

      {templates.length === 0 && (
        <p className="text-sm text-muted-foreground italic">No workflow templates yet. Create one to get started.</p>
      )}

      <div className="space-y-2">
        {templates.map(t => (
          <div key={t.id} className="flex items-center gap-3 p-3 rounded-xl border bg-card">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{t.name}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${STATUS_COLOR[t.status] || STATUS_COLOR.draft}`}>
                  {t.status}
                </span>
              </div>
              {t.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{t.description}</p>}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Edit" onClick={() => onEdit(t)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              {t.status === 'active' ? (
                <>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground" title="Archive" onClick={() => handleArchive(t)}>
                    <Archive className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" className="gap-1 h-7 text-xs" onClick={() => onStart(t)}>
                    <Play className="h-3 w-3" /> Start
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleActivate(t)}>
                  Activate
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}