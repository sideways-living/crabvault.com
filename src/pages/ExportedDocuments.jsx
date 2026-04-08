import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Lock, FileText, Calendar, FolderOpen, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import moment from "moment";
import { Badge } from "@/components/ui/badge";

export default function ExportedDocuments() {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Reset badge on view
    localStorage.setItem('exportedLastViewed', new Date().toISOString());
    window.dispatchEvent(new Event('exportedViewed'));

    base44.entities.Document.filter({ synced_to_vault: true, is_deleted: false }, '-updated_date', 200)
      .then(d => { setDocs(d); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Lock className="h-6 w-6 text-emerald-600" />
          Exported to Vault
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{docs.length} document{docs.length !== 1 ? 's' : ''} synced to Cryptomator</p>
      </div>

      {docs.length === 0 ? (
        <div className="bg-card border rounded-xl p-12 text-center text-muted-foreground">
          <Lock className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>No documents have been exported yet.</p>
        </div>
      ) : (
        <div className="bg-card border rounded-xl overflow-hidden">
          <div className="divide-y">
            {docs.map(doc => (
              <Link
                key={doc.id}
                to={`/documents/${doc.id}`}
                className="flex items-center gap-4 px-5 py-3 hover:bg-muted/30 transition-colors"
              >
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{doc.title}</p>
                  {doc.vault_path && (
                    <p className="text-xs text-muted-foreground font-mono truncate mt-0.5">🔒 {doc.vault_path}</p>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
                  {doc.file_type && <Badge variant="outline" className="uppercase text-[10px] font-mono">.{doc.file_type}</Badge>}
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {moment(doc.updated_date).format('D MMM YYYY')}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}