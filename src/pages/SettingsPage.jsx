import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import SaveButton from "../components/SaveButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Shield, FolderSync, HardDrive, Loader2, Plus, Trash2, Play, CheckCircle2, Briefcase, FileText, Image, Film, Receipt } from "lucide-react";
import DuplicateFinder from "../components/DuplicateFinder";
import { toast } from "sonner";

export default function SettingsPage() {
  const [user, setUser] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [vaultPath, setVaultPath] = useState("");
  const [sharedFolderPath, setSharedFolderPath] = useState("");
  const [visibleCategories, setVisibleCategories] = useState(['business_cards', 'documents', 'images', 'movies', 'receipts']);
  const [newCategory, setNewCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [lastProcessed, setLastProcessed] = useState(null);

  useEffect(() => {
    const load = async () => {
      const [me, cats] = await Promise.all([
        base44.auth.me(),
        base44.entities.Category.list(),
      ]);
      setUser(me);
      setVaultPath(me.vault_path || "");
      setSharedFolderPath(me.shared_folder_path || "");
      setCategories(cats);
      setVisibleCategories(me.visible_folder_categories || ['business_cards', 'documents', 'images', 'movies', 'receipts']);
      setLoading(false);
    };
    load();
  }, []);

  const handleSaveSettings = async () => {
    await base44.auth.updateMe({
      vault_path: vaultPath,
      shared_folder_path: sharedFolderPath,
      visible_folder_categories: visibleCategories,
    });
    toast.success("Settings saved");
  };

  const toggleCategory = (cat) => {
    setVisibleCategories(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  const handleProcessQueue = async () => {
    setProcessing(true);
    const res = await base44.functions.invoke('processQueuedDocuments', {});
    setLastProcessed(res.data);
    setProcessing(false);
    toast.success(res.data?.message || 'Done');
  };

  const handleSendAllToReview = async () => {
    if (!confirm('This will move ALL documents into the Review Queue so you can verify AI data. Continue?')) return;
    setQueueing(true);
    const allDocs = await base44.entities.Document.list('-created_date', 500);
    await Promise.all(allDocs.map(doc =>
      base44.entities.Document.update(doc.id, { processing_status: 'needs_review' })
    ));
    setQueueing(false);
    toast.success(`${allDocs.length} document(s) moved to Review Queue`);
  };

  const handleReprocessAll = async () => {
    if (!confirm('This will reset ALL documents to pending and re-run AI analysis on every document. Continue?')) return;
    setReprocessing(true);
    const allDocs = await base44.entities.Document.list('-created_date', 500);
    await Promise.all(allDocs.map(doc =>
      base44.entities.Document.update(doc.id, { processing_status: 'pending', is_searchable_pdf: false })
    ));
    const res = await base44.functions.invoke('processQueuedDocuments', {});
    setLastProcessed(res.data);
    setReprocessing(false);
    toast.success(res.data?.message || 'Done');
  };

  const handleAddCategory = async () => {
    if (!newCategory.trim()) return;
    await base44.entities.Category.create({ name: newCategory.trim() });
    setNewCategory("");
    const cats = await base44.entities.Category.list();
    setCategories(cats);
    toast.success("Category added");
  };

  const handleDeleteCategory = async (id) => {
    if (!confirm("Delete this category?")) return;
    await base44.entities.Category.delete(id);
    const cats = await base44.entities.Category.list();
    setCategories(cats);
    toast.success("Category removed");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Configure your document management system</p>
      </div>

      {/* Vault Settings */}
      <div className="bg-card rounded-xl border p-6 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <Shield className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Encryption (Cryptomator)</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Configure the path to your Cryptomator vault where encrypted documents are stored.
        </p>
        <div>
          <Label className="text-xs">Vault Path</Label>
          <Input
            className="mt-1.5 font-mono text-sm"
            value={vaultPath}
            onChange={e => setVaultPath(e.target.value)}
            placeholder="/path/to/cryptomator/vault"
          />
        </div>
      </div>

      {/* Shared Folder */}
      <div className="bg-card rounded-xl border p-6 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <FolderSync className="h-5 w-5 text-chart-2" />
          <h2 className="font-semibold">Shared Folder (Ingestion)</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Set the shared folder path where new documents will be automatically ingested from.
        </p>
        <div>
          <Label className="text-xs">Shared Folder Path</Label>
          <Input
            className="mt-1.5 font-mono text-sm"
            value={sharedFolderPath}
            onChange={e => setSharedFolderPath(e.target.value)}
            placeholder="/path/to/shared/folder"
          />
        </div>
      </div>

      {/* Folder Categories Visibility */}
      <div className="bg-card rounded-xl border p-6 space-y-4">
        <h2 className="font-semibold">Folder Categories in Sidebar</h2>
        <p className="text-sm text-muted-foreground">Choose which folder categories to display in the sidebar.</p>
        <div className="space-y-2">
          {[
            { id: 'business_cards', label: 'Business Cards', icon: Briefcase },
            { id: 'documents', label: 'Documents', icon: FileText },
            { id: 'images', label: 'Images', icon: Image },
            { id: 'movies', label: 'Movies', icon: Film },
            { id: 'receipts', label: 'Receipts', icon: Receipt },
          ].map(cat => {
            const IconComp = cat.icon;
            return (
              <label key={cat.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={visibleCategories.includes(cat.id)}
                  onChange={() => toggleCategory(cat.id)}
                  className="h-4 w-4 rounded border-input"
                />
                <IconComp className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{cat.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      <SaveButton onSave={handleSaveSettings}>
        <HardDrive className="h-4 w-4 mr-2" /> Save Settings
      </SaveButton>

      {/* Process Queue */}
      <div className="bg-card rounded-xl border p-6 space-y-3">
        <div className="flex items-center gap-3">
          <Play className="h-5 w-5 text-chart-2" />
          <h2 className="font-semibold">Auto-Process Queue</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Automatically summarize, categorize, and assign vault paths to all pending documents using AI.
          This also runs automatically every 30 minutes.
        </p>
        {lastProcessed && (
          <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2">
            <CheckCircle2 className="h-4 w-4" />
            {lastProcessed.message}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleSendAllToReview} disabled={queueing || processing || reprocessing} variant="outline" className="border-blue-300 text-blue-700 hover:bg-blue-50">
            {queueing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
            {queueing ? 'Queueing...' : 'Send All to Review Queue'}
          </Button>
          <Button onClick={handleProcessQueue} disabled={processing || reprocessing || queueing} variant="outline">
            {processing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
            {processing ? 'Processing...' : 'Process All Pending Now'}
          </Button>
          <Button onClick={handleReprocessAll} disabled={processing || reprocessing} variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-50">
            {reprocessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
            {reprocessing ? 'Reprocessing...' : 'Reprocess ALL Documents'}
          </Button>
        </div>
      </div>

      <DuplicateFinder />

      <div className="bg-muted/50 rounded-xl p-4 text-xs text-muted-foreground space-y-1">
        <p className="font-medium">💡 Vault Path Auto-Fill</p>
        <p>Set a Vault Path on each Folder (in Folder settings). When a document is assigned to that folder — either manually or by AI — its vault path will be auto-suggested based on the folder's vault path.</p>
      </div>

      {/* Categories */}
      <div className="bg-card rounded-xl border p-6 space-y-4">
        <h2 className="font-semibold">Categories</h2>
        <div className="flex flex-wrap gap-2">
          {categories.map(cat => (
            <div key={cat.id} className="flex items-center gap-1.5 bg-muted rounded-full px-3 py-1.5">
              <span className="text-sm">{cat.name}</span>
              <button onClick={() => handleDeleteCategory(cat.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={newCategory}
            onChange={e => setNewCategory(e.target.value)}
            placeholder="New category name"
            className="flex-1"
            onKeyDown={e => e.key === "Enter" && handleAddCategory()}
          />
          <Button variant="outline" onClick={handleAddCategory} disabled={!newCategory.trim()}>
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>
      </div>
    </div>
  );
}