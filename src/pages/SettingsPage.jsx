import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import SaveButton from "../components/SaveButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Shield, FolderSync, HardDrive, Loader2, Plus, Trash2, Play, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export default function SettingsPage() {
  const [user, setUser] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [vaultPath, setVaultPath] = useState("");
  const [sharedFolderPath, setSharedFolderPath] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);
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
      setLoading(false);
    };
    load();
  }, []);

  const handleSaveSettings = async () => {
    await base44.auth.updateMe({
      vault_path: vaultPath,
      shared_folder_path: sharedFolderPath,
    });
    toast.success("Settings saved");
  };

  const handleProcessQueue = async () => {
    setProcessing(true);
    const res = await base44.functions.invoke('processQueuedDocuments', {});
    setLastProcessed(res.data);
    setProcessing(false);
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
        <Button onClick={handleProcessQueue} disabled={processing} variant="outline">
          {processing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
          {processing ? 'Processing...' : 'Process All Pending Now'}
        </Button>
      </div>

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