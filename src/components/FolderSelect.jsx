import { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FolderPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";

const ADD_NEW = "__add_new__";

/**
 * A folder select dropdown with alphabetical sorting and inline "+ Add New Folder".
 * Props:
 *   value         – current folder id (or "" / undefined for none)
 *   onValueChange – called with new folder id
 *   folders       – array of folder objects { id, name, path, parent_folder_id }
 *   placeholder   – optional placeholder text
 *   className     – optional class on trigger
 *   disabled      – optional
 *   extraItems    – optional array of { value, label } to prepend (e.g. "— no change —")
 *   onFolderCreated – optional callback(newFolder) when a folder is added
 */
export default function FolderSelect({
  value,
  onValueChange,
  folders: initialFolders = [],
  placeholder = "Select a folder…",
  className,
  disabled,
  extraItems = [],
  onFolderCreated,
}) {
  const [extraFolders, setExtraFolders] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pathInput, setPathInput] = useState("");
  const [creating, setCreating] = useState(false);

  const allFolders = useMemo(() => {
    const combined = [...initialFolders, ...extraFolders];
    // deduplicate by id
    const seen = new Set();
    const unique = combined.filter(f => { if (seen.has(f.id)) return false; seen.add(f.id); return true; });
    return unique.sort((a, b) => {
      const segsA = (a.path || ('/' + a.name)).split('/').filter(Boolean);
      const segsB = (b.path || ('/' + b.name)).split('/').filter(Boolean);
      const len = Math.max(segsA.length, segsB.length);
      for (let i = 0; i < len; i++) {
        if (segsA[i] === undefined) return -1;
        if (segsB[i] === undefined) return 1;
        const cmp = segsA[i].localeCompare(segsB[i], undefined, { sensitivity: 'base' });
        if (cmp !== 0) return cmp;
      }
      return 0;
    });
  }, [initialFolders, extraFolders]);

  const handleChange = (val) => {
    if (val === ADD_NEW) {
      setDialogOpen(true);
      return;
    }
    onValueChange(val);
  };

  const handleCreate = async () => {
    const raw = pathInput.trim();
    if (!raw) return;
    setCreating(true);

    const segments = raw.split("/").map(s => s.trim()).filter(Boolean);
    let parentId = null;
    let createdFolder = null;

    // Look up existing folders to avoid re-creating
    let currentFolders = [...allFolders];

    for (let i = 0; i < segments.length; i++) {
      const name = segments[i];
      const pathSoFar = "/" + segments.slice(0, i + 1).join("/");
      // Check if this folder already exists
      const existing = currentFolders.find(
        f => (f.path === pathSoFar || f.name === name) && (f.parent_folder_id || null) === parentId
      );
      if (existing) {
        parentId = existing.id;
        createdFolder = existing;
      } else {
        const created = await base44.entities.Folder.create({
          name,
          parent_folder_id: parentId || undefined,
          path: pathSoFar,
        });
        currentFolders.push(created);
        parentId = created.id;
        createdFolder = created;
        setExtraFolders(prev => [...prev, created]);
        onFolderCreated?.(created);
      }
    }

    setCreating(false);
    setDialogOpen(false);
    setPathInput("");
    if (createdFolder) {
      onValueChange(createdFolder.id);
      toast.success(`Folder "${createdFolder.path || createdFolder.name}" ready`);
    }
  };

  return (
    <>
      <Select value={value || ""} onValueChange={handleChange} disabled={disabled}>
        <SelectTrigger className={className}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {extraItems.map(item => (
            <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
          ))}
          {allFolders.map(f => (
            <SelectItem key={f.id} value={f.id}>{f.path || f.name}</SelectItem>
          ))}
          <SelectItem value={ADD_NEW}>
            <span className="flex items-center gap-1.5 text-primary font-medium">
              <FolderPlus className="h-3.5 w-3.5" /> + Add New Folder
            </span>
          </SelectItem>
        </SelectContent>
      </Select>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Type a folder name, or use <code className="bg-muted px-1 rounded">/</code> to create nested folders.
              <br />
              <span className="text-xs">e.g. <span className="font-mono">Finance/Receipts/2024</span></span>
            </p>
            <Input
              autoFocus
              placeholder="e.g. Finance/Receipts/2024"
              value={pathInput}
              onChange={e => setPathInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleCreate(); }}
            />
          </div>
          <div className="flex gap-2 mt-4">
            <Button onClick={handleCreate} disabled={creating || !pathInput.trim()} className="flex-1 gap-2">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderPlus className="h-4 w-4" />}
              {creating ? "Creating…" : "Create"}
            </Button>
            <Button variant="outline" onClick={() => { setDialogOpen(false); setPathInput(""); }}>Cancel</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}