import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Plus, Upload, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import StatsCards from "../components/StatsCards";
import DocumentCard from "../components/DocumentCard";
import UploadDialog from "../components/UploadDialog";

export default function Dashboard() {
  const [documents, setDocuments] = useState([]);
  const [folders, setFolders] = useState([]);
  const [categories, setCategories] = useState([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    const [docs, flds, cats] = await Promise.all([
      base44.entities.Document.list("-created_date", 50),
      base44.entities.Folder.list(),
      base44.entities.Category.list(),
    ]);
    setDocuments(docs);
    setFolders(flds);
    setCategories(cats);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const recentDocs = documents.slice(0, 6);
  const pendingDocs = documents.filter(d => d.processing_status === "pending" || d.processing_status === "processing");

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Your document management overview</p>
        </div>
        <Button onClick={() => setUploadOpen(true)} className="gap-2">
          <Upload className="h-4 w-4" /> Upload Documents
        </Button>
      </div>

      <StatsCards documents={documents} folders={folders} />

      {/* Pending Processing */}
      {pendingDocs.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <h3 className="font-medium text-amber-900 text-sm">
            {pendingDocs.length} document{pendingDocs.length > 1 ? 's' : ''} awaiting processing
          </h3>
          <p className="text-xs text-amber-700 mt-1">
            Open each document and click "AI Process" to summarize and categorize.
          </p>
        </div>
      )}

      {/* Recent Documents */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-lg">Recent Documents</h2>
          <Link to="/documents" className="text-xs text-primary hover:underline flex items-center gap-1">
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        {recentDocs.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recentDocs.map(doc => (
              <DocumentCard key={doc.id} document={doc} categories={categories} />
            ))}
          </div>
        ) : (
          <div className="bg-card rounded-xl border p-12 text-center">
            <p className="text-muted-foreground text-sm">No documents yet. Upload your first document to get started.</p>
            <Button variant="outline" className="mt-4" onClick={() => setUploadOpen(true)}>
              <Upload className="h-4 w-4 mr-2" /> Upload
            </Button>
          </div>
        )}
      </div>

      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} folders={folders} categories={categories} onUploaded={loadData} />
    </div>
  );
}