import { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { Folder, FolderOpen, ChevronRight, ChevronDown, FileText, GripVertical, Pencil, Trash2, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

export default function FolderTreeView({ folders, documents, onFoldersChanged, onlyRootIds }) {
  const [draggingId, setDraggingId] = useState(null);
  const [draggingDocId, setDraggingDocId] = useState(null);
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
    const childDocs = documents.filter(d => d.folder_id === folder.id);
    setDeleteConfirm({ folder, childFolders, childDocs });
  };

  const handleDeleteConfirm = async () => {
    const { folder, childFolders, childDocs } = deleteConfirm;
    // Move child docs to parent folder
    await Promise.all(childDocs.map(d =>
      base44.entities.Document.update(d.id, { folder_id: folder.parent_folder_id || null })
    ));
    // Move child folders to parent
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
    const draggedDocId = e.dataTransfer.getData('docId');
    if (draggedFolderId) {
      const dragged = folders.find(f => f.id === draggedFolderId);
      if (!dragged || !dragged.parent_folder_id) return;
      await base44.entities.Folder.update(draggedFolderId, { parent_folder_id: null, path: `/${dragged.name}` });
      toast.success(`Moved "${dragged.name}" to root`);
      onFoldersChanged?.();
    } else if (draggedDocId) {
      await handleDocDrop(draggedDocId, null);
    }
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
          onDocDrop={handleDocDrop}
          draggingId={draggingId}
          setDraggingId={setDraggingId}
          draggingDocId={draggingDocId}
          setDraggingDocId={setDraggingDocId}
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