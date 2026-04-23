import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Loader2, CheckCircle2, X } from "lucide-react";
import { toast } from "sonner";

const CATEGORIES = ["correspondence", "evidence", "receipt", "id", "legal", "medical", "financial", "other"];

export default function CrabDocumentUploadDialog({ open, onOpenChange, crabs = [], onUploaded }) {
  const [file, setFile] = useState(null);
  const [selectedCrabIds, setSelectedCrabIds] = useState([]);
  const [category, setCategory] = useState("other");
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);

  const reset = () => {
    setFile(null);
    setSelectedCrabIds([]);
    setCategory("other");
    setUploading(false);
    setDone(false);
  };

  const handleUpload = async () => {
    if (!file) { toast.error("Please select a file"); return; }
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const ext = file.name.split(".").pop().toLowerCase();
      const fileType = ["pdf","docx","xlsx","jpg","png","heic","txt"].includes(ext) ? ext : "other";
      await base44.entities.CrabDocument.create({
        title: file.name.replace(/\.[^/.]+$/, ""),
        file_url,
        original_filename: file.name,
        file_type: fileType,
        file_size: file.size,
        crab_ids: selectedCrabIds,
        category,
        processing_status: "pending",
        ingress_deleted: false,
        synced_to_vault: false,
      });
      setDone(true);
      toast.success("Document uploaded");
      onUploaded?.();
    } catch (e) {
      toast.error(e.message);
      setUploading(false);
    }
  };

  const toggleCrab = (id) => {
    setSelectedCrabIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
        </DialogHeader>

        {done ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            <p className="font-medium">Document uploaded successfully</p>
            <div className="flex gap-2">
              <Button onClick={reset} variant="outline">Upload Another</Button>
              <Button onClick={() => { reset(); onOpenChange(false); }}>Done</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* File drop */}
            <div
              className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => document.getElementById("cv-file-input").click()}
            >
              <input
                id="cv-file-input"
                type="file"
                className="hidden"
                onChange={e => setFile(e.target.files[0])}
              />
              {file ? (
                <div className="flex items-center justify-center gap-2">
                  <span className="text-sm font-medium truncate max-w-xs">{file.name}</span>
                  <button onClick={e => { e.stopPropagation(); setFile(null); }}><X className="h-4 w-4 text-muted-foreground" /></button>
                </div>
              ) : (
                <>
                  <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-50" />
                  <p className="text-sm text-muted-foreground">Click to select a file</p>
                </>
              )}
            </div>

            {/* Category */}
            <div>
              <Label className="text-xs">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Link to crabs */}
            <div>
              <Label className="text-xs">Link to Crabs</Label>
              <div className="mt-1 max-h-40 overflow-y-auto border rounded-lg divide-y">
                {crabs.map(c => (
                  <label key={c.id} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/30">
                    <input
                      type="checkbox"
                      checked={selectedCrabIds.includes(c.id)}
                      onChange={() => toggleCrab(c.id)}
                      className="rounded"
                    />
                    <span className="text-sm">{c.full_name}</span>
                  </label>
                ))}
                {crabs.length === 0 && <p className="text-xs text-muted-foreground px-3 py-2">No crabs yet</p>}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={handleUpload} disabled={uploading || !file} className="flex-1 gap-2">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {uploading ? "Uploading…" : "Upload"}
              </Button>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}