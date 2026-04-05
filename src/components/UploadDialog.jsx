import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileText, X, Loader2, Brain, Lock, CheckCircle2, ChevronRight } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

export default function UploadDialog({ open, onOpenChange, folders, categories, onUploaded }) {
  const [files, setFiles] = useState([]);
  const [folderId, setFolderId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [phase, setPhase] = useState("idle"); // idle | uploading | processing | vaulting | done
  const [progressLabel, setProgressLabel] = useState("");
  const fileRef = useRef();

  const handleFiles = (e) => {
    const newFiles = Array.from(e.target.files);
    setFiles(prev => [...prev, ...newFiles]);
  };

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    setUploading(true);

    // Phase 1: Upload
    setPhase("uploading");
    const uploadedDocIds = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setProgressLabel(`Uploading ${file.name}… (${i + 1}/${files.length})`);
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const ext = file.name.split('.').pop().toLowerCase();
      const fileType = ['pdf', 'docx', 'xlsx', 'pptx', 'txt', 'jpg', 'png'].includes(ext) ? ext : 'other';

      const doc = await base44.entities.Document.create({
        title: file.name.replace(/\.[^/.]+$/, ""),
        file_url,
        original_filename: file.name,
        file_type: fileType,
        file_size: file.size,
        folder_id: folderId || undefined,
        processing_status: "pending",
      });
      uploadedDocIds.push(doc.id);
    }

    // Phase 2: AI processing (summarise, categorise, assign vault path)
    setPhase("processing");
    setProgressLabel("AI is analysing, categorising & assigning vault paths…");
    await base44.functions.invoke('processQueuedDocuments', {});
    
    // Wait for documents to be processed and reach review queue
    let allInReview = false;
    let attempts = 0;
    while (!allInReview && attempts < 30) {
      const updatedDocs = await base44.entities.Document.filter({ id: { $in: uploadedDocIds } });
      allInReview = updatedDocs.every(d => d.processing_status === 'needs_review');
      if (!allInReview) {
        await new Promise(r => setTimeout(r, 500));
        attempts++;
      }
    }

    // Phase 3: Upload to vault
    if (allInReview) {
      setPhase("vaulting");
      setProgressLabel("Uploading to Cryptomator vault…");
      const user = await base44.auth.me();
      const userVaultPath = user?.vault_path;
      if (userVaultPath) {
        const selectedFolder = folderId ? folders?.find(f => f.id === folderId) : null;
        const folderPath = selectedFolder?.path || '';
        const reviewDocs = await base44.entities.Document.filter({ id: { $in: uploadedDocIds } });
        for (const doc of reviewDocs) {
          try {
            await base44.functions.invoke('uploadToVault', {
              documentId: doc.id,
              vaultPath: userVaultPath,
              proposedPath: folderPath
            });
          } catch (err) {
            console.error(`Failed to upload ${doc.id} to vault:`, err);
          }
        }
      }
    }

    // Phase 4: Done
    setPhase("done");
    setProgressLabel("Documents uploaded and synced to vault.");
    toast.success(`${files.length} document${files.length > 1 ? 's' : ''} uploaded & processed`);

    setTimeout(() => {
      setFiles([]);
      setFolderId("");
      setUploading(false);
      setPhase("idle");
      setProgressLabel("");
      onOpenChange(false);
      onUploaded?.();
    }, 1500);
  };

  const stepClass = (activePhase, completedPhases) => {
    if (completedPhases.includes(phase)) return "bg-emerald-100 text-emerald-700";
    if (phase === activePhase) return "bg-primary text-primary-foreground";
    return "bg-muted text-muted-foreground";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload Documents</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Pipeline steps */}
          <div className="flex items-center justify-center gap-1.5 text-xs">
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium transition-all ${stepClass('uploading', ['processing', 'vaulting', 'done'])}`}>
              {phase === 'uploading' ? <Loader2 className="h-3 w-3 animate-spin" /> : ['processing','vaulting','done'].includes(phase) ? <CheckCircle2 className="h-3 w-3" /> : <Upload className="h-3 w-3" />}
              Upload
            </div>
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium transition-all ${stepClass('processing', ['vaulting', 'done'])}`}>
              {phase === 'processing' ? <Loader2 className="h-3 w-3 animate-spin" /> : ['vaulting','done'].includes(phase) ? <CheckCircle2 className="h-3 w-3" /> : <Brain className="h-3 w-3" />}
              AI Process
            </div>
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium transition-all ${stepClass('vaulting', ['done'])}`}>
              {phase === 'vaulting' ? <Loader2 className="h-3 w-3 animate-spin" /> : phase === 'done' ? <CheckCircle2 className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
              Vault
            </div>
          </div>

          {/* Status label */}
          {progressLabel && (
            <div className="bg-muted/50 rounded-lg px-4 py-2 text-xs text-center text-muted-foreground">
              {progressLabel}
            </div>
          )}

          {/* Drop zone */}
          <div
            onClick={() => !uploading && fileRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${uploading ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:border-primary/50 hover:bg-primary/5'}`}
          >
            <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-medium">Click to select files</p>
            <p className="text-xs text-muted-foreground mt-1">PDF, DOCX, XLSX, PPTX, TXT, Images</p>
            <input ref={fileRef} type="file" multiple className="hidden" onChange={handleFiles} accept=".pdf,.docx,.xlsx,.pptx,.txt,.jpg,.jpeg,.png" />
          </div>

          {files.length > 0 && (
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {files.map((file, i) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 text-sm">
                  <FileText className="h-4 w-4 text-primary shrink-0" />
                  <span className="truncate flex-1">{file.name}</span>
                  <span className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)}KB</span>
                  <button onClick={() => removeFile(i)} disabled={uploading} className="p-0.5 hover:bg-muted rounded disabled:opacity-40">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div>
            <Label className="text-xs">Destination Folder (optional)</Label>
            <Select value={folderId} onValueChange={setFolderId} disabled={uploading}>
              <SelectTrigger className="mt-1.5">
                <SelectValue placeholder="Select a folder..." />
              </SelectTrigger>
              <SelectContent>
                {folders?.map(f => (
                  <SelectItem key={f.id} value={f.id}>{f.path || f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button onClick={handleUpload} disabled={files.length === 0 || uploading} className="w-full">
            {uploading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {!uploading && <Upload className="h-4 w-4 mr-2" />}
            {phase === 'uploading' && 'Uploading…'}
            {phase === 'processing' && 'AI Processing…'}
            {phase === 'done' && 'Complete!'}
            {phase === 'idle' && `Upload & Process ${files.length} file${files.length !== 1 ? 's' : ''}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}