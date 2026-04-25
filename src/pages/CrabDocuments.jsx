import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileText } from "lucide-react";

export default function CrabDocuments() {
  const { id } = useParams();
  const [crab, setCrab] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      base44.entities.Crab.filter({ id }, "full_name", 1),
      base44.entities.CrabDocument.filter({ is_deleted: false }, "-created_date", 500),
    ]).then(([crabs, docs]) => {
      if (crabs[0]) setCrab(crabs[0]);
      setDocuments(docs.filter(d => (d.crab_ids || []).includes(id)));
      setLoading(false);
    });
  }, [id]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-4">
        <Link to={`/crabs/${id}`}>
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">Documents</h1>
          {crab && <p className="text-sm text-muted-foreground">{crab.full_name || crab.surname}</p>}
        </div>
      </div>

      {documents.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No documents linked to this profile</p>
        </div>
      ) : (
        <div className="bg-card border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Title</th>
                <th className="text-left px-4 py-3 font-medium">Category</th>
                <th className="text-left px-4 py-3 font-medium">Date</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {documents.map(doc => (
                <tr key={doc.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <Link to={`/crab-documents/${doc.id}`} className="font-medium hover:text-primary truncate block max-w-xs">
                      {doc.title}
                    </Link>
                    {doc.original_filename && <p className="text-xs text-muted-foreground font-mono truncate max-w-xs">{doc.original_filename}</p>}
                  </td>
                  <td className="px-4 py-3">
                    {doc.category && <span className="text-xs uppercase">{doc.category}</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{doc.document_date || "—"}</td>
                  <td className="px-4 py-3 text-xs capitalize">{doc.processing_status?.replace("_", " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}