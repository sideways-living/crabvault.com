import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Bell, CheckCircle2, AlertTriangle, Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

export default function CrabRemindersSection({ crabId, refreshKey }) {
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);

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

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const active = reminders.filter(r => !r.is_done);
  const done = reminders.filter(r => r.is_done);

  active.sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
  done.sort((a, b) => new Date(b.completed_at || b.updated_date) - new Date(a.completed_at || a.updated_date));

  if (loading) return (
    <div className="bg-card border rounded-xl p-5 flex justify-center">
      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="bg-card border rounded-xl p-5 space-y-3">
      <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        <Bell className="h-3.5 w-3.5" /> Reminders
      </h2>

      {reminders.length === 0 && (
        <p className="text-xs text-muted-foreground">No reminders yet</p>
      )}

      {/* Active */}
      {active.length > 0 && (
        <div className="space-y-1.5">
          {active.map(r => {
            const isOverdue = r.due_date && new Date(r.due_date) < today;
            return (
              <div key={r.id} className={`flex items-center gap-2.5 p-2.5 rounded-lg border text-xs ${isOverdue ? "border-red-200 bg-red-50/40" : "bg-muted/20"}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {isOverdue
                      ? <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />
                      : <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                    }
                    {r.reminder_type && <span className="font-medium">{r.reminder_type}</span>}
                    <span className={isOverdue ? "text-red-600 font-medium" : "text-muted-foreground"}>
                      Due {formatDate(r.due_date)}
                    </span>
                  </div>
                  {r.notes && <p className="text-muted-foreground mt-0.5 truncate">{r.notes}</p>}
                  <p className="text-muted-foreground/60 mt-0.5">Added {formatDate(r.created_date)}</p>
                </div>
                <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 shrink-0 gap-1" onClick={() => handleMarkDone(r)}>
                  <CheckCircle2 className="h-3 w-3" /> Done
                </Button>
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
              <div key={r.id} className="flex items-center gap-2 p-2 rounded-lg border bg-muted/10 text-xs">
                <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {r.reminder_type && <span className="font-medium">{r.reminder_type}</span>}
                    <span className="text-muted-foreground">Due {formatDate(r.due_date)}</span>
                    <span className="text-emerald-600">✓ {formatDate(r.completed_at)}</span>
                  </div>
                  {r.notes && <p className="text-muted-foreground truncate">{r.notes}</p>}
                  <p className="text-muted-foreground/60">Added {formatDate(r.created_date)}</p>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}