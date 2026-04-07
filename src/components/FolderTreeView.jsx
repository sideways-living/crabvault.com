import { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { Folder, FolderOpen, ChevronRight, ChevronDown, GripVertical, Pencil, Trash2, Check, X, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

function FolderNode({ folder, allFolders, documents, depth, onDrop, draggingId, setDraggingId, onRename, onDelete }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const [dragOver, setDragOver] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState(folder.name);
  const children = allFolders.filter(f => f.parent_folder_id === folder.id).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  const folderDocs = documents.filter(d => d.folder_id === folder.id);
  const hasChildren = children.length > 0 || folderDocs.length > 0;

  const isDescendant = (potentialChildId, targetId) => {
    const ch = allFolders.filter(f => f.parent_folder_id === targetId);
    return ch.some(c => c.id === potentialChildId || isDescendant(potentialChildId, c.id));
  };

  const handleDragStart = (e) => {
    e.stopPropagation();
    setDraggingId(folder.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('folderId', folder.id);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const canDrop = draggingId && draggingId !== folder.id && !isDescendant(folder.id, draggingId);
    if (canDrop) { setDragOver(true); e.dataTransfer.dropEffect = 'move'; }
  };

  const handleDragLeave = (e) => { e.stopPropagation(); setDragOver(false); };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const draggedFolderId = e.dataTransfer.getData('folderId');
    if (draggedFolderId && draggedFolderId !== folder.id && !isDescendant(folder.id, draggedFolderId)) {
      onDrop(draggedFolderId, folder.id);
      setExpanded(true);
    }
  };

  return (
    <div>
      <div
        draggable={!renaming}
        onDragStart={handleDragStart}
        onDragEnd={() => setDraggingId(null)}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          'flex items-center gap-2 py-1.5 px-2 rounded-lg cursor-pointer transition-all duration-150 group select-none',
          dragOver ? 'bg-primary/10 ring-1 ring-primary/40' : 'hover:bg-muted/50',
          draggingId === folder.id && 'opacity-40'
        )}
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
        onClick={() => !renaming && setExpanded(!expanded)}
      >
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-muted-foreground cursor-grab shrink-0" />
        {hasChildren
          ? (expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />)
          : <span className="w-3.5 shrink-0" />}
        {expanded
          ? <FolderOpen className="h-4 w-4 text-primary shrink-0" />
          : <Folder className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />}
        {renaming ? (
          <input
            autoFocus
            className="text-sm font-medium flex-1 border rounded px-1 py-0 h-6 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            value={renameVal}
            onChange={e => setRenameVal(e.target.value)}
            onClick={e => e.stopPropagation()}
            onKeyDown={e => {
              if (e.key === 'Enter') { onRename(folder, renameVal); setRenaming(false); }
              if (e.key === 'Escape') { setRenameVal(folder.name); setRenaming(false); }
            }}
          />
        ) : (
          <span className="text-sm font-medium truncate flex-1">{folder.name}</span>
        )}
        <span className="text-[10px] text-muted-foreground">{folderDocs.length > 0 ? folderDocs.length : (children.length > 0 ? '' : '')}</span>
        {renaming ? (
          <>
            <button onClick={e => { e.stopPropagation(); onRename(folder, renameVal); setRenaming(false); }} className="text-emerald-600 hover:text-emerald-700 p-0.5"><Check className="h-3.5 w-3.5" /></button>
            <button onClick={e => { e.stopPropagation(); setRenameVal(folder.name); setRenaming(false); }} className="text-muted-foreground hover:text-foreground p-0.5"><X className="h-3.5 w-3.5" /></button>
          </>
        ) : (
          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
            <button onClick={() => { setRenameVal(folder.name); setRenaming(true); }} className="text-muted-foreground hover:text-foreground p-0.5 rounded"><Pencil className="h-3 w-3" /></button>
            <button onClick={() => onDelete(folder)} className="text-muted-foreground hover:text-destructive p-0.5 rounded"><Trash2 className="h-3 w-3" /></button>
          </div>
        )}
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
              onRename={onRename}
              onDelete={onDelete}
            />
          ))}
          {folderDocs.map(doc => (
            <div
              key={doc.id}
              className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-muted/50 transition-colors text-sm"
              style={{ paddingLeft: `${(depth + 1) * 20 + 8}px` }}
            >
              <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <a href={`/documents/${doc.id}`} className="truncate text-muted-foreground hover:text-foreground flex-1">{doc.title}</a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FolderTreeView({ folders, documents = [], onFoldersChanged, onlyRootIds }) {
  const [draggingId, setDraggingId] = useState(null);
  const [rootDragOver, setRootDragOver] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null); // folder to delete

  const handleDrop = async (draggedId, newParentId) => {
    const dragged = folders.find(f => f.id === draggedId);
    if (!dragged) return;
    const newParent = folders.find(f => f.id === newParentId);
    const newPath = `${newParent?.path || ''}/${dragged.name}`;
    await base44.entities.Folder.update(draggedId, { parent_folder_id: newParentId, path: newPath });
    toast.success(`Moved "${dragged.name}" into "${newParent?.name}"`);
    onFoldersChanged?.();
  };

  const handleDocDrop = async (docId, newFolderId) => {
    await base44.entities.Document.update(docId, { folder_id: newFolderId || null });
    const folder = folders.find(f => f.id === newFolderId);
    toast.success(folder ? `Moved to "${folder.name}"` : 'Moved to root');
    onFoldersChanged?.();
  };

  const handleRename = async (folder, newName) => {
    if (!newName.trim() || newName === folder.name) return;
    const newPath = folder.path ? folder.path.replace(/[^/]+$/, newName.trim()) : `/${newName.trim()}`;
    await base44.entities.Folder.update(folder.id, { name: newName.trim(), path: newPath });
    toast.success(`Renamed to "${newName.trim()}"`);
    onFoldersChanged?.();
  };

  const handleDeleteRequest = (folder) => {
    const childFolders = folders.filter(f => f.parent_folder_id === folder.id);
    setDeleteConfirm({ folder, childFolders, childDocs: [] });
  };

  const handleDeleteConfirm = async () => {
    const { folder, childFolders } = deleteConfirm;
    await Promise.all(childFolders.map(f =>
      base44.entities.Folder.update(f.id, { parent_folder_id: folder.parent_folder_id || null })
    ));
    await base44.entities.Folder.delete(folder.id);
    toast.success(`Deleted "${folder.name}"`);
    setDeleteConfirm(null);
    onFoldersChanged?.();
  };

  const handleRootDrop = async (e) => {
    e.preventDefault();
    setRootDragOver(false);
    const draggedFolderId = e.dataTransfer.getData('folderId');
    if (draggedFolderId) {
      const dragged = folders.find(f => f.id === draggedFolderId);
      if (!dragged || !dragged.parent_folder_id) return;
      await base44.entities.Folder.update(draggedFolderId, { parent_folder_id: null, path: `/${dragged.name}` });
      toast.success(`Moved "${dragged.name}" to root`);
      onFoldersChanged?.();
    }
  };

  const allRootFolders = folders.filter(f => !f.parent_folder_id).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  const rootFolders = onlyRootIds ? allRootFolders.filter(f => onlyRootIds.has(f.id)) : allRootFolders;

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
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-card border rounded-xl p-6 max-w-sm w-full mx-4 shadow-xl space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-base">Delete "{deleteConfirm.folder.name}"?</h3>
            {(deleteConfirm.childDocs.length > 0 || deleteConfirm.childFolders.length > 0) && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                <p className="font-medium mb-1">⚠️ This folder has contents:</p>
                {deleteConfirm.childDocs.length > 0 && <p>• {deleteConfirm.childDocs.length} file(s) will be moved to the parent folder</p>}
                {deleteConfirm.childFolders.length > 0 && <p>• {deleteConfirm.childFolders.length} sub-folder(s) will be moved to the parent folder</p>}
                <p className="mt-1 text-xs text-amber-700">No files will be deleted.</p>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={handleDeleteConfirm} className="flex-1 bg-destructive text-destructive-foreground rounded-md py-2 text-sm font-medium hover:bg-destructive/90">Delete Folder</button>
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 border rounded-md py-2 text-sm font-medium hover:bg-muted">Cancel</button>
            </div>
          </div>
        </div>
      )}
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
          onRename={handleRename}
          onDelete={handleDeleteRequest}
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
        {rootDragOver ? "Drop here to move to root" : "Drag folders or files to reorganize"}
      </div>
    </div>
  );
}