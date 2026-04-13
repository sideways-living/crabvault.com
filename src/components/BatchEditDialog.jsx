import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save } from "lucide-react";
import FolderSelect from "./FolderSelect";
import { toast } from "sonner";

const NONE = "__none__";
const REMOVE = "__remove__";

export default function BatchEditDialog({ open, onOpenChange, selectedIds, folders, categories, onDone }) {
  const [folderId, setFolderId] = useState(NONE);
  const [categoryId, setCategoryId] = useState(NONE);
  const [status, setStatus] = useState(NONE);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const updates = {};
    if (folderId !== NONE) updates.folder_id = folderId === REMOVE ? undefined : folderId;
    if (categoryId !== NONE) updates.category_id = categoryId === REMOVE ? undefined : categoryId;
    if (status !== NONE) updates.processing_status = status;
    if (Object.keys(updates).length === 0) { toast.error("No changes selected"); return; }

    setSaving(true);
    await Promise.all(selectedIds.map(id => base44.entities.Document.update(id, updates)));
    setSaving(false);
    toast.success(`Updated ${selectedIds.length} document(s)`);
    setFolderId(NONE); setCategoryId(NONE); setStatus(NONE);
    onDone();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Batch Edit — {selectedIds.length} document(s)</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">Only fields you change will be updated. Leave others as "— no change —".</p>

        <div className="space-y-4 mt-2">
          <div>
            <Label className="text-xs">Folder</Label>
            <FolderSelect
              value={folderId}
              onValueChange={setFolderId}
              folders={folders}
              className="mt-1"
              extraItems={[
                { value: "__none__", label: "— no change —" },
                { value: "__remove__", label: "— remove folder —" },
              ]}
            />
          </div>

          <div>
            <Label className="text-xs">Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>— no change —</SelectItem>
                <SelectItem value={REMOVE}>— remove category —</SelectItem>
                {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>— no change —</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="needs_review">Needs Review</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Apply Changes
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}