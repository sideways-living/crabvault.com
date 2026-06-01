/**
 * Mark a reminder as done. If it belongs to a workflow, routes through the
 * workflow engine so the next task is created correctly.
 */
export async function markReminderDone(base44, reminder) {
  if (reminder.workflow_run_id) {
    // Find the linked WorkflowTaskRun
    const tasks = await base44.entities.WorkflowTaskRun.filter({
      workflow_run_id: reminder.workflow_run_id,
      reminder_id: reminder.id,
    });
    const task = tasks.find(t => t.status === 'active');
    if (task) {
      await base44.functions.invoke('workflowEngine', {
        action: 'complete_task',
        payload: { task_run_id: task.id },
      });
      return;
    }
  }
  // Plain reminder — mark directly
  await base44.entities.Reminder.update(reminder.id, {
    is_done: true,
    completed_at: new Date().toISOString(),
  });
}

/**
 * Returns urgency info for an active (non-done) reminder based on its due date.
 * - overdue: past today
 * - due_soon: due within 1 day (today or tomorrow)
 * - normal: everything else
 */
export function getReminderUrgency(dueDate) {
  if (!dueDate) return "normal";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);

  if (due < today) return "overdue";
  if (due <= tomorrow) return "due_soon";
  return "normal";
}

/** Card container classes based on urgency */
export function reminderCardClass(urgency, extra = "") {
  if (urgency === "overdue") return `border-red-200 bg-red-50/50 ${extra}`;
  if (urgency === "due_soon") return `border-orange-200 bg-orange-50/50 ${extra}`;
  return `bg-muted/20 ${extra}`;
}

/** Due date text classes based on urgency */
export function reminderDueDateClass(urgency) {
  if (urgency === "overdue") return "text-red-600 font-medium";
  if (urgency === "due_soon") return "text-orange-500 font-medium";
  return "text-muted-foreground/70";
}