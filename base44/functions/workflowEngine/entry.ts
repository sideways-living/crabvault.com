import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { action, payload } = body;

  if (action === 'start_workflow') return await startWorkflow(base44, user, payload);
  if (action === 'complete_task') return await completeTask(base44, user, payload);
  if (action === 'cancel_run') return await cancelRun(base44, user, payload);

  return Response.json({ error: 'Unknown action' }, { status: 400 });
});

// ─── Start a workflow run ────────────────────────────────────────────────────
async function startWorkflow(base44, user, payload) {
  const { workflow_template_id, related_record_id, related_record_type, notes, start_step_id } = payload;

  let tmpl;
  try { tmpl = await base44.entities.WorkflowTemplate.get(workflow_template_id); }
  catch(e) { return Response.json({ error: 'Template not found' }, { status: 404 }); }
  if (!tmpl) return Response.json({ error: 'Template not found' }, { status: 404 });

  if (tmpl.status !== 'active') return Response.json({ error: 'Template is not active' }, { status: 400 });

  const allSteps = await base44.entities.WorkflowStepTemplate.filter({ workflow_template_id });

  let startSteps;
  if (start_step_id) {
    const chosenStep = allSteps.find(s => s.id === start_step_id);
    if (!chosenStep) return Response.json({ error: 'Specified start step not found' }, { status: 400 });
    startSteps = [chosenStep];
  } else {
    startSteps = allSteps.filter(s => s.is_start_step);
  }
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
  const { task_run_id, completion_data } = payload;

  let taskRun;
  try { taskRun = await base44.entities.WorkflowTaskRun.get(task_run_id); }
  catch(e) { return Response.json({ error: 'Task run not found' }, { status: 404 }); }
  if (!taskRun) return Response.json({ error: 'Task run not found' }, { status: 404 });

  if (taskRun.status === 'completed' || taskRun.status === 'skipped') {
    return Response.json({ success: true, already_done: true });
  }

  const now = new Date().toISOString();

  // Mark task as completed, storing any completion data
  await base44.entities.WorkflowTaskRun.update(taskRun.id, {
    status: 'completed',
    completed_at: now,
    completed_by: user.id,
    completion_data: completion_data || null,
  });

  // Mark linked reminder as done
  if (taskRun.reminder_id) {
    await base44.entities.Reminder.update(taskRun.reminder_id, {
      is_done: true,
      completed_at: now,
    });
  }

  // Apply profile updates from completion_data if step template has completion_fields
  if (completion_data && taskRun.workflow_step_template_id) {
    await applyProfileUpdates(base44, taskRun, completion_data);
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
    const allTasksInRun = await base44.entities.WorkflowTaskRun.filter({ workflow_run_id: taskRun.workflow_run_id });
    const siblingTasks = allTasksInRun.filter(t => t.transition_group_id === taskRun.transition_group_id);

    if (taskRun.parallel_completion_rule === 'ANY_ONE_REQUIRED') {
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
      const refreshedSiblings = allTasksInRun.filter(t => t.transition_group_id === taskRun.transition_group_id);
      // Treat the current task as completed regardless of DB read timing
      const allDone = refreshedSiblings.every(s => s.id === taskRun.id || s.status === 'completed' || s.status === 'skipped');
      if (!allDone) {
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
    await checkAndCompleteWorkflow(base44, run, log, now);
  } else {
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

      // Collect unique target steps across all transitions in this group
      const targetStepIds = [...new Set(groupTransitions.map(t => t.to_step_id))];
      for (const toStepId of targetStepIds) {
        let nextStep;
        try { nextStep = await base44.entities.WorkflowStepTemplate.get(toStepId); }
        catch(e) { continue; }
        if (!nextStep) continue;

        const existing = await base44.entities.WorkflowTaskRun.filter({
          workflow_run_id: run.id,
          workflow_step_template_id: nextStep.id,
        });
        const alreadyActive = existing.filter(t => t.status === 'active' || t.status === 'completed');
        if (alreadyActive.length > 0) continue;

        // Target tasks are never parallel siblings — they are convergence points.
        // Only source tasks (the ones completing) carry a group_id for sibling checks.
        await createTaskRun(base44, run, nextStep, null, null, commenced_at);
        log.push({ at: now, event: 'task_created', step_title: nextStep.title, by: 'system' });
      }
    }

    await base44.entities.WorkflowRun.update(run.id, { activity_log: log });
  }

  return Response.json({ success: true });
}

// ─── Apply profile updates from completion data ──────────────────────────────
async function applyProfileUpdates(base44, taskRun, completionData) {
  let stepTemplate;
  try { stepTemplate = await base44.entities.WorkflowStepTemplate.get(taskRun.workflow_step_template_id); }
  catch(e) { return; }
  if (!stepTemplate || !stepTemplate.completion_fields) return;

  const fields = stepTemplate.completion_fields;

  // Get the workflow run to find related crab
  let run;
  try { run = await base44.entities.WorkflowRun.get(taskRun.workflow_run_id); }
  catch(e) { return; }
  if (!run || !run.related_record_id) return;

  const crabId = run.related_record_id;

  // Collect crab updates and module updates
  const crabUpdates = {};
  const ybModuleUpdates = {};

  for (const field of fields) {
    const value = completionData[field.key];
    if (!value || !field.profile_update_path) continue;

    const path = field.profile_update_path;

    // YellowBank module fields
    if (path.startsWith('yellowbank_')) {
      ybModuleUpdates[path] = value;
    } else {
      // Direct crab fields
      crabUpdates[path] = value;
    }
  }

  // Apply crab updates
  if (Object.keys(crabUpdates).length > 0) {
    try { await base44.entities.Crab.update(crabId, crabUpdates); }
    catch(e) { console.error('Failed to update crab:', e.message); }
  }

  // Apply yellowbank module updates
  if (Object.keys(ybModuleUpdates).length > 0) {
    try {
      const modules = await base44.entities.CrabModule.filter({ crab_id: crabId, module_type: 'yellowbank' });
      if (modules.length > 0) {
        await base44.entities.CrabModule.update(modules[0].id, ybModuleUpdates);
      }
    } catch(e) { console.error('Failed to update YB module:', e.message); }
  }

  // Link uploaded documents to crab (update crab_ids on any docs created in this completion)
  for (const field of fields) {
    if (field.type === 'document_upload_pair') {
      const uploads = completionData[field.key];
      if (Array.isArray(uploads)) {
        for (const upload of uploads) {
          if (upload.doc_id) {
            try { await base44.entities.CrabDocument.update(upload.doc_id, { matched_crab_id: crabId, crab_ids: [crabId] }); }
            catch(e) {}
          }
        }
      }
    } else if (field.type === 'document_upload') {
      const upload = completionData[field.key];
      if (upload?.doc_id) {
        try { await base44.entities.CrabDocument.update(upload.doc_id, { matched_crab_id: crabId, crab_ids: [crabId] }); }
        catch(e) {}
      }
    }
  }
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