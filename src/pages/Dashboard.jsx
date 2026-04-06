import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Upload, ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import DocumentCard from "../components/DocumentCard";
import UploadDialog from "../components/UploadDialog";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

export default function Dashboard() {
  const [documents, setDocuments] = useState([]);
  const [folders, setFolders] = useState([]);
  const [categories, setCategories] = useState([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [assigningPaths, setAssigningPaths] = useState(false);

  const loadData = async () => {
    try {
      const [docs, flds, cats] = await Promise.all([
        base44.entities.Document.filter({ is_deleted: false }, "-created_date", 200),
      base44.entities.Folder.list(),
      base44.entities.Category.list(),
    ]);
    setDocuments(docs);
    setFolders(flds);
    setCategories(cats);

    // Calculate statistics
    const completedDocs = docs.filter(d => d.processing_status === 'completed');
    const totalSize = docs.reduce((sum, d) => sum + (d.file_size || 0), 0);
    const avgFileSize = docs.length > 0 ? totalSize / docs.length : 0;
    
    // Calculate processing times (updated_date - created_date in minutes)
    const processingTimes = completedDocs.map(d => {
      const created = new Date(d.created_date);
      const updated = new Date(d.updated_date);
      return (updated - created) / (1000 * 60); // minutes
    });
    const avgProcessingTime = processingTimes.length > 0 ? processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length : 0;
    const slowestProcessingTime = processingTimes.length > 0 ? Math.max(...processingTimes) : 0;
    const fastestProcessingTime = processingTimes.length > 0 ? Math.min(...processingTimes) : 0;
    
    // Documents by category (determined by root folder)
    const getRootFolder = (folderId) => {
      let folder = flds.find(f => f.id === folderId);
      while (folder && folder.parent_folder_id) {
        folder = flds.find(f => f.id === folder.parent_folder_id);
      }
      return folder;
    };
    
    const docsByCategory = {};
    docs.forEach(d => {
      let catName = 'Uncategorized';
      if (d.folder_id) {
        const rootFolder = getRootFolder(d.folder_id);
        catName = rootFolder?.name || 'Uncategorized';
      }
      docsByCategory[catName] = (docsByCategory[catName] || 0) + 1;
    });
    const categoryChartData = Object.entries(docsByCategory).map(([name, count]) => ({
      name,
      value: count
    })).sort((a, b) => b.value - a.value);
    
      setStats({
        totalDocuments: docs.length,
        totalSize,
        avgFileSize: Math.round(avgFileSize),
        avgProcessingTime: Math.round(avgProcessingTime),
        slowestProcessingTime: Math.round(slowestProcessingTime),
        fastestProcessingTime: Math.round(fastestProcessingTime),
        completedCount: completedDocs.length,
        categoryChartData
      });
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAssignVaultPaths = async () => {
    setAssigningPaths(true);
    try {
      const result = await base44.functions.invoke('assignVaultPaths', {});
      toast.success(`Updated ${result.updated} document(s) with vault paths`);
      loadData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setAssigningPaths(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const recentDocs = documents.filter(d => d.processing_status === 'completed').slice(0, 6);
  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

  if (loading || !stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const formatBytes = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Your document management overview</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setUploadOpen(true)} className="gap-2">
            <Upload className="h-4 w-4" /> Upload Documents
          </Button>
          <Button onClick={handleAssignVaultPaths} disabled={assigningPaths} variant="outline" className="gap-2">
            {assigningPaths ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            Assign Vault Paths
          </Button>
        </div>
      </div>

      {/* Statistics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card rounded-xl border p-6">
          <div className="text-sm text-muted-foreground mb-2">Total Documents</div>
          <div className="text-3xl font-semibold">{stats.totalDocuments}</div>
          <div className="text-xs text-muted-foreground mt-2">{stats.completedCount} processed</div>
        </div>
        <div className="bg-card rounded-xl border p-6">
          <div className="text-sm text-muted-foreground mb-2">Total Space Used</div>
          <div className="text-3xl font-semibold">{formatBytes(stats.totalSize)}</div>
          <div className="text-xs text-muted-foreground mt-2">Avg: {formatBytes(stats.avgFileSize)}</div>
        </div>
        <div className="bg-card rounded-xl border p-6">
          <div className="text-sm text-muted-foreground mb-2">Avg Processing Time</div>
          <div className="text-3xl font-semibold">{stats.avgProcessingTime}m</div>
          <div className="text-xs text-muted-foreground mt-2">Per document</div>
        </div>
        <div className="bg-card rounded-xl border p-6">
          <div className="text-sm text-muted-foreground mb-2">Processing Speed</div>
          <div className="text-3xl font-semibold">{stats.fastestProcessingTime}m</div>
          <div className="text-xs text-muted-foreground mt-2">Fastest | {stats.slowestProcessingTime}m Slowest</div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Distribution */}
        <div className="bg-card rounded-xl border p-6">
          <h3 className="font-semibold mb-4">Documents by Category</h3>
          {stats.categoryChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={stats.categoryChartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name} (${value})`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {stats.categoryChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => `${value} docs`} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No categorized documents yet</p>
          )}
        </div>

        {/* Storage Breakdown */}
        <div className="bg-card rounded-xl border p-6">
          <h3 className="font-semibold mb-4">Storage Information</h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-muted-foreground">Total Space Used</span>
                <span className="font-semibold">{formatBytes(stats.totalSize)}</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div className="bg-primary h-2 rounded-full" style={{width: '100%'}} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-6 pt-4 border-t">
              <div>
                <div className="text-xs text-muted-foreground">Average File Size</div>
                <div className="text-lg font-semibold mt-1">{formatBytes(stats.avgFileSize)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Largest File</div>
                <div className="text-lg font-semibold mt-1">{Math.max(...documents.map(d => d.file_size || 0)) > 0 ? formatBytes(Math.max(...documents.map(d => d.file_size || 0))) : '—'}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

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