import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Bell, CheckCircle2, AlertTriangle, Clock, Loader2, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import EditReminderModal from "./EditReminderModal";
import TaskCompletionModal from "@/components/workflows/TaskCompletionModal";
import { getReminderUrgency, reminderCardClass, reminderDueDateClass } from "@/lib/reminderUtils";

function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

export default function CrabRemindersSection({ crabId, crabName, refreshKey }) {
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingReminder, setEditingReminder] = useState(null);
  const [completionModal, setCompletionModal] = useState(null); // { task, stepTemplate }

  const load = async () => {
    const rems = await base44.entities.Reminder.filter({ crab_id: crabId }, "due_date", 200);
    setReminders(rems);
    setLoading(false);
  };

  useEffect(() => { load(); }, [crabId, refreshKey]);

  const handleMarkDone = async (reminder) => {
    // Workflow-linked reminders: check if the step has completion fields
    if (reminder.workflow_run_id) {
      const tasks = await base44.entities.WorkflowTaskRun.filter({ workflow_run_id: reminder.workflow_run_id });
      const task = tasks.find(t => t.reminder_id === reminder.id && t.status === 'active');
      if (task) {
        let stepTemplate = null;
        try { stepTemplate = await base44.entities.WorkflowStepTemplate.get(task.workflow_step_template_id); } catch(e) {}
        if (stepTemplate?.completion_fields?.length > 0) {
          setCompletionModal({ task, stepTemplate });
          return;
        }
        // No fields — complete via engine directly
        await base44.functions.invoke('workflowEngine', { action: 'complete_task', payload: { task_run_id: task.id } });
        toast.success("Marked as done");
        load();
        return;
      }
    }
    // Plain reminder
    await base44.entities.Reminder.update(reminder.id, { is_done: true, completed_at: new Date().toISOString() });
    toast.success("Marked as done");
    load();
  };

  const handleDelete = async (reminder) => {
    if (!confirm(`Delete this reminder${reminder.reminder_type ? ` (${reminder.reminder_type})` : ""}? It will be moved to deleted items.`)) return;
    await base44.entities.Reminder.update(reminder.id, { is_deleted: true });
    toast.success("Reminder deleted");
    load();
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const active = reminders.filter(r => !r.is_done && !r.is_deleted);
  const done = reminders.filter(r => r.is_done && !r.is_deleted);

  active.sort((a, b) => {
    const dateDiff = new Date(a.due_date) - new Date(b.due_date);
    if (dateDiff !== 0) return dateDiff;
    return new Date(a.created_date) - new Date(b.created_date);
  });
  done.sort((a, b) => new Date(b.completed_at || b.updated_date) - new Date(a.completed_at || a.updated_date));

  if (loading) return (
    <div className="bg-card border rounded-xl p-5 flex justify-center">
      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <TooltipProvider>
      <>
        {completionModal && (
          <TaskCompletionModal
            task={completionModal.task}
            stepTemplate={completionModal.stepTemplate}
            crabId={crabId}
            onCompleted={() => { setCompletionModal(null); load(); }}
            onCancel={() => setCompletionModal(null)}
          />
        )}
        {editingReminder && (
          <EditReminderModal
            reminder={editingReminder}
            crabName={crabName}
            onClose={() => setEditingReminder(null)}
            onSaved={() => { setEditingReminder(null); load(); }}
          />
        )}

        <div className="bg-card border rounded-xl p-5 space-y-3">
          <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Bell className="h-3.5 w-3.5" />
              </TooltipTrigger>
              <TooltipContent>Reminders</TooltipContent>
            </Tooltip>
            Reminders
          </h2>

        {reminders.filter(r => !r.is_deleted).length === 0 && (
          <p className="text-xs text-muted-foreground">No reminders yet</p>
        )}

        {/* Active */}
        {active.length > 0 && (
          <div className="space-y-1.5">
            {active.map(r => {
              const urgency = getReminderUrgency(r.due_date);
              const isOverdue = urgency === "overdue";
              const isDueSoon = urgency === "due_soon";
              return (
                <div key={r.id} className={`rounded-lg border text-xs overflow-hidden ${reminderCardClass(urgency)}`}>
                  {/* Row 1: status icon (left) | edit + done + delete buttons (right) */}
                  <div className="flex items-center px-2.5 pt-2 pb-1 gap-1">
                    {isOverdue
                      ? <Tooltip>
                          <TooltipTrigger asChild>
                            <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 cursor-help" strokeWidth={2.5} />
                          </TooltipTrigger>
                          <TooltipContent>Overdue</TooltipContent>
                        </Tooltip>
                      : isDueSoon
                        ? <Tooltip>
                            <TooltipTrigger asChild>
                              <Clock className="h-4 w-4 text-orange-500 shrink-0 cursor-help" strokeWidth={2.5} />
                            </TooltipTrigger>
                            <TooltipContent>Due soon</TooltipContent>
                          </Tooltip>
                        : <Tooltip>
                            <TooltipTrigger asChild>
                              <Clock className="h-4 w-4 text-muted-foreground shrink-0 cursor-help" strokeWidth={2.5} />
                            </TooltipTrigger>
                            <TooltipContent>Active</TooltipContent>
                          </Tooltip>
                    }
                    <div className="flex-1" />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-black hover:text-black hover:bg-black/10" onClick={() => setEditingReminder(r)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Edit reminder</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-green-600 hover:text-green-700 hover:bg-green-50" onClick={() => handleMarkDone(r)}>
                          <CheckCircle2 className="h-3 w-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Mark as done</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => handleDelete(r)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Delete reminder</TooltipContent>
                    </Tooltip>
                  </div>
                  {/* Row 2: reminder type + notes */}
                  <div className="px-2.5 pb-1">
                    <span className="text-sm font-bold">{r.reminder_type || "Reminder"}</span>
                    {r.notes && <p className="text-xs text-muted-foreground truncate leading-tight mt-0.5">{r.notes}</p>}
                  </div>
                  {/* Row 3: Added (left 50%) | Due (right 50%) */}
                  <div className="flex border-t mt-1">
                    <div className="flex-1 px-2.5 py-1 text-muted-foreground/70">
                      <div className="text-[8px] uppercase tracking-wide">Added</div>
                      <div className="text-[10px]">{formatDate(r.created_date)}</div>
                    </div>
                    <div className={`flex-1 px-2.5 py-1 text-right ${reminderDueDateClass(urgency)}`}>
                      <div className="text-[8px] uppercase tracking-wide">Due</div>
                      <div className="text-[10px]">{formatDate(r.due_date)}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Done log */}
        {done.length > 0 && (
          <details className="group">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground select-none">
              Show completed ({done.length})
            </summary>
            <div className="space-y-1.5 mt-2 opacity-60">
              {done.map(r => (
                <div key={r.id} className="rounded-lg border bg-muted/10 text-xs overflow-hidden">
                  {/* Row 1: status icon (left) | edit + delete buttons (right) */}
                  <div className="flex items-center px-2 pt-2 pb-1 gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 cursor-help" strokeWidth={2.5} />
                      </TooltipTrigger>
                      <TooltipContent>Completed</TooltipContent>
                    </Tooltip>
                    <div className="flex-1" />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-black hover:text-black hover:bg-black/10" onClick={() => setEditingReminder(r)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Edit reminder</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => handleDelete(r)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Delete reminder</TooltipContent>
                    </Tooltip>
                  </div>
                  {/* Row 2: reminder type + notes */}
                  <div className="px-2 pb-1">
                    <span className="text-sm font-bold">{r.reminder_type || "Reminder"}</span>
                    {r.notes && <p className="text-xs text-muted-foreground truncate leading-tight mt-0.5">{r.notes}</p>}
                  </div>
                  {/* Row 3: Added (50%) | Completed (50%) */}
                  <div className="flex border-t mt-1">
                    <div className="flex-1 px-2 py-1 text-muted-foreground/70">
                      <div className="text-[8px] uppercase tracking-wide">Added</div>
                      <div className="text-[10px]">{formatDate(r.created_date)}</div>
                    </div>
                    <div className="flex-1 px-2 py-1 text-right text-emerald-600">
                      <div className="text-[8px] uppercase tracking-wide">Completed</div>
                      <div className="text-[10px]">{formatDate(r.completed_at)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
      </>
      </TooltipProvider>
      );
      }