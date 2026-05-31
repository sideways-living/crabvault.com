import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { X, Play, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function StartWorkflowModal({ template, onClose, onStarted }) {
  const [crabs, setCrabs] = useState([]);
  const [steps, setSteps] = useState([]);
  const [selectedCrabId, setSelectedCrabId] = useState("");
  const [selectedStepId, setSelectedStepId] = useState("");
  const [notes, setNotes] = useState("");
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    base44.entities.Crab.list("full_name", 500).then(list => setCrabs(list.filter(c => !c.is_deleted)));
    base44.entities.WorkflowStepTemplate.filter({ workflow_template_id: template.id }).then(list => {
      const sorted = list.sort((a, b) => (a.step_number || 0) - (b.step_number || 0));
      setSteps(sorted);
      const startStep = sorted.find(s => s.is_start_step);
      if (startStep) setSelectedStepId(startStep.id);
    });
  }, []);

  const handleStart = async () => {
    setStarting(true);
    const res = await base44.functions.invoke('workflowEngine', {
      action: 'start_workflow',
      payload: {
        workflow_template_id: template.id,
        related_record_id: selectedCrabId || null,
        related_record_type: selectedCrabId ? 'crab' : null,
        notes: notes.trim() || null,
        start_step_id: selectedStepId || null,
      },
    });
    if (res.data?.success) {
      toast.success(`Workflow "${template.name}" started`);
      onStarted(res.data.run_id);
    } else {
      toast.error(res.data?.error || "Failed to start workflow");
      setStarting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-card border rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Start Workflow</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{template.name}</p>
          </div>
          <button onClick={onClose}><X className="h-4 w-4 text-muted-foreground hover:text-foreground" /></button>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Link to Crab (optional)</label>
          <select
            className="w-full border rounded-md h-9 px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            value={selectedCrabId}
            onChange={e => setSelectedCrabId(e.target.value)}
          >
            <option value="">— Not linked to a crab —</option>
            {crabs.map(c => <option key={c.id} value={c.id}>{c.full_name || c.surname}</option>)}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Start at step</label>
          <select
            className="w-full border rounded-md h-9 px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            value={selectedStepId}
            onChange={e => setSelectedStepId(e.target.value)}
          >
            <option value="">— Use default start step —</option>
            {steps.map(s => (
              <option key={s.id} value={s.id}>
                {s.step_number ? `${s.step_number}. ` : ""}{s.title}{s.is_start_step ? " (default start)" : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Notes (optional)</label>
          <textarea
            className="w-full border rounded-md px-3 py-2 text-sm bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            rows={2}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Context or notes for this workflow run…"
          />
        </div>

        <div className="flex gap-2 pt-1">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1 gap-1.5" onClick={handleStart} disabled={starting}>
            {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Play className="h-3.5 w-3.5" /> Start</>}
          </Button>
        </div>
      </div>
    </div>
  );
}