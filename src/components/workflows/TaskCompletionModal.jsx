import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, X, Upload, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

/**
 * Modal shown when completing a workflow task that has completion_fields defined.
 *
 * Props:
 *   task        — WorkflowTaskRun record
 *   stepTemplate — WorkflowStepTemplate record (has completion_fields)
 *   crabId      — related crab id (for document uploads / profile updates)
 *   onCompleted — callback after successful completion
 *   onCancel    — callback to dismiss
 */
export default function TaskCompletionModal({ task, stepTemplate, crabId, onCompleted, onCancel }) {
  const fields = stepTemplate?.completion_fields || [];

  // Build initial form state
  const initialValues = {};
  fields.forEach(f => {
    if (f.type === "document_upload_pair") {
      initialValues[f.key + "_doc1_label"] = "";
      initialValues[f.key + "_doc1_file"] = null;
      initialValues[f.key + "_doc2_label"] = "";
      initialValues[f.key + "_doc2_file"] = null;
    } else if (f.type === "document_upload") {
      initialValues[f.key + "_label"] = "";
      initialValues[f.key + "_file"] = null;
    } else {
      initialValues[f.key] = f.default_value || "";
    }
  });

  const [values, setValues] = useState(initialValues);
  const [saving, setSaving] = useState(false);

  const set = (key, val) => setValues(prev => ({ ...prev, [key]: val }));

  const handleComplete = async () => {
    // Validate required fields
    for (const f of fields) {
      if (!f.required) continue;
      if (f.type === "document_upload_pair") {
        if (!values[f.key + "_doc1_file"]) { toast.error(`${f.label}: Document 1 is required`); return; }
        if (!values[f.key + "_doc2_file"]) { toast.error(`${f.label}: Document 2 is required`); return; }
      } else if (f.type === "document_upload") {
        if (!values[f.key + "_file"]) { toast.error(`${f.label} is required`); return; }
      } else {
        if (!values[f.key]?.trim()) { toast.error(`${f.label} is required`); return; }
      }
    }

    setSaving(true);
    const completionData = {};

    // Process each field
    for (const f of fields) {
      if (f.type === "document_upload_pair") {
        const doc1File = values[f.key + "_doc1_file"];
        const doc2File = values[f.key + "_doc2_file"];
        const doc1Label = values[f.key + "_doc1_label"] || "Document 1";
        const doc2Label = values[f.key + "_doc2_label"] || "Document 2";

        const uploads = [];
        for (const [file, label] of [[doc1File, doc1Label], [doc2File, doc2Label]]) {
          if (!file) continue;
          const { file_url } = await base44.integrations.Core.UploadFile({ file });
          // Create CrabDocument record
          const doc = await base44.entities.CrabDocument.create({
            title: label,
            file_url,
            original_filename: file.name,
            original_file_url: file_url,
            file_type: "pdf",
            file_size: file.size,
            crab_ids: crabId ? [crabId] : [],
            matched_crab_id: crabId || null,
            category: "id",
            processing_status: "pending",
            is_latest_version: true,
            version_number: 1,
          });
          uploads.push({ doc_id: doc.id, label, file_url });
        }
        completionData[f.key] = uploads;

      } else if (f.type === "document_upload") {
        const file = values[f.key + "_file"];
        const label = values[f.key + "_label"] || f.label;
        if (file) {
          const { file_url } = await base44.integrations.Core.UploadFile({ file });
          const doc = await base44.entities.CrabDocument.create({
            title: label,
            file_url,
            original_filename: file.name,
            original_file_url: file_url,
            file_type: "pdf",
            file_size: file.size,
            crab_ids: crabId ? [crabId] : [],
            matched_crab_id: crabId || null,
            category: "id",
            processing_status: "pending",
            is_latest_version: true,
            version_number: 1,
          });
          completionData[f.key] = { doc_id: doc.id, label, file_url };
        }
      } else {
        completionData[f.key] = values[f.key];
      }
    }

    // Complete the workflow task (engine will handle profile updates)
    const res = await base44.functions.invoke("workflowEngine", {
      action: "complete_task",
      payload: { task_run_id: task.id, completion_data: completionData },
    });

    if (res.data?.success) {
      toast.success("Task completed");
      onCompleted();
    } else {
      toast.error(res.data?.error || "Failed to complete task");
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h2 className="font-semibold text-sm">Complete Task</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{task.step_title}</p>
          </div>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onCancel}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-4 space-y-4">
          {fields.length === 0 ? (
            <p className="text-sm text-muted-foreground">Mark this task as complete?</p>
          ) : (
            fields.map(f => (
              <FieldInput key={f.key} field={f} values={values} onChange={set} />
            ))
          )}
        </div>

        <div className="flex gap-2 p-4 border-t">
          <Button variant="outline" className="flex-1" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button className="flex-1 gap-2" onClick={handleComplete} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {saving ? "Completing…" : "Complete Task"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function FieldInput({ field, values, onChange }) {
  if (field.type === "document_upload_pair") {
    return (
      <div className="space-y-3">
        <label className="text-xs font-semibold text-foreground">{field.label}{field.required && <span className="text-red-500 ml-0.5">*</span>}</label>
        <DocUploadField
          labelKey={field.key + "_doc1_label"}
          fileKey={field.key + "_doc1_file"}
          labelPlaceholder="Document 1 name (e.g. Passport)"
          values={values}
          onChange={onChange}
        />
        <DocUploadField
          labelKey={field.key + "_doc2_label"}
          fileKey={field.key + "_doc2_file"}
          labelPlaceholder="Document 2 name (e.g. Proof of Address)"
          values={values}
          onChange={onChange}
        />
      </div>
    );
  }

  if (field.type === "document_upload") {
    return (
      <div className="space-y-2">
        <label className="text-xs font-semibold text-foreground">{field.label}{field.required && <span className="text-red-500 ml-0.5">*</span>}</label>
        <DocUploadField
          labelKey={field.key + "_label"}
          fileKey={field.key + "_file"}
          labelPlaceholder="Document name"
          values={values}
          onChange={onChange}
        />
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-foreground">
        {field.label}{field.required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <Input
        className="h-9"
        value={values[field.key] || ""}
        onChange={e => onChange(field.key, e.target.value)}
        placeholder={field.label}
      />
    </div>
  );
}

function DocUploadField({ labelKey, fileKey, labelPlaceholder, values, onChange }) {
  const file = values[fileKey];
  return (
    <div className="border rounded-lg p-3 space-y-2 bg-muted/20">
      <Input
        className="h-8 text-xs"
        placeholder={labelPlaceholder}
        value={values[labelKey] || ""}
        onChange={e => onChange(labelKey, e.target.value)}
      />
      <label className="flex items-center gap-2 cursor-pointer">
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${file ? 'bg-green-50 border-green-300 text-green-700' : 'bg-white hover:bg-muted/50 border-input text-muted-foreground'}`}>
          {file ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />}
          {file ? file.name : "Upload PDF"}
        </div>
        <input
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={e => onChange(fileKey, e.target.files?.[0] || null)}
        />
      </label>
    </div>
  );
}