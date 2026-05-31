import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { action, payload } = body;

  if (action === 'start_workflow') {
    return await startWorkflow(base44, user, payload);
  }
  if (action === 'complete_task') {
    return await completeTask(base44, user, payload);
  }
  if (action === 'cancel_run') {
    return await cancelRun(base44, user, payload);
  }

  return Response.json({ error: 'Unknown action' }, { status: 400 });
});

// ─── Start a workflow run ────────────────────────────────────────────────────
async function startWorkflow(base44, user, payload) {
  const { workflow_template_id, related_record_id, related_record_type, notes } = payload;

  let tmpl;
  try { tmpl = await base44.entities.WorkflowTemplate.get(workflow_template_id); }
  catch(e) { return Response.json({ error: 'Template not found' }, { status: 404 }); }
  if (!tmpl) return Response.json({ error: 'Template not found' }, { status: 404 });

  if (tmpl.status !== 'active') return Response.json({ error: 'Template is not active' }, { status: 400 });

  const allSteps = await base44.entities.WorkflowStepTemplate.filter({ workflow_template_id });
  const startSteps = allSteps.filter(s => s.is_start_step);
  if (startSteps.length === 0) return Response.json({ error: 'No start step defined' }, { status: 400 });

  const now = new Date().toISOString();
  const run = await base44.entities.WorkflowRun.create({
    workflow_template_id,
    workflow_template_name: tmpl.name,
    status: 'active',
    commenced_at: now,
    created_by: user.id,
    related_record_id: related_record_id || null,
    related_record_type: related_record_type || null,
    notes: notes || null,
    activity_log: [{ at: now, event: 'workflow_started', step_title: tmpl.name, by: user.id }],
  });

  for (const step of startSteps) {
    await createTaskRun(base44, run, step, null, null, now);
  }

  return Response.json({ success: true, run_id: run.id });
}

// ─── Complete a workflow task ────────────────────────────────────────────────
async function completeTask(base44, user, payload) {
  const { task_run_id } = payload;

  let taskRun;
  try { taskRun = await base44.entities.WorkflowTaskRun.get(task_run_id); }
  catch(e) { return Response.json({ error: 'Task run not found' }, { status: 404 }); }
  if (!taskRun) return Response.json({ error: 'Task run not found' }, { status: 404 });

  // Idempotency: already completed or skipped
  if (taskRun.status === 'completed' || taskRun.status === 'skipped') {
    return Response.json({ success: true, already_done: true });
  }

  const now = new Date().toISOString();

  // Mark task as completed
  await base44.entities.WorkflowTaskRun.update(taskRun.id, {
    status: 'completed',
    completed_at: now,
    completed_by: user.id,
  });

  // Mark linked reminder as done
  if (taskRun.reminder_id) {
    await base44.entities.Reminder.update(taskRun.reminder_id, {
      is_done: true,
      completed_at: now,
    });
  }

  // Load the run
  let run;
  try { run = await base44.entities.WorkflowRun.get(taskRun.workflow_run_id); }
  catch(e) { return Response.json({ error: 'Run not found' }, { status: 404 }); }
  if (!run) return Response.json({ error: 'Run not found' }, { status: 404 });

  const log = [...(run.activity_log || []), {
    at: now,
    event: 'task_completed',
    step_title: taskRun.step_title,
    by: user.id,
  }];

  // Handle parallel group logic
  if (taskRun.transition_group_id && taskRun.parallel_completion_rule) {
    const siblingTasks = await base44.entities.WorkflowTaskRun.filter({
      workflow_run_id: taskRun.workflow_run_id,
      transition_group_id: taskRun.transition_group_id,
    });

    if (taskRun.parallel_completion_rule === 'ANY_ONE_REQUIRED') {
      // Skip remaining active siblings
      for (const sibling of siblingTasks) {
        if (sibling.id !== taskRun.id && sibling.status === 'active') {
          await base44.entities.WorkflowTaskRun.update(sibling.id, { status: 'skipped' });
          if (sibling.reminder_id) {
            await base44.entities.Reminder.update(sibling.reminder_id, { is_deleted: true });
          }
          log.push({ at: now, event: 'task_skipped', step_title: sibling.step_title, by: 'system' });
        }
      }
    } else if (taskRun.parallel_completion_rule === 'ALL_REQUIRED') {
      // Check if all siblings are done
      const refreshedSiblings = await base44.entities.WorkflowTaskRun.filter({
        workflow_run_id: taskRun.workflow_run_id,
        transition_group_id: taskRun.transition_group_id,
      });
      const allDone = refreshedSiblings.every(s => s.status === 'completed' || s.id === taskRun.id);
      if (!allDone) {
        // Not all done yet, just save log and return
        await base44.entities.WorkflowRun.update(run.id, { activity_log: log });
        return Response.json({ success: true, waiting_for_group: true });
      }
    }
  }

  // Find transitions from this step
  const transitions = await base44.entities.WorkflowTransition.filter({
    workflow_template_id: run.workflow_template_id,
    from_step_id: taskRun.workflow_step_template_id,
  });

  if (transitions.length === 0) {
    // Check if workflow is now complete
    await checkAndCompleteWorkflow(base44, run, log, now);
  } else {
    // Group transitions by transition_group_id (null = independent)
    const groups = {};
    for (const t of transitions) {
      const key = t.transition_group_id || `__solo__${t.to_step_id}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    }

    const commenced_at = run.commenced_at;

    for (const [groupKey, groupTransitions] of Object.entries(groups)) {
      const rule = groupTransitions[0].group_completion_rule || 'ALL_REQUIRED';
      const isSolo = groupKey.startsWith('__solo__');
      const groupId = isSolo ? null : groupKey;

      for (const transition of groupTransitions) {
        let nextStep;
        try { nextStep = await base44.entities.WorkflowStepTemplate.get(transition.to_step_id); }
        catch(e) { continue; }
        if (!nextStep) continue;

        // Idempotency: check if task run already exists for this step in this run
        const existing = await base44.entities.WorkflowTaskRun.filter({
          workflow_run_id: run.id,
          workflow_step_template_id: nextStep.id,
        });
        const alreadyActive = existing.filter(t => t.status === 'active' || t.status === 'completed');
        if (alreadyActive.length > 0) continue;

        const newTask = await createTaskRun(base44, run, nextStep, groupId, isSolo ? null : rule, commenced_at);
        log.push({ at: now, event: 'task_created', step_title: nextStep.title, by: 'system' });
      }
    }

    await base44.entities.WorkflowRun.update(run.id, { activity_log: log });
  }

  return Response.json({ success: true });
}

// ─── Cancel a workflow run ───────────────────────────────────────────────────
async function cancelRun(base44, user, payload) {
  const { run_id } = payload;
  const now = new Date().toISOString();

  let run;
  try { run = await base44.entities.WorkflowRun.get(run_id); }
  catch(e) { return Response.json({ error: 'Run not found' }, { status: 404 }); }
  if (!run) return Response.json({ error: 'Run not found' }, { status: 404 });

  const log = [...(run.activity_log || []), { at: now, event: 'workflow_cancelled', by: user.id }];
  await base44.entities.WorkflowRun.update(run_id, { status: 'cancelled', cancelled_at: now, activity_log: log });

  // Mark remaining active tasks as cancelled (don't delete)
  const tasks = await base44.entities.WorkflowTaskRun.filter({ workflow_run_id: run_id });
  for (const t of tasks) {
    if (t.status === 'active') {
      await base44.entities.WorkflowTaskRun.update(t.id, { status: 'cancelled' });
    }
  }

  return Response.json({ success: true });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function createTaskRun(base44, run, step, transitionGroupId, completionRule, commenced_at) {
  const now = new Date().toISOString();
  const dueDate = new Date(commenced_at);
  dueDate.setDate(dueDate.getDate() + (step.due_days_from_commencement || 7));
  const dueDateStr = dueDate.toISOString().split('T')[0];

  const reminder = await base44.entities.Reminder.create({
    crab_id: run.related_record_id || null,
    reminder_type: step.title,
    due_date: dueDateStr,
    notes: step.description || null,
    is_done: false,
    workflow_run_id: run.id,
    workflow_step_template_id: step.id,
  });

  const taskRun = await base44.entities.WorkflowTaskRun.create({
    workflow_run_id: run.id,
    workflow_step_template_id: step.id,
    step_title: step.title,
    reminder_id: reminder.id,
    status: 'active',
    commenced_at: now,
    due_at: dueDate.toISOString(),
    transition_group_id: transitionGroupId || null,
    parallel_completion_rule: completionRule || null,
  });

  return taskRun;
}

async function checkAndCompleteWorkflow(base44, run, log, now) {
  const allTasks = await base44.entities.WorkflowTaskRun.filter({ workflow_run_id: run.id });
  const hasActiveOrPending = allTasks.some(t => t.status === 'active' || t.status === 'pending');

  if (!hasActiveOrPending) {
    log.push({ at: now, event: 'workflow_completed', by: 'system' });
    await base44.entities.WorkflowRun.update(run.id, {
      status: 'completed',
      completed_at: now,
      activity_log: log,
    });
  } else {
    await base44.entities.WorkflowRun.update(run.id, { activity_log: log });
  }
}