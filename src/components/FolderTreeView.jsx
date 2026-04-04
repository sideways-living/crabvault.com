import { useState } from "react";
import { Link } from "react-router-dom";
import { Folder, FolderOpen, ChevronRight, ChevronDown, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

function FolderNode({ folder, allFolders, documents, depth = 0 }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const children = allFolders.filter(f => f.parent_folder_id === folder.id);
  const folderDocs = documents.filter(d => d.folder_id === folder.id);
  const hasChildren = children.length > 0 || folderDocs.length > 0;

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-2 py-1.5 px-2 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors group",
        )}
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
        onClick={() => setExpanded(!expanded)}
      >
        {hasChildren ? (
          expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <span className="w-3.5" />
        )}
        {expanded ? (
          <FolderOpen className="h-4 w-4 text-primary" />
        ) : (
          <Folder className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
        )}
        <span className="text-sm font-medium truncate">{folder.name}</span>
        <span className="text-[10px] text-muted-foreground ml-auto">
          {folderDocs.length}
        </span>
      </div>

      {expanded && (
        <div>
          {children.map(child => (
            <FolderNode key={child.id} folder={child} allFolders={allFolders} documents={documents} depth={depth + 1} />
          ))}
          {folderDocs.map(doc => (
            <Link
              key={doc.id}
              to={`/documents/${doc.id}`}
              className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-muted/50 transition-colors text-sm"
              style={{ paddingLeft: `${(depth + 1) * 20 + 8}px` }}
            >
              <span className="w-3.5" />
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="truncate text-muted-foreground">{doc.title}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FolderTreeView({ folders, documents }) {
  const rootFolders = folders.filter(f => !f.parent_folder_id);

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
        <FolderNode key={folder.id} folder={folder} allFolders={folders} documents={documents} />
      ))}
    </div>
  );
}