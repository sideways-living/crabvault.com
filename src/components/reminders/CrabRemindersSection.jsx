import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Bell, CheckCircle2, AlertTriangle, Clock, Loader2, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import EditReminderModal from "./EditReminderModal";

function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

export default function CrabRemindersSection({ crabId, crabName, refreshKey }) {
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingReminder, setEditingReminder] = useState(null);

  const load = async () => {
    const rems = await base44.entities.Reminder.filter({ crab_id: crabId }, "due_date", 200);
    setReminders(rems);
    setLoading(false);
  };

  useEffect(() => { load(); }, [crabId, refreshKey]);

  const handleMarkDone = async (reminder) => {
    await base44.entities.Reminder.update(reminder.id, {
      is_done: true,
      completed_at: new Date().toISOString(),
    });
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

  active.sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
  done.sort((a, b) => new Date(b.completed_at || b.updated_date) - new Date(a.completed_at || a.updated_date));

  if (loading) return (
    <div className="bg-card border rounded-xl p-5 flex justify-center">
      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <>
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
          <Bell className="h-3.5 w-3.5" /> Reminders
        </h2>

        {reminders.filter(r => !r.is_deleted).length === 0 && (
          <p className="text-xs text-muted-foreground">No reminders yet</p>
        )}

        {/* Active */}
        {active.length > 0 && (
          <div className="space-y-1.5">
            {active.map(r => {
              const isOverdue = r.due_date && new Date(r.due_date) < today;
              return (
                <div key={r.id} className={`rounded-lg border text-xs overflow-hidden ${isOverdue ? "border-red-200 bg-red-50/40" : "bg-muted/20"}`}>
                  {/* Row 1: icon+type (2/3) | edit/delete/done (1/3) */}
                  <div className="flex">
                    <div className="flex-[2] p-2.5 flex flex-col gap-1 justify-start">
                      {isOverdue
                        ? <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />
                        : <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                      }
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium">{r.reminder_type || "Reminder"}</span>
                        {r.notes && <p className="text-muted-foreground truncate leading-tight">{r.notes}</p>}
                      </div>
                    </div>
                    <div className="flex-1 p-2 flex flex-col items-end justify-between">
                      <div className="flex items-center gap-0.5">
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground" onClick={() => setEditingReminder(r)} title="Edit">
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(r)} title="Delete">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 gap-1" onClick={() => handleMarkDone(r)}>
                        <CheckCircle2 className="h-3 w-3" /> Done
                      </Button>
                    </div>
                  </div>
                  {/* Row 2: Added (left 50%) | Due (right 50%) */}
                  <div className="flex">
                    <div className="flex-1 px-2.5 py-1.5 text-muted-foreground/70">
                      <div className="text-[10px] uppercase tracking-wide">Added</div>
                      <div>{formatDate(r.created_date)}</div>
                    </div>
                    <div className={`flex-1 px-2.5 py-1.5 text-right ${isOverdue ? "text-red-600 font-medium" : "text-muted-foreground/70"}`}>
                      <div className="text-[10px] uppercase tracking-wide">Due</div>
                      <div>{formatDate(r.due_date)}</div>
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
                  {/* Row 1: icon+type (2/3) | edit/delete (1/3) */}
                  <div className="flex">
                    <div className="flex-[2] p-2 flex flex-col gap-1 justify-center">
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                        <span className="font-medium">{r.reminder_type || "Reminder"}</span>
                      </div>
                      {r.notes && <p className="text-muted-foreground truncate leading-tight">{r.notes}</p>}
                    </div>
                    <div className="flex-1 p-2 flex flex-col items-end justify-start">
                      <div className="flex items-center gap-0.5">
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground" onClick={() => setEditingReminder(r)} title="Edit">
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(r)} title="Delete">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                  {/* Row 2: Added (50%) | Completed (50%) */}
                  <div className="flex">
                    <div className="flex-1 px-2 py-1.5 text-muted-foreground/70">
                      <div className="text-[10px] uppercase tracking-wide">Added</div>
                      <div>{formatDate(r.created_date)}</div>
                    </div>
                    <div className="flex-1 px-2 py-1.5 text-right text-emerald-600">
                      <div className="text-[10px] uppercase tracking-wide">Completed</div>
                      <div>{formatDate(r.completed_at)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </>
  );
}