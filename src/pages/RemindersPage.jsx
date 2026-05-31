import { useState } from "react";
import { Bell, GitBranch } from "lucide-react";
import WorkflowTemplateList from "@/components/workflows/WorkflowTemplateList";
import WorkflowTemplateEditor from "@/components/workflows/WorkflowTemplateEditor";
import WorkflowRunList from "@/components/workflows/WorkflowRunList";
import StartWorkflowModal from "@/components/workflows/StartWorkflowModal";

const TABS = [
  { id: "reminders", label: "Reminders", icon: Bell },
  { id: "workflows", label: "Workflows", icon: GitBranch },
];

export default function RemindersPage() {
  const [activeTab, setActiveTab] = useState("reminders");
  const [workflowView, setWorkflowView] = useState("runs"); // "runs" | "templates" | "editor"
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [startingTemplate, setStartingTemplate] = useState(null);
  const [runRefreshKey, setRunRefreshKey] = useState(0);

  const handleEditTemplate = (t) => { setEditingTemplate(t); setWorkflowView("editor"); };
  const handleCreateTemplate = () => { setEditingTemplate(null); setWorkflowView("editor"); };
  const handleTemplateSaved = () => { setEditingTemplate(null); setWorkflowView("templates"); };
  const handleStarted = () => { setStartingTemplate(null); setWorkflowView("runs"); setRunRefreshKey(k => k + 1); };

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Bell className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold">Reminders & Workflows</h1>
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Reminders tab */}
      {activeTab === "reminders" && (
        <div className="text-sm text-muted-foreground italic">
          Use the Reminders section on individual Crab profiles to add and manage reminders.
        </div>
      )}

      {/* Workflows tab */}
      {activeTab === "workflows" && (
        <div className="space-y-4">
          {workflowView !== "editor" && (
            <div className="flex gap-2 border-b pb-3">
              <button
                onClick={() => setWorkflowView("runs")}
                className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${workflowView === "runs" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
              >
                Active Runs
              </button>
              <button
                onClick={() => setWorkflowView("templates")}
                className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${workflowView === "templates" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
              >
                Templates
              </button>
            </div>
          )}

          {workflowView === "runs" && (
            <WorkflowRunList refreshKey={runRefreshKey} />
          )}

          {workflowView === "templates" && (
            <WorkflowTemplateList
              onEdit={handleEditTemplate}
              onStart={(t) => setStartingTemplate(t)}
              onCreate={handleCreateTemplate}
            />
          )}

          {workflowView === "editor" && (
            <WorkflowTemplateEditor
              template={editingTemplate}
              onSaved={handleTemplateSaved}
              onCancel={() => setWorkflowView("templates")}
            />
          )}
        </div>
      )}

      {/* Start workflow modal */}
      {startingTemplate && (
        <StartWorkflowModal
          template={startingTemplate}
          onClose={() => setStartingTemplate(null)}
          onStarted={handleStarted}
        />
      )}
    </div>
  );
}