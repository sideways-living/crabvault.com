import { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { Folder, FolderOpen, ChevronRight, ChevronDown, FileText, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

function FolderNode({ folder, allFolders, documents, depth, onDrop, draggingId, setDraggingId }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const [dragOver, setDragOver] = useState(false);
  const children = allFolders.filter(f => f.parent_folder_id === folder.id);
  const folderDocs = documents.filter(d => d.folder_id === folder.id);
  const hasChildren = children.length > 0 || folderDocs.length > 0;

  // Prevent dropping a folder onto its own descendant
  const isDescendant = (potentialChildId, targetId) => {
    const children = allFolders.filter(f => f.parent_folder_id === targetId);
    return children.some(c => c.id === potentialChildId || isDescendant(potentialChildId, c.id));
  };

  const handleDragStart = (e) => {
    e.stopPropagation();
    setDraggingId(folder.id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("folderId", folder.id);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggingId && draggingId !== folder.id && !isDescendant(folder.id, draggingId)) {
      setDragOver(true);
      e.dataTransfer.dropEffect = "move";
    }
  };

  const handleDragLeave = (e) => {
    e.stopPropagation();
    setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const draggedId = e.dataTransfer.getData("folderId");
    if (draggedId && draggedId !== folder.id && !isDescendant(folder.id, draggedId)) {
      onDrop(draggedId, folder.id);
      setExpanded(true);
    }
  };

  return (
    <div>
      <div
        draggable
        onDragStart={handleDragStart}
        onDragEnd={() => setDraggingId(null)}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "flex items-center gap-2 py-1.5 px-2 rounded-lg cursor-pointer transition-all duration-150 group select-none",
          dragOver ? "bg-primary/10 ring-1 ring-primary/40" : "hover:bg-muted/50",
          draggingId === folder.id && "opacity-40"
        )}
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
        onClick={() => setExpanded(!expanded)}
      >
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-muted-foreground cursor-grab shrink-0" />
        {hasChildren ? (
          expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        {expanded ? (
          <FolderOpen className="h-4 w-4 text-primary shrink-0" />
        ) : (
          <Folder className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
        )}
        <span className="text-sm font-medium truncate flex-1">{folder.name}</span>
        <span className="text-[10px] text-muted-foreground">{folderDocs.length}</span>
      </div>

      {expanded && (
        <div>
          {children.map(child => (
            <FolderNode
              key={child.id}
              folder={child}
              allFolders={allFolders}
              documents={documents}
              depth={depth + 1}
              onDrop={onDrop}
              draggingId={draggingId}
              setDraggingId={setDraggingId}
            />
          ))}
          {folderDocs.map(doc => (
            <Link
              key={doc.id}
              to={`/documents/${doc.id}`}
              className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-muted/50 transition-colors text-sm"
              style={{ paddingLeft: `${(depth + 1) * 20 + 8}px` }}
            >
              <span className="w-3.5" />
              <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="truncate text-muted-foreground">{doc.title}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FolderTreeView({ folders, documents, onFoldersChanged }) {
  const [draggingId, setDraggingId] = useState(null);
  const [rootDragOver, setRootDragOver] = useState(false);
  const rootFolders = folders.filter(f => !f.parent_folder_id);

  const handleDrop = async (draggedId, newParentId) => {
    const dragged = folders.find(f => f.id === draggedId);
    if (!dragged) return;
    const newParent = folders.find(f => f.id === newParentId);
    const newPath = `${newParent?.path || ""}/${dragged.name}`;
    await base44.entities.Folder.update(draggedId, {
      parent_folder_id: newParentId,
      path: newPath,
    });
    toast.success(`Moved "${dragged.name}" into "${newParent?.name}"`);
    onFoldersChanged?.();
  };

  const handleRootDrop = async (e) => {
    e.preventDefault();
    setRootDragOver(false);
    const draggedId = e.dataTransfer.getData("folderId");
    if (!draggedId) return;
    const dragged = folders.find(f => f.id === draggedId);
    if (!dragged || !dragged.parent_folder_id) return;
    await base44.entities.Folder.update(draggedId, {
      parent_folder_id: null,
      path: `/${dragged.name}`,
    });
    toast.success(`Moved "${dragged.name}" to root`);
    onFoldersChanged?.();
  };

  if (folders.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Folder className="h-8 w-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">No folders yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {rootFolders.map(folder => (
        <FolderNode
          key={folder.id}
          folder={folder}
          allFolders={folders}
          documents={documents}
          depth={0}
          onDrop={handleDrop}
          draggingId={draggingId}
          setDraggingId={setDraggingId}
        />
      ))}

      {/* Root drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setRootDragOver(true); }}
        onDragLeave={() => setRootDragOver(false)}
        onDrop={handleRootDrop}
        className={cn(
          "mt-2 rounded-lg border-2 border-dashed py-3 text-center text-xs text-muted-foreground/50 transition-all",
          rootDragOver ? "border-primary/50 bg-primary/5 text-primary" : "border-transparent"
        )}
      >
        {rootDragOver ? "Drop here to move to root" : "Drag folders to reorganize"}
      </div>
    </div>
  );
}