import { useState } from "react";
import { ChevronRight, ChevronDown, Folder, FileText } from "lucide-react";
import { Link } from "react-router-dom";
import moment from "moment";

export default function DocumentTreeView({ documents, folders, categories }) {
  const [expandedFolders, setExpandedFolders] = useState({});

  const toggleFolder = (folderId) => {
    setExpandedFolders(prev => ({
      ...prev,
      [folderId]: !prev[folderId]
    }));
  };

  const getFolderTree = () => {
    const tree = {};
    const folderMap = {};
    folders.forEach(f => folderMap[f.id] = f);

    folders.forEach(f => {
      if (!f.parent_folder_id) {
        tree[f.id] = { folder: f, children: [] };
      }
    });

    folders.forEach(f => {
      if (f.parent_folder_id && folderMap[f.parent_folder_id]) {
        if (!tree[f.parent_folder_id]) {
          tree[f.parent_folder_id] = { folder: folderMap[f.parent_folder_id], children: [] };
        }
        tree[f.parent_folder_id].children.push(f);
      }
    });

    return tree;
  };

  const folderTree = getFolderTree();
  const category = categories.find(c => c.id);

  const renderFolderNode = (folderId, level = 0) => {
    const node = folderTree[folderId];
    if (!node) return null;

    const folder = node.folder;
    const isExpanded = expandedFolders[folderId];
    const folderDocs = documents.filter(d => d.folder_id === folderId);
    const hasChildren = node.children.length > 0 || folderDocs.length > 0;

    return (
      <div key={folderId} className="select-none">
        <button
          onClick={() => toggleFolder(folderId)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted text-sm transition-colors text-left"
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="h-4 w-4 shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0" />
            )
          ) : (
            <div className="h-4 w-4 shrink-0" />
          )}
          <Folder className="h-4 w-4 shrink-0 text-primary/70" />
          <span className="font-medium truncate">{folder.name}</span>
          <span className="ml-auto text-xs text-muted-foreground">{folderDocs.length}</span>
        </button>

        {isExpanded && (
          <div className="ml-4 space-y-1 border-l border-border">
            {folderDocs.map(doc => (
              <Link
                key={doc.id}
                to={`/documents/${doc.id}`}
                className="flex items-center gap-2 px-3 py-2 ml-3 rounded-lg hover:bg-muted text-sm transition-colors"
              >
                {doc.preview_url ? (
                  <img src={doc.preview_url} alt="" className="h-4 w-4 rounded object-cover shrink-0" />
                ) : (
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className="truncate text-foreground/80">{doc.title}</span>
                <span className="ml-auto text-xs text-muted-foreground">{moment(doc.created_date).fromNow()}</span>
              </Link>
            ))}
            {node.children.map(child => renderFolderNode(child.id, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const rootFolders = Object.values(folderTree).filter(n => !folders.find(f => f.id === n.folder.id && f.parent_folder_id));
  const unfoldereddocs = documents.filter(d => !d.folder_id);

  return (
    <div className="bg-card border rounded-xl p-4 space-y-2">
      {rootFolders.map(node => renderFolderNode(node.folder.id))}
      
      {unfoldereddocs.length > 0 && (
        <div className="space-y-1 pt-2 border-t">
          <p className="text-xs font-medium text-muted-foreground px-3 py-2">Uncategorized</p>
          {unfoldereddocs.map(doc => (
            <Link
              key={doc.id}
              to={`/documents/${doc.id}`}
              className="flex items-center gap-2 px-3 py-2 ml-1 rounded-lg hover:bg-muted text-sm transition-colors"
            >
              {doc.preview_url ? (
                <img src={doc.preview_url} alt="" className="h-4 w-4 rounded object-cover shrink-0" />
              ) : (
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <span className="truncate text-foreground/80">{doc.title}</span>
              <span className="ml-auto text-xs text-muted-foreground">{moment(doc.created_date).fromNow()}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}