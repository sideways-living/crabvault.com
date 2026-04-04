import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileText, X, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

export default function UploadDialog({ open, onOpenChange, folders, categories, onUploaded }) {
  const [files, setFiles] = useState([]);
  const [folderId, setFolderId] = useState("");
  const [uploading, setUploading] = useState(false);
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

    for (const file of files) {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const ext = file.name.split('.').pop().toLowerCase();
      const fileType = ['pdf', 'docx', 'xlsx', 'pptx', 'txt', 'jpg', 'png'].includes(ext) ? ext : 'other';

      await base44.entities.Document.create({
        title: file.name.replace(/\.[^/.]+$/, ""),
        file_url,
        original_filename: file.name,
        file_type: fileType,
        file_size: file.size,
        folder_id: folderId || undefined,
        processing_status: "pending",
      });
    }

    toast.success(`${files.length} document${files.length > 1 ? 's' : ''} uploaded`);
    setFiles([]);
    setFolderId("");
    setUploading(false);
    onOpenChange(false);
    onUploaded?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload Documents</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all"
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
                  <button onClick={() => removeFile(i)} className="p-0.5 hover:bg-muted rounded">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div>
            <Label className="text-xs">Destination Folder (optional)</Label>
            <Select value={folderId} onValueChange={setFolderId}>
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
            {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
            {uploading ? "Uploading..." : `Upload ${files.length} file${files.length !== 1 ? 's' : ''}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}