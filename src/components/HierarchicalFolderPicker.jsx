import { ChevronRight, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";

export default function HierarchicalFolderPicker({ value, onValueChange, folders }) {
  // Organize folders into Documents, Receipts, and Others
  const receiptsRoot = folders.find(f => f.name.toLowerCase() === "receipts" && !f.parent_folder_id);
  const documentRoots = folders.filter(f => !f.parent_folder_id && f.name.toLowerCase() !== "receipts");

  const getSubfolders = (parentId) => {
    return folders.filter(f => f.parent_folder_id === parentId).sort((a, b) => a.name.localeCompare(b.name));
  };

  const FolderOption = ({ folder, level = 0 }) => {
    const isSelected = value === folder.id;
    const subfolders = getSubfolders(folder.id);

    return (
      <div key={folder.id}>
        <button
          onClick={() => onValueChange(folder.id)}
          className={cn(
            "w-full text-left px-3 py-2 rounded-lg transition-colors flex items-center gap-2",
            isSelected
              ? "bg-primary text-primary-foreground font-medium"
              : "hover:bg-muted text-foreground"
          )}
          style={{ paddingLeft: `${12 + level * 16}px` }}
        >
          <FolderOpen className="h-4 w-4 shrink-0" />
          <span className="text-sm truncate">{folder.name}</span>
        </button>
        {subfolders.map(sub => (
          <FolderOption key={sub.id} folder={sub} level={level + 1} />
        ))}
      </div>
    );
  };

  return (
    <div className="border rounded-lg bg-card p-3 space-y-3 max-h-64 overflow-y-auto">
      {receiptsRoot && (
        <div>
          <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide px-3 mb-2">Receipts</p>
          <FolderOption folder={receiptsRoot} />
          {getSubfolders(receiptsRoot.id).map(sub => (
            <FolderOption key={sub.id} folder={sub} level={1} />
          ))}
        </div>
      )}

      {documentRoots.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide px-3 mb-2">Documents</p>
          {documentRoots.map(root => (
            <div key={root.id}>
              <FolderOption folder={root} />
              {getSubfolders(root.id).map(sub => (
                <FolderOption key={sub.id} folder={sub} level={1} />
              ))}
            </div>
          ))}
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
    </div>
  );
}