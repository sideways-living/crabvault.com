import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Loader2, CheckCircle2, X, User } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";

const CATEGORIES = ["correspondence", "evidence", "receipt", "id", "legal", "medical", "financial", "other"];

function buildFullName(first, middle, surname) {
  // Format: Firstname Middlename SURNAME
  const parts = [];
  if (first?.trim()) parts.push(first.trim());
  if (middle?.trim()) parts.push(middle.trim());
  if (surname?.trim()) parts.push(surname.trim().toUpperCase());
  return parts.join(" ");
}

export default function CrabDocumentUploadDialog({ open, onOpenChange, crabs = [], onUploaded }) {
  const [file, setFile] = useState(null);
  const [category, setCategory] = useState("other");
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null); // { crabId, crabName, docId, isNew }

  // New crab name fields
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [surname, setSurname] = useState("");

  // Or link to existing crab
  const [useExisting, setUseExisting] = useState(false);
  const [existingCrabId, setExistingCrabId] = useState("");

  const reset = () => {
    setFile(null);
    setCategory("other");
    setUploading(false);
    setResult(null);
    setFirstName("");
    setMiddleName("");
    setSurname("");
    setUseExisting(false);
    setExistingCrabId("");
  };

  const handleUpload = async () => {
    if (!file) { toast.error("Please select a file"); return; }
    if (!useExisting && !surname.trim()) { toast.error("Surname is required"); return; }
    if (useExisting && !existingCrabId) { toast.error("Please select a crab"); return; }

    setUploading(true);
    try {
      // 1. Upload file
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const ext = file.name.split(".").pop().toLowerCase();
      const fileType = ["pdf","docx","xlsx","jpg","png","heic","txt"].includes(ext) ? ext : "other";

      let crabId;
      let crabName;
      let isNew = false;

      if (useExisting) {
        const existing = crabs.find(c => c.id === existingCrabId);
        crabId = existingCrabId;
        crabName = existing?.full_name || existing?.surname || "Unknown";
      } else {
        // 2. Create new crab profile
        const fullName = buildFullName(firstName, middleName, surname);
        const newCrab = await base44.entities.Crab.create({
          first_name: firstName.trim(),
          middle_name: middleName.trim(),
          surname: surname.trim(),
          full_name: fullName,
          status: "active",
          aliases: [],
          tags: [],
          id_numbers: [],
          mailing_same_as_residential: true,
          is_deleted: false,
        });
        crabId = newCrab.id;
        crabName = fullName;
        isNew = true;
      }

      // 3. Build vault path: /documents/SURNAME Firstname/filename
      const vaultFolder = `/documents/${surname.trim().toUpperCase() || crabName}${firstName.trim() ? " " + firstName.trim() : ""}`;
      const vaultPath = `${vaultFolder}/${file.name}`;

      // 4. Create the CrabDocument
      const doc = await base44.entities.CrabDocument.create({
        title: file.name.replace(/\.[^/.]+$/, ""),
        file_url,
        original_filename: file.name,
        file_type: fileType,
        file_size: file.size,
        crab_ids: [crabId],
        category,
        processing_status: "pending",
        vault_path: vaultPath,
        ingress_deleted: false,
        synced_to_vault: false,
      });

      setResult({ crabId, crabName, docId: doc.id, isNew });
      toast.success(isNew ? `Profile created & document uploaded` : "Document uploaded");
      onUploaded?.();
    } catch (e) {
      toast.error(e.message);
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="flex flex-col items-center gap-4 py-6">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            <div className="text-center">
              <p className="font-semibold">{result.isNew ? "New profile created" : "Document linked"}</p>
              <p className="text-sm text-muted-foreground mt-1">{result.crabName}</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={reset} variant="outline">Upload Another</Button>
              <Link to={`/crabs/${result.crabId}`}>
                <Button variant="outline" className="gap-1"><User className="h-3.5 w-3.5" /> View Profile</Button>
              </Link>
              <Button onClick={() => { reset(); onOpenChange(false); }}>Done</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">

            {/* File picker */}
            <div
              className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => document.getElementById("cv-file-input").click()}
            >
              <input id="cv-file-input" type="file" className="hidden" onChange={e => setFile(e.target.files[0])} />
              {file ? (
                <div className="flex items-center justify-center gap-2">
                  <span className="text-sm font-medium truncate max-w-xs">{file.name}</span>
                  <button onClick={e => { e.stopPropagation(); setFile(null); }}><X className="h-4 w-4 text-muted-foreground" /></button>
                </div>
              ) : (
                <>
                  <Upload className="h-7 w-7 mx-auto mb-2 text-muted-foreground opacity-50" />
                  <p className="text-sm text-muted-foreground">Click to select a file</p>
                </>
              )}
            </div>

            {/* Crab: new or existing */}
            <div className="flex gap-2">
              <button
                onClick={() => setUseExisting(false)}
                className={`flex-1 text-sm py-2 rounded-lg border font-medium transition-colors ${!useExisting ? "bg-primary text-primary-foreground border-primary" : "border-input text-muted-foreground hover:bg-muted"}`}
              >
                New Profile
              </button>
              <button
                onClick={() => setUseExisting(true)}
                className={`flex-1 text-sm py-2 rounded-lg border font-medium transition-colors ${useExisting ? "bg-primary text-primary-foreground border-primary" : "border-input text-muted-foreground hover:bg-muted"}`}
              >
                Existing Crab
              </button>
            </div>

            {!useExisting ? (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">A new crab profile will be created automatically.</p>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs">First Name</Label>
                    <Input className="mt-1" value={firstName} onChange={e => setFirstName(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Middle</Label>
                    <Input className="mt-1" value={middleName} onChange={e => setMiddleName(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Surname *</Label>
                    <Input className="mt-1" value={surname} onChange={e => setSurname(e.target.value)} />
                  </div>
                </div>
                {(firstName || middleName || surname) && (
                  <p className="text-xs text-muted-foreground bg-muted/50 px-3 py-2 rounded-lg font-medium">
                    Profile: <span className="text-foreground">{buildFullName(firstName, middleName, surname)}</span>
                  </p>
                )}
              </div>
            ) : (
              <div>
                <Label className="text-xs">Select Crab</Label>
                <Select value={existingCrabId} onValueChange={setExistingCrabId}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Choose a crab…" /></SelectTrigger>
                  <SelectContent>
                    {crabs.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.full_name || c.surname}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Category */}
            <div>
              <Label className="text-xs">Document Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Vault path preview */}
            {!useExisting && surname.trim() && (
              <p className="text-[11px] font-mono text-muted-foreground bg-muted/40 px-3 py-2 rounded-lg break-all">
                🔒 /documents/{surname.trim().toUpperCase()}{firstName.trim() ? " " + firstName.trim() : ""}/{file?.name || "…"}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <Button onClick={handleUpload} disabled={uploading || !file} className="flex-1 gap-2">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {uploading ? "Uploading…" : "Upload & Create Profile"}
              </Button>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}