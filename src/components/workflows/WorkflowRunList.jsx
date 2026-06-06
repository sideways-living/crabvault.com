import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { CheckCircle2, Clock, AlertTriangle, XCircle, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import TaskCompletionModal from "./TaskCompletionModal";

function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

const STATUS_CONFIG = {
  active:    { label: "Active",     color: "text-blue-600",   bg: "bg-blue-50",  icon: Clock },
  completed: { label: "Completed",  color: "text-green-600",  bg: "bg-green-50", icon: CheckCircle2 },
  cancelled: { label: "Cancelled",  color: "text-gray-500",   bg: "bg-gray-50",  icon: XCircle },
  paused:    { label: "Paused",     color: "text-yellow-600", bg: "bg-yellow-50",icon: Clock },
  blocked:   { label: "Blocked",    color: "text-red-600",    bg: "bg-red-50",   icon: AlertTriangle },
};

const TASK_STATUS_COLOR = {
  active:    "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
  skipped:   "bg-gray-100 text-gray-500",
  cancelled: "bg-gray-100 text-gray-500",
  overdue:   "bg-red-100 text-red-800",
  pending:   "bg-yellow-100 text-yellow-800",
};

export default function WorkflowRunList({ refreshKey }) {
  const [runs, setRuns] = useState([]);
  const [tasksByRun, setTasksByRun] = useState({});
  const [crabsMap, setCrabsMap] = useState({});
  const [expandedRun, setExpandedRun] = useState(null);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(null);
  const [completionModal, setCompletionModal] = useState(null); // { task, stepTemplate, crabId }

  const load = async () => {
    const [allRuns, allCrabs] = await Promise.all([
      base44.entities.WorkflowRun.list("-commenced_at", 200),
      base44.entities.Crab.list("full_name", 500),
    ]);
    const cMap = {};
    allCrabs.forEach(c => { cMap[c.id] = c; });
    setCrabsMap(cMap);
    setRuns(allRuns);
    setLoading(false);
  };

  const loadTasksForRun = async (runId) => {
    const tasks = await base44.entities.WorkflowTaskRun.filter({ workflow_run_id: runId }, "commenced_at", 200);
    setTasksByRun(prev => ({ ...prev, [runId]: tasks }));
  };

  useEffect(() => { load(); }, [refreshKey]);

  const toggleExpand = async (runId) => {
    if (expandedRun === runId) {
      setExpandedRun(null);
    } else {
      setExpandedRun(runId);
      if (!tasksByRun[runId]) await loadTasksForRun(runId);
    }
  };

  const handleCompleteTask = async (task, run) => {
    // Load step template to check for completion fields
    let stepTemplate = null;
    try {
      stepTemplate = await base44.entities.WorkflowStepTemplate.get(task.workflow_step_template_id);
    } catch(e) {}

    const hasFields = stepTemplate?.completion_fields?.length > 0;
    if (hasFields) {
      const crabId = run?.related_record_id || null;
      setCompletionModal({ task, stepTemplate, crabId });
      return;
    }

    // No fields — complete directly
    setCompleting(task.id);
    const res = await base44.functions.invoke('workflowEngine', {
      action: 'complete_task',
      payload: { task_run_id: task.id },
    });
    if (res.data?.success) {
      toast.success("Task completed");
      await loadTasksForRun(task.workflow_run_id);
      await load();
    } else {
      toast.error(res.data?.error || "Failed");
    }
    setCompleting(null);
  };

  const handleCancelRun = async (run) => {
    if (!confirm(`Cancel workflow "${run.workflow_template_name}"? Active tasks will be preserved for history.`)) return;
    await base44.functions.invoke('workflowEngine', { action: 'cancel_run', payload: { run_id: run.id } });
    toast.success("Workflow cancelled");
    load();
    if (expandedRun === run.id) await loadTasksForRun(run.id);
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  const activeRuns = runs.filter(r => r.status === 'active' || r.status === 'paused' || r.status === 'blocked');
  const doneRuns = runs.filter(r => r.status === 'completed' || r.status === 'cancelled');

  return (
    <div className="space-y-4">
      {completionModal && (
        <TaskCompletionModal
          task={completionModal.task}
          stepTemplate={completionModal.stepTemplate}
          crabId={completionModal.crabId}
          onCompleted={async () => {
            setCompletionModal(null);
            await loadTasksForRun(completionModal.task.workflow_run_id);
            await load();
          }}
          onCancel={() => setCompletionModal(null)}
        />
      )}
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Running Workflows</h2>

      {activeRuns.length === 0 && (
        <p className="text-sm text-muted-foreground italic">No active workflow runs. Start a workflow from the Templates tab.</p>
      )}

      {activeRuns.map(run => <RunCard key={run.id} run={run} {...{ tasksByRun, crabsMap, expandedRun, completing, toggleExpand, handleCompleteTask, handleCancelRun }} onCompleteTask={(task) => handleCompleteTask(task, run)} />)}

      {doneRuns.length > 0 && (
        <details className="group mt-4">
          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground select-none">
            Show completed/cancelled ({doneRuns.length})
          </summary>
          <div className="mt-2 space-y-2 opacity-70">
            {doneRuns.map(run => <RunCard key={run.id} run={run} {...{ tasksByRun, crabsMap, expandedRun, completing, toggleExpand, handleCompleteTask, handleCancelRun }} onCompleteTask={(task) => handleCompleteTask(task, run)} />)}
          </div>
        </details>
      )}
    </div>
  );
}

function RunCard({ run, tasksByRun, crabsMap, expandedRun, completing, toggleExpand, onCompleteTask, handleCancelRun }) {
  const config = STATUS_CONFIG[run.status] || STATUS_CONFIG.active;
  const StatusIcon = config.icon;
  const isExpanded = expandedRun === run.id;
  const tasks = tasksByRun[run.id] || [];
  const crab = crabsMap[run.related_record_id];
  const today = new Date(); today.setHours(0,0,0,0);

  const activeTasks = tasks.filter(t => t.status === 'active');
  const completedTasks = tasks.filter(t => t.status === 'completed');
  const skippedTasks = tasks.filter(t => t.status === 'skipped');
  const total = tasks.filter(t => t.status !== 'skipped' && t.status !== 'cancelled').length;
  const progress = total > 0 ? Math.round((completedTasks.length / total) * 100) : 0;

  return (
    <div className={`border rounded-xl overflow-hidden ${run.status === 'active' ? '' : 'opacity-75'}`}>
      <div className="flex items-center gap-3 p-3 bg-card cursor-pointer" onClick={() => toggleExpand(run.id)}>
        <StatusIcon className={`h-4 w-4 shrink-0 ${config.color}`} strokeWidth={2.5} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{run.workflow_template_name}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${config.bg} ${config.color}`}>{config.label}</span>
            {crab && (
              <Link
                to={`/crabs/${crab.id}`}
                className="text-xs text-primary hover:underline"
                onClick={e => e.stopPropagation()}
              >
                {crab.full_name || crab.surname}
              </Link>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-xs text-muted-foreground">Started {formatDate(run.commenced_at)}</span>
            {run.status === 'active' && total > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
                </div>
                <span className="text-[10px] text-muted-foreground">{progress}%</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {run.status === 'active' && (
            <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={e => { e.stopPropagation(); handleCancelRun(run); }}>
              Cancel
            </Button>
          )}
          {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>

      {isExpanded && (
        <div className="border-t bg-muted/20 p-3 space-y-3">
          {tasks.length === 0 && (
            <p className="text-xs text-muted-foreground italic">Loading tasks…</p>
          )}

          {/* Active tasks */}
          {activeTasks.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Active</p>
              {activeTasks.map(task => {
                const isOverdue = task.due_at && new Date(task.due_at) < today;
                return (
                  <div key={task.id} className={`flex items-center gap-2 p-2 rounded-lg border text-xs ${isOverdue ? 'border-red-200 bg-red-50/40' : 'bg-white'}`}>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium">{task.step_title}</span>
                      {task.transition_group_id && (
                        <span className="ml-1.5 text-[9px] px-1 rounded bg-muted text-muted-foreground">
                          {task.parallel_completion_rule === 'ANY_ONE_REQUIRED' ? 'ANY' : 'ALL'} group
                        </span>
                      )}
                      <div className={`text-[10px] mt-0.5 ${isOverdue ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
                        Due: {formatDate(task.due_at)}
                        {isOverdue && " — OVERDUE"}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[10px] gap-1 shrink-0"
                      onClick={() => onCompleteTask(task)}
                      disabled={completing === task.id}
                    >
                      {completing === task.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><CheckCircle2 className="h-3 w-3" /> Done</>}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Completed tasks */}
          {completedTasks.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Completed</p>
              {completedTasks.map(task => (
                <div key={task.id} className="flex items-center gap-2 px-2 py-1 rounded text-xs text-muted-foreground">
                  <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" strokeWidth={2.5} />
                  <span className="flex-1">{task.step_title}</span>
                  <span className="text-[10px]">{formatDate(task.completed_at)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Skipped tasks */}
          {skippedTasks.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Skipped</p>
              {skippedTasks.map(task => (
                <div key={task.id} className="flex items-center gap-2 px-2 py-1 rounded text-xs text-muted-foreground line-through">
                  <XCircle className="h-3 w-3 shrink-0" />
                  <span>{task.step_title}</span>
                </div>
              ))}
            </div>
          )}

          {/* Activity log */}
          {run.activity_log && run.activity_log.length > 0 && (
            <details className="mt-2">
              <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground select-none">Activity log ({run.activity_log.length})</summary>
              <div className="mt-1.5 space-y-0.5 max-h-40 overflow-y-auto">
                {[...run.activity_log].reverse().map((entry, i) => (
                  <div key={i} className="flex gap-2 text-[10px] text-muted-foreground">
                    <span className="shrink-0">{new Date(entry.at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    <span className="font-medium">{entry.event.replace(/_/g, ' ')}</span>
                    {entry.step_title && <span className="text-muted-foreground/70">— {entry.step_title}</span>}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}