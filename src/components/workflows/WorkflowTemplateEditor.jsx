import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Trash2, ArrowRight, Loader2, X, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";

const PRIORITIES = ["low", "normal", "high", "urgent"];

function generateGroupId() {
  return `grp_${Math.random().toString(36).slice(2, 9)}`;
}

export default function WorkflowTemplateEditor({ template, onSaved, onCancel }) {
  const isNew = !template?.id;
  const [name, setName] = useState(template?.name || "");
  const [description, setDescription] = useState(template?.description || "");
  const [status, setStatus] = useState(template?.status || "draft");
  const [steps, setSteps] = useState([]);
  const [transitions, setTransitions] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!isNew);

  useEffect(() => {
    if (!isNew) {
      Promise.all([
        base44.entities.WorkflowStepTemplate.filter({ workflow_template_id: template.id }, "step_number", 200),
        base44.entities.WorkflowTransition.filter({ workflow_template_id: template.id }, "created_date", 200),
      ]).then(([s, t]) => {
        setSteps(s);
        setTransitions(t);
        setLoading(false);
      });
    }
  }, []);

  const addStep = () => {
    const tmpId = `new_${Date.now()}`;
    setSteps(prev => [...prev, {
      _tmpId: tmpId,
      title: "",
      description: "",
      due_days_from_commencement: 7,
      priority: "normal",
      is_start_step: prev.length === 0,
      is_final_step: false,
    }]);
  };

  const updateStep = (idx, field, value) => {
    setSteps(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  const removeStep = (idx) => {
    const step = steps[idx];
    const stepId = step.id || step._tmpId;
    setSteps(prev => prev.filter((_, i) => i !== idx));
    setTransitions(prev => prev.filter(t => t.from_step_id !== stepId && t.to_step_id !== stepId));
  };

  const addTransition = () => {
    setTransitions(prev => [...prev, {
      _tmpId: `nt_${Date.now()}`,
      from_step_id: "",
      to_step_id: "",
      transition_group_id: "",
      group_completion_rule: "ALL_REQUIRED",
    }]);
  };

  const updateTransition = (idx, field, value) => {
    setTransitions(prev => prev.map((t, i) => i === idx ? { ...t, [field]: value } : t));
  };

  const removeTransition = (idx) => {
    setTransitions(prev => prev.filter((_, i) => i !== idx));
  };

  const getStepId = (step) => step.id || step._tmpId;
  const getStepLabel = (step) => step.title || "(unnamed step)";

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Template name is required"); return; }
    const startSteps = steps.filter(s => s.is_start_step);
    if (steps.length > 0 && startSteps.length === 0) {
      toast.error("At least one step must be marked as Start Step");
      return;
    }
    setSaving(true);

    // Save/update template
    let tmplId = template?.id;
    if (isNew) {
      const created = await base44.entities.WorkflowTemplate.create({ name: name.trim(), description: description.trim() || null, status });
      tmplId = created.id;
    } else {
      await base44.entities.WorkflowTemplate.update(tmplId, { name: name.trim(), description: description.trim() || null, status });
    }

    // Save steps: create new, update existing
    const stepIdMap = {}; // tmpId -> real id
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      const stepData = {
        workflow_template_id: tmplId,
        step_number: i + 1,
        title: s.title,
        description: s.description || null,
        due_days_from_commencement: Number(s.due_days_from_commencement) || 7,
        priority: s.priority || 'normal',
        is_start_step: !!s.is_start_step,
        is_final_step: !!s.is_final_step,
        assigned_role: s.assigned_role || null,
      };
      if (s.id) {
        await base44.entities.WorkflowStepTemplate.update(s.id, stepData);
        stepIdMap[s._tmpId || s.id] = s.id;
        stepIdMap[s.id] = s.id;
      } else {
        const created = await base44.entities.WorkflowStepTemplate.create(stepData);
        stepIdMap[s._tmpId] = created.id;
      }
    }

    // Delete old transitions, recreate all
    if (!isNew) {
      const oldTransitions = await base44.entities.WorkflowTransition.filter({ workflow_template_id: tmplId });
      for (const ot of oldTransitions) {
        await base44.entities.WorkflowTransition.delete(ot.id);
      }
    }
    for (const t of transitions) {
      const fromId = stepIdMap[t.from_step_id] || t.from_step_id;
      const toId = stepIdMap[t.to_step_id] || t.to_step_id;
      if (!fromId || !toId) continue;
      await base44.entities.WorkflowTransition.create({
        workflow_template_id: tmplId,
        from_step_id: fromId,
        to_step_id: toId,
        transition_group_id: t.transition_group_id || null,
        group_completion_rule: t.group_completion_rule || 'ALL_REQUIRED',
        notes: t.notes || null,
      });
    }

    toast.success(isNew ? "Template created" : "Template saved");
    setSaving(false);
    onSaved(tmplId);
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold flex-1">{isNew ? "New Workflow Template" : `Edit: ${template.name}`}</h2>
        <Button variant="ghost" size="sm" onClick={onCancel}><X className="h-4 w-4" /></Button>
      </div>

      {/* Template metadata */}
      <div className="space-y-3 p-4 border rounded-xl bg-card">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Template Name *</label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Client Onboarding" className="h-9" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Description</label>
          <textarea
            className="w-full border rounded-md px-3 py-2 text-sm bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            rows={2}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Optional description…"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Status</label>
          <select
            className="w-full border rounded-md h-9 px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            value={status}
            onChange={e => setStatus(e.target.value)}
          >
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Steps</h3>
          <Button size="sm" variant="outline" className="gap-1 h-7 text-xs" onClick={addStep}>
            <Plus className="h-3 w-3" /> Add Step
          </Button>
        </div>
        {steps.length === 0 && (
          <p className="text-xs text-muted-foreground italic">No steps yet. Add the first step.</p>
        )}
        {steps.map((step, idx) => (
          <div key={getStepId(step)} className="border rounded-xl p-3 bg-card space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-muted-foreground w-5">{idx + 1}</span>
              <Input
                className="h-8 text-sm flex-1"
                placeholder="Step title *"
                value={step.title}
                onChange={e => updateStep(idx, 'title', e.target.value)}
              />
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => removeStep(idx)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <textarea
              className="w-full border rounded-md px-3 py-1.5 text-xs bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              rows={2}
              placeholder="Description / instructions (optional)"
              value={step.description || ""}
              onChange={e => updateStep(idx, 'description', e.target.value)}
            />
            <div className="flex flex-wrap gap-3">
              <div className="space-y-0.5 flex-1 min-w-[100px]">
                <label className="text-[10px] font-medium text-muted-foreground">Days to complete</label>
                <Input
                  type="number"
                  className="h-7 text-xs"
                  value={step.due_days_from_commencement}
                  onChange={e => updateStep(idx, 'due_days_from_commencement', e.target.value)}
                  min={1}
                />
              </div>
              <div className="space-y-0.5 flex-1 min-w-[100px]">
                <label className="text-[10px] font-medium text-muted-foreground">Priority</label>
                <select
                  className="w-full border rounded-md h-7 px-2 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                  value={step.priority || 'normal'}
                  onChange={e => updateStep(idx, 'priority', e.target.value)}
                >
                  {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="space-y-0.5 flex-1 min-w-[100px]">
                <label className="text-[10px] font-medium text-muted-foreground">Role</label>
                <Input
                  className="h-7 text-xs"
                  placeholder="e.g. admin"
                  value={step.assigned_role || ""}
                  onChange={e => updateStep(idx, 'assigned_role', e.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-4">
              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input type="checkbox" checked={!!step.is_start_step} onChange={e => updateStep(idx, 'is_start_step', e.target.checked)} />
                Start step
              </label>
              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input type="checkbox" checked={!!step.is_final_step} onChange={e => updateStep(idx, 'is_final_step', e.target.checked)} />
                Final step
              </label>
            </div>
          </div>
        ))}
      </div>

      {/* Transitions */}
      {steps.length > 1 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Transitions</h3>
            <Button size="sm" variant="outline" className="gap-1 h-7 text-xs" onClick={addTransition}>
              <Plus className="h-3 w-3" /> Add Transition
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Define what happens after each step completes. Use a shared Group ID for parallel branches.</p>
          {transitions.length === 0 && (
            <p className="text-xs text-muted-foreground italic">No transitions. For a linear workflow, add transitions chaining each step to the next.</p>
          )}
          {transitions.map((t, idx) => (
            <div key={t._tmpId || t.id || idx} className="border rounded-xl p-3 bg-card space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <div className="space-y-0.5">
                    <label className="text-[10px] font-medium text-muted-foreground">From step</label>
                    <select
                      className="w-full border rounded-md h-8 px-2 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                      value={t.from_step_id}
                      onChange={e => updateTransition(idx, 'from_step_id', e.target.value)}
                    >
                      <option value="">— select —</option>
                      {steps.map(s => <option key={getStepId(s)} value={getStepId(s)}>{getStepLabel(s)}</option>)}
                    </select>
                  </div>
                  <div className="space-y-0.5">
                    <label className="text-[10px] font-medium text-muted-foreground">To step</label>
                    <select
                      className="w-full border rounded-md h-8 px-2 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                      value={t.to_step_id}
                      onChange={e => updateTransition(idx, 'to_step_id', e.target.value)}
                    >
                      <option value="">— select —</option>
                      {steps.map(s => <option key={getStepId(s)} value={getStepId(s)}>{getStepLabel(s)}</option>)}
                    </select>
                  </div>
                </div>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive shrink-0" onClick={() => removeTransition(idx)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-0.5">
                  <label className="text-[10px] font-medium text-muted-foreground">Group ID (parallel)</label>
                  <div className="flex gap-1">
                    <Input
                      className="h-7 text-xs flex-1"
                      placeholder="leave blank for solo"
                      value={t.transition_group_id || ""}
                      onChange={e => updateTransition(idx, 'transition_group_id', e.target.value)}
                    />
                    <Button size="sm" variant="ghost" className="h-7 px-1.5 text-[10px]" onClick={() => updateTransition(idx, 'transition_group_id', generateGroupId())}>
                      gen
                    </Button>
                  </div>
                </div>
                <div className="space-y-0.5">
                  <label className="text-[10px] font-medium text-muted-foreground">Completion rule</label>
                  <select
                    className="w-full border rounded-md h-7 px-2 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                    value={t.group_completion_rule || 'ALL_REQUIRED'}
                    onChange={e => updateTransition(idx, 'group_completion_rule', e.target.value)}
                    disabled={!t.transition_group_id}
                  >
                    <option value="ALL_REQUIRED">All required</option>
                    <option value="ANY_ONE_REQUIRED">Any one required</option>
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Workflow visual preview — drag to reorder */}
      {steps.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Flow Preview <span className="text-xs text-muted-foreground font-normal ml-1">— drag to reorder</span></h3>
          <DragDropContext onDragEnd={result => {
            if (!result.destination || result.destination.index === result.source.index) return;
            const reordered = Array.from(steps);
            const [moved] = reordered.splice(result.source.index, 1);
            reordered.splice(result.destination.index, 0, moved);
            setSteps(reordered);
          }}>
            <Droppable droppableId="flow-preview">
              {(provided) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className="border rounded-xl p-4 bg-muted/30 space-y-1"
                >
                  {steps.map((step, idx) => {
                    const stepId = getStepId(step);
                    const outgoing = transitions.filter(t => t.from_step_id === stepId);
                    return (
                      <Draggable key={stepId} draggableId={stepId} index={idx}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className={snapshot.isDragging ? "opacity-80" : ""}
                          >
                            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium ${step.is_start_step ? 'bg-blue-100 text-blue-800' : step.is_final_step ? 'bg-green-100 text-green-800' : 'bg-white border'}`}>
                              <span {...provided.dragHandleProps} className="cursor-grab text-muted-foreground hover:text-foreground">
                                <GripVertical className="h-3.5 w-3.5" />
                              </span>
                              <span className="text-muted-foreground w-4">{idx + 1}</span>
                              <span className="flex-1">{step.title || '(unnamed)'}</span>
                              <span className="text-[10px] text-muted-foreground">{step.due_days_from_commencement}d</span>
                              {step.is_start_step && <span className="text-[10px] bg-blue-200 text-blue-700 px-1 rounded">START</span>}
                              {step.is_final_step && <span className="text-[10px] bg-green-200 text-green-700 px-1 rounded">END</span>}
                            </div>
                            {outgoing.length > 0 && (
                              <div className="ml-4 pl-3 border-l border-dashed border-muted-foreground/30 my-1 space-y-0.5">
                                {outgoing.map((t, ti) => {
                                  const toStep = steps.find(s => getStepId(s) === t.to_step_id);
                                  return (
                                    <div key={ti} className="text-[10px] text-muted-foreground flex items-center gap-1">
                                      <ArrowRight className="h-2.5 w-2.5" />
                                      {toStep ? toStep.title : '?'}
                                      {t.transition_group_id && (
                                        <span className="ml-1 px-1 rounded bg-muted text-[9px]">
                                          {t.group_completion_rule === 'ANY_ONE_REQUIRED' ? 'ANY' : 'ALL'} [{t.transition_group_id.slice(0, 6)}]
                                        </span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </Draggable>
                    );
                  })}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <Button variant="outline" className="flex-1" onClick={onCancel}>Cancel</Button>
        <Button className="flex-1" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : isNew ? "Create Template" : "Save Template"}
        </Button>
      </div>
    </div>
  );
}