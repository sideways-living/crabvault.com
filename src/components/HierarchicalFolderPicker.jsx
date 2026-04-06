import { useState } from "react";
import { ChevronRight, FolderOpen, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

export default function HierarchicalFolderPicker({ value, onValueChange, folders, onFolderCreated, onDone }) {
  const [expanded, setExpanded] = useState(new Set());
  const [newFolderParentId, setNewFolderParentId] = useState(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [creating, setCreating] = useState(false);

  const toggleExpand = (folderId) => {
    const next = new Set(expanded);
    next.has(folderId) ? next.delete(folderId) : next.add(folderId);
    setExpanded(next);
  };

  const handleCreateFolder = async (parentId) => {
    if (!newFolderName.trim()) return;
    setCreating(true);
    try {
      const parentFolder = folders.find(f => f.id === parentId);
      const path = parentFolder ? `${parentFolder.path}/${newFolderName}` : `/${newFolderName}`;
      await base44.entities.Folder.create({
        name: newFolderName,
        parent_folder_id: parentId || undefined,
        path,
      });
      setNewFolderName("");
      setNewFolderParentId(null);
      toast.success(`Folder "${newFolderName}" created`);
      if (onFolderCreated) onFolderCreated();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  };
  const getSubfolders = (parentId) => {
    return folders.filter(f => f.parent_folder_id === parentId).sort((a, b) => a.name.localeCompare(b.name));
  };

  const FolderOption = ({ folder, level = 0 }) => {
    const isSelected = value === folder.id;
    const subfolders = getSubfolders(folder.id);
    const isExpanded = expanded.has(folder.id);
    const isCreatingHere = newFolderParentId === folder.id;

    return (
      <div key={folder.id}>
        <div className="flex items-center gap-1">
          {subfolders.length > 0 && (
            <button
              onClick={() => toggleExpand(folder.id)}
              className="p-1 hover:bg-muted rounded transition-colors"
            >
              <ChevronRight className={cn("h-4 w-4 transition-transform", isExpanded && "rotate-90")} />
            </button>
          )}
          {subfolders.length === 0 && <div className="w-6" />}
          <button
            onClick={() => onValueChange(folder.id)}
            className={cn(
              "flex-1 text-left px-2 py-2 rounded-lg transition-colors flex items-center gap-2",
              isSelected
                ? "bg-primary text-primary-foreground font-medium"
                : "hover:bg-muted text-foreground"
            )}
          >
            <FolderOpen className="h-4 w-4 shrink-0" />
            <span className="text-sm truncate">{folder.name}</span>
          </button>
          <button
            onClick={() => setNewFolderParentId(folder.id)}
            className="p-1 hover:bg-muted rounded transition-colors text-muted-foreground hover:text-foreground"
            title="Add subfolder"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        {isExpanded && subfolders.map(sub => (
          <FolderOption key={sub.id} folder={sub} level={level + 1} />
        ))}
        {isCreatingHere && (
          <div className="flex items-center gap-1 px-3 py-2" style={{ paddingLeft: `${12 + (level + 1) * 16}px` }}>
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") handleCreateFolder(folder.id);
                if (e.key === "Escape") { setNewFolderParentId(null); setNewFolderName(""); }
              }}
              placeholder="Folder name"
              className="h-7 text-sm"
              disabled={creating}
            />
            <Button
              size="sm"
              onClick={() => handleCreateFolder(folder.id)}
              disabled={creating || !newFolderName.trim()}
              className="h-7 px-2 text-xs"
            >
              {creating ? "..." : "Add"}
            </Button>
          </div>
        )}
      </div>
    );
  };

  const receiptsRoot = folders.find(f => f.name.toLowerCase() === "receipts" && !f.parent_folder_id);
  const documentRoots = folders.filter(f => !f.parent_folder_id && f.name.toLowerCase() !== "receipts");

  return (
    <div className="border rounded-lg bg-card p-3 space-y-3 max-h-96 overflow-y-auto">
      {receiptsRoot && (
        <div>
          <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide px-3 mb-2">Receipts</p>
          <FolderOption folder={receiptsRoot} />
        </div>
      )}

      {documentRoots.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide px-3 mb-2">Documents</p>
          {documentRoots.map(root => (
            <FolderOption key={root.id} folder={root} />
          ))}
        </div>
      )}

      <button
        onClick={() => setNewFolderParentId("root")}
        className="w-full text-left px-3 py-2 rounded-lg text-sm text-primary hover:bg-primary/10 transition-colors flex items-center gap-2 font-medium"
      >
        <Plus className="h-4 w-4" />
        New Root Folder
      </button>

      {newFolderParentId === "root" && (
        <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded-lg">
          <Input
            autoFocus
            value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") handleCreateFolder(null);
              if (e.key === "Escape") { setNewFolderParentId(null); setNewFolderName(""); }
            }}
            placeholder="Folder name"
            className="h-8 text-sm"
            disabled={creating}
          />
          <Button
            size="sm"
            onClick={() => handleCreateFolder(null)}
            disabled={creating || !newFolderName.trim()}
            className="h-8 px-2 text-xs"
          >
            {creating ? "..." : "Add"}
          </Button>
        </div>
      )}

      {!value && (
        <button
          onClick={() => onValueChange("")}
          className="w-full text-left px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted transition-colors"
        >
          No folder
        </button>
      )}

      {onDone && (
        <Button onClick={onDone} className="w-full mt-2">Done</Button>
      )}
    </div>
  );
}