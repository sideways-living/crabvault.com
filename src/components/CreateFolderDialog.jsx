import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FolderPlus, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

export default function CreateFolderDialog({ open, onOpenChange, folders, categories, onCreated }) {
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  const buildPath = (parentFolderId, folderName) => {
    if (!parentFolderId) return `/${folderName}`;
    const parent = folders.find(f => f.id === parentFolderId);
    return `${parent?.path || ''}/${folderName}`;
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);

    await base44.entities.Folder.create({
      name: name.trim(),
      parent_folder_id: parentId || undefined,
      path: buildPath(parentId, name.trim()),
      category_id: categoryId || undefined,
      description: description || undefined,
    });

    toast.success(`Folder "${name}" created`);
    setName("");
    setParentId("");
    setCategoryId("");
    setDescription("");
    setCreating(false);
    onOpenChange(false);
    onCreated?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Folder</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs">Folder Name</Label>
            <Input className="mt-1.5" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Tax Returns 2024" />
          </div>

          <div>
            <Label className="text-xs">Parent Folder (optional)</Label>
            <Select value={parentId} onValueChange={setParentId}>
              <SelectTrigger className="mt-1.5"><SelectValue placeholder="Root level" /></SelectTrigger>
              <SelectContent>
                {folders?.map(f => (
                  <SelectItem key={f.id} value={f.id}>{f.path || f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Category (optional)</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select category..." /></SelectTrigger>
              <SelectContent>
                {categories?.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Description (optional)</Label>
            <Textarea className="mt-1.5" value={description} onChange={e => setDescription(e.target.value)} placeholder="What goes in this folder?" rows={2} />
          </div>

          <Button onClick={handleCreate} disabled={!name.trim() || creating} className="w-full">
            {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FolderPlus className="h-4 w-4 mr-2" />}
            Create Folder
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}