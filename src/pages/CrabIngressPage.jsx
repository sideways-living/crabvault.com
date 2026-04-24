import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import {
  FileText, User, CheckCircle2, AlertTriangle, Clock, Loader2,
  ChevronRight, Upload, RefreshCw, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const STATUS_COLORS = {
  pending:      "bg-amber-100 text-amber-700",
  processing:   "bg-blue-100 text-blue-700",
  needs_review: "bg-orange-100 text-orange-700",
  completed:    "bg-emerald-100 text-emerald-700",
  failed:       "bg-red-100 text-red-700",
};

const CATEGORIES = ["correspondence","evidence","receipt","id","legal","medical","financial","other"];

function buildFullName(first, middle, surname) {
  const parts = [];
  if (first?.trim()) parts.push(first.trim());
  if (middle?.trim()) parts.push(middle.trim());
  if (surname?.trim()) parts.push(surname.trim().toUpperCase());
  return parts.join(" ");
}

export default function CrabIngressPage() {
  const [docs, setDocs] = useState([]);
  const [crabs, setCrabs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null); // doc id being assigned
  const [saving, setSaving] = useState(false);

  // Assignment form state
  const [useExisting, setUseExisting] = useState(false);
  const [existingCrabId, setExistingCrabId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [surname, setSurname] = useState("");
  const [category, setCategory] = useState("other");

  const load = async () => {
    setLoading(true);
    const [unassigned, allCrabs] = await Promise.all([
      // Docs with no crab_ids linked — pending ingress
      base44.entities.CrabDocument.filter({ is_deleted: false }, "-created_date", 200),
      base44.entities.Crab.filter({ is_deleted: false }, "full_name", 500),
    ]);
    setDocs(unassigned.filter(d => !d.crab_ids || d.crab_ids.length === 0));
    setCrabs(allCrabs);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openAssign = (doc) => {
    setSelected(doc.id);
    setUseExisting(false);
    setExistingCrabId("");
    setFirstName("");
    setMiddleName("");
    setSurname("");
    setCategory(doc.category || "other");
  };

  const handleAssign = async () => {
    if (!useExisting && !surname.trim()) { toast.error("Surname is required"); return; }
    if (useExisting && !existingCrabId) { toast.error("Please select a crab"); return; }

    setSaving(true);
    try {
      const doc = docs.find(d => d.id === selected);
      let crabId = existingCrabId;

      if (!useExisting) {
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
        toast.success(`Profile created: ${fullName}`);
      }

      const folderName = !useExisting
        ? `${surname.trim().toUpperCase()}${firstName.trim() ? " " + firstName.trim() : ""}`
        : (crabs.find(c => c.id === crabId)?.full_name || "");
      const vaultPath = `/documents/${folderName}/${doc.original_filename || doc.title}`;

      await base44.entities.CrabDocument.update(selected, {
        crab_ids: [crabId],
        category,
        vault_path: vaultPath,
        processing_status: "pending",
      });

      toast.success("Document assigned");
      setSelected(null);
      load();
    } catch (e) {
      toast.error(e.message);
    }
    setSaving(false);
  };

  const handleDismiss = async (docId) => {
    if (!confirm("Mark this document as deleted/dismissed?")) return;
    await base44.entities.CrabDocument.update(docId, { is_deleted: true });
    toast.success("Dismissed");
    setDocs(prev => prev.filter(d => d.id !== docId));
    if (selected === docId) setSelected(null);
  };

  const selectedDoc = docs.find(d => d.id === selected);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ingress Queue</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Unassigned documents waiting to be linked to a crab profile
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} className="gap-1">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Link to="/crab-documents">
            <Button variant="outline" size="sm" className="gap-1">
              <Upload className="h-3.5 w-3.5" /> Upload
            </Button>
          </Link>
        </div>
      </div>

      {/* Watcher tip */}
      <div className="bg-muted/50 border rounded-xl px-5 py-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground mb-1">🦀 Watch Folder</p>
        <p>Run <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">node watcher/watch-crab.js</code> on your machine to auto-ingest files from a local folder into this queue.</p>
        <p className="mt-1 text-xs">Use <strong>SURNAME_Firstname_Middlename</strong> subfolders to auto-assign profiles, or set <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">CRAB_DEFAULT_SURNAME</code> for a single-crab drop folder.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : docs.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <CheckCircle2 className="h-10 w-10 mx-auto mb-3 opacity-30 text-emerald-500" />
          <p className="text-sm font-medium">Ingress queue is clear</p>
          <p className="text-xs mt-1">All documents have been assigned to crab profiles</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Queue list */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
              {docs.length} unassigned
            </p>
            {docs.map(doc => (
              <div
                key={doc.id}
                onClick={() => openAssign(doc)}
                className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                  selected === doc.id
                    ? "border-primary bg-primary/5"
                    : "hover:bg-muted/40 bg-card"
                }`}
              >
                <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{doc.title}</p>
                  {doc.original_filename && (
                    <p className="text-xs text-muted-foreground font-mono truncate">{doc.original_filename}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {doc.processing_status && (
                    <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${STATUS_COLORS[doc.processing_status] || ""}`}>
                      {doc.processing_status.replace("_", " ")}
                    </span>
                  )}
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            ))}
          </div>

          {/* Assignment panel */}
          {selectedDoc ? (
            <div className="bg-card border rounded-xl p-5 space-y-4 self-start sticky top-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-semibold">Assign Document</h2>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">{selectedDoc.title}</p>
                </div>
                <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* New / Existing toggle */}
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
                    <p className="text-xs bg-muted/50 px-3 py-2 rounded-lg font-medium">
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

              <div>
                <Label className="text-xs">Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {!useExisting && surname.trim() && (
                <p className="text-[11px] font-mono text-muted-foreground bg-muted/40 px-3 py-2 rounded-lg break-all">
                  🔒 /documents/{surname.trim().toUpperCase()}{firstName.trim() ? " " + firstName.trim() : ""}/{selectedDoc.original_filename || selectedDoc.title}
                </p>
              )}

              <div className="flex gap-2 pt-1">
                <Button onClick={handleAssign} disabled={saving} className="flex-1 gap-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <User className="h-4 w-4" />}
                  {saving ? "Assigning…" : "Assign & Create Profile"}
                </Button>
                <Button variant="ghost" size="icon" onClick={() => handleDismiss(selectedDoc.id)} className="text-destructive hover:bg-destructive/10" title="Dismiss">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center text-muted-foreground text-sm py-16 border rounded-xl bg-muted/20">
              Select a document to assign it to a crab
            </div>
          )}
        </div>
      )}
    </div>
  );
}