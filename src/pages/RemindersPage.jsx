import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Bell, CheckCircle2, Clock, AlertTriangle, User, Loader2, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import EditReminderModal from "@/components/reminders/EditReminderModal";

function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

export default function RemindersPage() {
  const [reminders, setReminders] = useState([]);
  const [crabs, setCrabs] = useState({});
  const [loading, setLoading] = useState(true);
  const [editingReminder, setEditingReminder] = useState(null);

  const load = async () => {
    const [rems, crabList] = await Promise.all([
      base44.entities.Reminder.list("due_date", 500),
      base44.entities.Crab.list("full_name", 500),
    ]);
    const crabMap = {};
    crabList.forEach(c => { crabMap[c.id] = c; });
    setCrabs(crabMap);
    setReminders(rems.filter(r => !r.is_deleted));
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
    if (!confirm(`Delete this reminder${reminder.reminder_type ? ` (${reminder.reminder_type})` : ""}? It will be moved to deleted items.`)) return;
    await base44.entities.Reminder.update(reminder.id, { is_deleted: true });
    toast.success("Reminder deleted");
    load();
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const overdue = reminders.filter(r => !r.is_done && r.due_date && new Date(r.due_date) < today);
  const upcoming = reminders.filter(r => !r.is_done && r.due_date && new Date(r.due_date) >= today);
  const done = reminders.filter(r => r.is_done);

  overdue.sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
  upcoming.sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
  done.sort((a, b) => new Date(b.completed_at || b.updated_date) - new Date(a.completed_at || a.updated_date));

  if (loading) return (
    <div className="flex justify-center py-20">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  const rowProps = { crabs, onMarkDone: handleMarkDone, onEdit: setEditingReminder, onDelete: handleDelete };

  return (
    <>
      {editingReminder && (
        <EditReminderModal
          reminder={editingReminder}
          onClose={() => setEditingReminder(null)}
          onSaved={() => { setEditingReminder(null); load(); }}
        />
      )}

      <div className="space-y-8 max-w-3xl">
        <div className="flex items-center gap-3">
          <Bell className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Reminders</h1>
          <span className="ml-auto text-sm text-muted-foreground">
            {overdue.length > 0 && <span className="text-red-600 font-semibold">{overdue.length} overdue · </span>}
            {upcoming.length} upcoming
          </span>
        </div>

        {/* Overdue */}
        {overdue.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-red-600 flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4" /> Overdue
            </h2>
            {overdue.map(r => <ReminderRow key={r.id} reminder={r} {...rowProps} overdue />)}
          </section>
        )}

        {/* Upcoming */}
        {upcoming.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-4 w-4" /> Upcoming
            </h2>
            {upcoming.map(r => <ReminderRow key={r.id} reminder={r} {...rowProps} />)}
          </section>
        )}

        {upcoming.length === 0 && overdue.length === 0 && (
          <p className="text-sm text-muted-foreground italic">No active reminders.</p>
        )}

        {/* Done */}
        {done.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" /> Completed
            </h2>
            <div className="space-y-1.5 opacity-60">
              {done.map(r => <ReminderRow key={r.id} reminder={r} {...rowProps} />)}
            </div>
          </section>
        )}
      </div>
    </>
  );
}

function ReminderRow({ reminder, crabs, onMarkDone, onEdit, onDelete, overdue }) {
  const crab = crabs[reminder.crab_id];
  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border bg-card ${overdue ? "border-red-200 bg-red-50/40" : ""}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {reminder.reminder_type && (
            <span className="text-sm font-medium">{reminder.reminder_type}</span>
          )}
          {crab && (
            <Link to={`/crabs/${crab.id}`} className="text-xs text-primary hover:underline flex items-center gap-1">
              <User className="h-3 w-3" />{crab.full_name || crab.surname}
            </Link>
          )}
        </div>
        {reminder.notes && <p className="text-xs text-muted-foreground mt-0.5 truncate">{reminder.notes}</p>}
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
          <span className={overdue ? "text-red-600 font-medium" : ""}>
            Due: {formatDate(reminder.due_date)}
          </span>
          <span>Created: {formatDate(reminder.created_date)}</span>
          {reminder.is_done && reminder.completed_at && (
            <span className="text-emerald-600">Done: {formatDate(reminder.completed_at)}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={() => onEdit(reminder)} title="Edit">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => onDelete(reminder)} title="Delete">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
        {!reminder.is_done && (
          <Button size="sm" variant="outline" className="shrink-0 gap-1.5 text-xs h-7" onClick={() => onMarkDone(reminder)}>
            <CheckCircle2 className="h-3.5 w-3.5" /> Done
          </Button>
        )}
        {reminder.is_done && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
      </div>
    </div>
  );
}