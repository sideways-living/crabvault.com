import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Bell, CheckCircle2, AlertTriangle, Clock, Loader2, Pencil, Trash2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import EditReminderModal from "./EditReminderModal";
import { Link } from "react-router-dom";

function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

export default function AllRemindersView() {
  const [reminders, setReminders] = useState([]);
  const [crabs, setCrabs] = useState({});
  const [loading, setLoading] = useState(true);
  const [editingReminder, setEditingReminder] = useState(null);
  const [showDone, setShowDone] = useState(false);

  const load = async () => {
    const [rems, crabList] = await Promise.all([
      base44.entities.Reminder.filter({ is_deleted: false }, "due_date", 500),
      base44.entities.Crab.filter({ is_deleted: false }, "full_name", 500),
    ]);
    const crabMap = {};
    crabList.forEach(c => { crabMap[c.id] = c; });
    setCrabs(crabMap);
    setReminders(rems);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleMarkDone = async (reminder) => {
    await base44.entities.Reminder.update(reminder.id, {
      is_done: true,
      completed_at: new Date().toISOString(),
    });
    toast.success("Marked as done");
    load();
  };

  const handleDelete = async (reminder) => {
    if (!confirm(`Delete this reminder${reminder.reminder_type ? ` (${reminder.reminder_type})` : ""}?`)) return;
    await base44.entities.Reminder.update(reminder.id, { is_deleted: true });
    toast.success("Reminder deleted");
    load();
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const active = reminders
    .filter(r => !r.is_done)
    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

  const done = reminders
    .filter(r => r.is_done)
    .sort((a, b) => new Date(b.completed_at || b.updated_date) - new Date(a.completed_at || a.updated_date));

  if (loading) return (
    <div className="flex justify-center py-12">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );

  const ReminderCard = ({ r, isDone }) => {
    const isOverdue = !isDone && r.due_date && new Date(r.due_date) < today;
    const crab = crabs[r.crab_id];
    const crabName = crab ? (crab.full_name || [crab.first_name, crab.surname].filter(Boolean).join(" ")) : null;

    return (
      <div className={`rounded-lg border text-xs overflow-hidden ${isOverdue ? "border-red-200 bg-red-50/40" : isDone ? "bg-muted/10 opacity-70" : "bg-muted/20"}`}>
        <div className="flex items-center px-2.5 pt-2 pb-1 gap-1">
          {isDone
            ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" strokeWidth={2.5} />
            : isOverdue
              ? <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" strokeWidth={2.5} />
              : <Clock className="h-4 w-4 text-muted-foreground shrink-0" strokeWidth={2.5} />
          }
          {crabName && (
            <Link to={`/crabs/${r.crab_id}`} className="flex items-center gap-1 text-[10px] text-primary hover:underline ml-1 font-medium truncate flex-1">
              <User className="h-3 w-3 shrink-0" />
              {crabName}
            </Link>
          )}
          <div className="flex-1" />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-black hover:text-black hover:bg-black/10" onClick={() => setEditingReminder(r)}>
                <Pencil className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Edit</TooltipContent>
          </Tooltip>
          {!isDone && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-green-600 hover:text-green-700 hover:bg-green-50" onClick={() => handleMarkDone(r)}>
                  <CheckCircle2 className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Mark done</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => handleDelete(r)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete</TooltipContent>
          </Tooltip>
        </div>
        <div className="px-2.5 pb-1">
          <span className="text-sm font-bold">{r.reminder_type || "Reminder"}</span>
          {r.notes && <p className="text-xs text-muted-foreground truncate leading-tight mt-0.5">{r.notes}</p>}
        </div>
        <div className="flex border-t mt-1">
          <div className="flex-1 px-2.5 py-1 text-muted-foreground/70">
            <div className="text-[8px] uppercase tracking-wide">Added</div>
            <div className="text-[10px]">{formatDate(r.created_date)}</div>
          </div>
          <div className={`flex-1 px-2.5 py-1 text-right ${isDone ? "text-emerald-600" : isOverdue ? "text-red-600 font-medium" : "text-muted-foreground/70"}`}>
            <div className="text-[8px] uppercase tracking-wide">{isDone ? "Completed" : "Due"}</div>
            <div className="text-[10px]">{formatDate(isDone ? r.completed_at : r.due_date)}</div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <TooltipProvider>
      {editingReminder && (
        <EditReminderModal
          reminder={editingReminder}
          crabName={crabs[editingReminder.crab_id]?.full_name || ""}
          onClose={() => setEditingReminder(null)}
          onSaved={() => { setEditingReminder(null); load(); }}
        />
      )}

      <div className="space-y-4">
        {/* Summary */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>{active.filter(r => new Date(r.due_date) < today).length > 0 && (
            <span className="text-red-600 font-medium">{active.filter(r => new Date(r.due_date) < today).length} overdue · </span>
          )}{active.length} active reminder{active.length !== 1 ? "s" : ""}</span>
        </div>

        {/* Active */}
        {active.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No active reminders.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {active.map(r => <ReminderCard key={r.id} r={r} isDone={false} />)}
          </div>
        )}

        {/* Done */}
        {done.length > 0 && (
          <details open={showDone} onToggle={e => setShowDone(e.target.open)}>
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground select-none">
              Show completed ({done.length})
            </summary>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
              {done.map(r => <ReminderCard key={r.id} r={r} isDone={true} />)}
            </div>
          </details>
        )}
      </div>
    </TooltipProvider>
  );
}