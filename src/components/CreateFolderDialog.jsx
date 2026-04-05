import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FolderPlus, Loader2, Plus } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

export default function CreateFolderDialog({ open, onOpenChange, folders, categories, onCreated }) {
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [localCategories, setLocalCategories] = useState(categories);

  const sortedCategories = [...localCategories].sort((a, b) => a.name.localeCompare(b.name));

  const handleAddNewCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      const newCat = await base44.entities.Category.create({ name: newCategoryName.trim() });
      setLocalCategories([...localCategories, newCat]);
      setNewCategoryName("");
      setAddingCategory(false);
      setCategoryId(newCat.id);
    } catch (err) {
      console.error('Failed to create category:', err);
    }
  };

  const buildPath = (parentFolderId, folderName) => {
    if (!parentFolderId) return `/${folderName}`;
    const parent = folders.find(f => f.id === parentFolderId);
    return `${parent?.path || ''}/${folderName}`;
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);

    const folderNames = name.trim().split('/').filter(f => f.trim());
    let currentParentId = parentId || undefined;
    let lastFolderName = '';

    for (const folderName of folderNames) {
      lastFolderName = folderName.trim();
      const path = buildPath(currentParentId, lastFolderName);
      const newFolder = await base44.entities.Folder.create({
        name: lastFolderName,
        parent_folder_id: currentParentId,
        path: path,
        category_id: categoryId || undefined,
        description: folderNames.length === 1 ? (description || undefined) : undefined,
      });
      currentParentId = newFolder.id;
    }

    toast.success(`Folder${folderNames.length > 1 ? 's' : ''} "${name}" created`);
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
            <Input className="mt-1.5" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Projects/3D Printing" />
             <p className="text-xs text-muted-foreground mt-1">Use / to create nested folders</p>
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
            {!addingCategory ? (
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select category..." /></SelectTrigger>
                <SelectContent>
                  {sortedCategories.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                  <div className="border-t mt-2">
                    <button
                      onClick={() => setAddingCategory(true)}
                      className="w-full flex items-center gap-2 px-2 py-2 text-sm text-left hover:bg-accent rounded"
                    >
                      <Plus className="h-3 w-3" /> Add Category
                    </button>
                  </div>
                </SelectContent>
              </Select>
            ) : (
              <div className="mt-1.5 flex gap-2">
                <Input
                  autoFocus
                  value={newCategoryName}
                  onChange={e => setNewCategoryName(e.target.value)}
                  placeholder="Category name"
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleAddNewCategory();
                    if (e.key === 'Escape') setAddingCategory(false);
                  }}
                />
                <Button size="sm" onClick={handleAddNewCategory} disabled={!newCategoryName.trim()}>
                  Add
                </Button>
                <Button size="sm" variant="outline" onClick={() => setAddingCategory(false)}>
                  Cancel
                </Button>
              </div>
            )}
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