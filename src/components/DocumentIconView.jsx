import { useState } from "react";
import { ChevronLeft, Folder, Grid3x3 } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function DocumentIconView({ documents, folders, categories }) {
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [breadcrumb, setBreadcrumb] = useState([]);

  const currentFolder = currentFolderId ? folders.find(f => f.id === currentFolderId) : null;
  const childFolders = currentFolderId
    ? folders.filter(f => f.parent_folder_id === currentFolderId)
    : folders.filter(f => !f.parent_folder_id);
  const folderDocs = documents.filter(d => d.folder_id === currentFolderId);

  const openFolder = (folderId, folderName) => {
    setBreadcrumb(prev => [...prev, { id: folderId, name: folderName }]);
    setCurrentFolderId(folderId);
  };

  const goBack = () => {
    if (breadcrumb.length > 0) {
      const newBreadcrumb = breadcrumb.slice(0, -1);
      setBreadcrumb(newBreadcrumb);
      setCurrentFolderId(newBreadcrumb.length > 0 ? newBreadcrumb[newBreadcrumb.length - 1].id : null);
    }
  };

  const goToRoot = () => {
    setBreadcrumb([]);
    setCurrentFolderId(null);
  };

  return (
    <div className="bg-card border rounded-xl p-6 space-y-4">
      {/* Breadcrumb */}
      {breadcrumb.length > 0 && (
        <div className="flex items-center gap-3 pb-4 border-b">
          <Button onClick={goBack} variant="outline" size="sm" className="gap-1">
            <ChevronLeft className="h-4 w-4" /> Back
          </Button>
          <button onClick={goToRoot} className="text-sm text-primary hover:underline">Root</button>
          {breadcrumb.map((item, i) => (
            <div key={item.id} className="flex items-center gap-2">
              <span className="text-muted-foreground">/</span>
              <span className="text-sm font-medium">{item.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Grid of folders and documents */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {/* Folders */}
        {childFolders.map(folder => (
          <button
            key={folder.id}
            onClick={() => openFolder(folder.id, folder.name)}
            className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-muted transition-colors group"
          >
            <div className="h-16 w-16 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
              <Folder className="h-8 w-8 text-primary" />
            </div>
            <span className="text-xs font-medium text-center truncate max-w-[80px]">{folder.name}</span>
          </button>
        ))}

        {/* Documents */}
        {folderDocs.map(doc => (
          <Link
            key={doc.id}
            to={`/documents/${doc.id}`}
            className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-muted transition-colors group"
          >
            {doc.preview_url ? (
              <img
                src={doc.preview_url}
                alt={doc.title}
                className="h-16 w-16 rounded-lg object-cover border group-hover:border-primary transition-colors"
              />
            ) : (
              <div className="h-16 w-16 rounded-lg bg-muted/50 flex items-center justify-center">
                <Grid3x3 className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
            <span className="text-xs font-medium text-center line-clamp-2 max-w-[80px]">{doc.title}</span>
          </Link>
        ))}
      </div>

      {childFolders.length === 0 && folderDocs.length === 0 && (
        <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
          Empty folder
        </div>
      )}
    </div>
  );
}