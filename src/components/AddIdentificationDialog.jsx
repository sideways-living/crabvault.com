import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileText, Loader2, Sparkles, Link2, Check, X } from "lucide-react";

const ID_TYPES = [
  "Birth Certificate",
  "Drivers Licence",
  "Photo Card",
  "Notice of Assessment",
  "Rental Agreement",
  "Passport",
  "Medicare Card",
  "Other",
];

const FIELD_LABELS = {
  country_of_birth: "Country of Birth",
  date_of_birth: "Date of Birth",
  place_of_birth: "Place of Birth",
  tfn: "TFN",
  address: "Address",
  licence_number: "Licence Number",
  card_number: "Card Number",
  expiry: "Expiry",
  pc_number: "PC Number",
};

const AI_SUPPORTED_TYPES = new Set([
  "Birth Certificate",
  "Drivers Licence",
  "Photo Card",
  "Notice of Assessment",
  "Rental Agreement",
]);

export default function AddIdentificationDialog({ open, onClose, crabId, documents, onAdd }) {
  const [step, setStep] = useState(1); // 1=type, 2=vault, 3=extracted/manual
  const [idType, setIdType] = useState("");
  const [inVault, setInVault] = useState(null); // null | true | false
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [docSearch, setDocSearch] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractedFields, setExtractedFields] = useState(null);
  const [extractError, setExtractError] = useState("");
  const [manualEntries, setManualEntries] = useState([{ label: "", value: "" }]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setStep(1);
      setIdType("");
      setInVault(null);
      setSelectedDoc(null);
      setDocSearch("");
      setExtracting(false);
      setExtractedFields(null);
      setExtractError("");
      setManualEntries([{ label: "", value: "" }]);
    }
  }, [open]);

  const filteredDocs = documents.filter(d =>
    !d.is_deleted &&
    (docSearch === "" || d.title?.toLowerCase().includes(docSearch.toLowerCase()))
  );

  const handleExtract = async () => {
    if (!selectedDoc) return;
    setExtracting(true);
    setExtractError("");
    try {
      const res = await base44.functions.invoke("extractIdDocument", {
        document_id: selectedDoc.id,
        id_type: idType,
      });
      const { extracted, fields } = res.data;
      // Build entries from extracted fields
      const entries = (fields || [])
        .map(f => ({
          label: FIELD_LABELS[f] || f,
          value: extracted[f] || "",
        }))
        .filter(e => e.value);
      setExtractedFields(entries.length > 0 ? entries : null);
      if (entries.length === 0) {
        setExtractError("AI could not extract data from this document. Please fill in manually.");
      }
      // Pre-populate manual entries with extracted data
      const allFields = (fields || []).map(f => ({
        label: FIELD_LABELS[f] || f,
        value: extracted[f] || "",
      }));
      setManualEntries(allFields.length > 0 ? allFields : [{ label: "", value: "" }]);
    } catch (e) {
      setExtractError(e?.response?.data?.error || e.message || "Extraction failed");
    }
    setExtracting(false);
    setStep(3);
  };

  const handleSkipExtract = () => {
    // Pre-populate labels based on id type if supported
    const presets = {
      "Birth Certificate": ["Country of Birth", "Date of Birth", "Place of Birth"],
      "Drivers Licence": ["Licence Number", "Card Number", "Expiry", "Address", "Date of Birth"],
      "Photo Card": ["Date of Birth", "Address", "Card Number", "PC Number"],
      "Notice of Assessment": ["TFN", "Address"],
      "Rental Agreement": ["Address"],
    };
    const labels = presets[idType] || [];
    setManualEntries(labels.length > 0 ? labels.map(l => ({ label: l, value: "" })) : [{ label: "", value: "" }]);
    setStep(3);
  };

  const handleSave = () => {
    const entries = manualEntries
      .filter(e => e.label.trim() && e.value.trim())
      .map(e => ({ label: `${idType}: ${e.label}`, value: e.value }));

    if (entries.length === 0) {
      // At minimum save the ID type with no value fields
      onAdd([{ label: idType, value: "", linked_document_id: selectedDoc?.id || "" }]);
    } else {
      // Tag each entry with the doc link on the first one
      const tagged = entries.map((e, i) => ({
        ...e,
        ...(i === 0 && selectedDoc ? { linked_document_id: selectedDoc.id } : {}),
      }));
      onAdd(tagged);
    }
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Identification</DialogTitle>
        </DialogHeader>

        {/* Step 1: Choose ID type */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <Label className="text-sm">What type of ID is this?</Label>
              <Select value={idType} onValueChange={setIdType}>
                <SelectTrigger className="mt-2"><SelectValue placeholder="Select ID type…" /></SelectTrigger>
                <SelectContent>
                  {ID_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button disabled={!idType} onClick={() => setStep(2)}>Next</Button>
            </div>
          </div>
        )}

        {/* Step 2: Is it in CrabVault? */}
        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Is this <span className="font-medium text-foreground">{idType}</span> uploaded to CrabVault?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setInVault(true)}
                className={`flex-1 border rounded-lg p-3 text-sm font-medium transition-colors ${inVault === true ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"}`}
              >
                Yes, it's in CrabVault
              </button>
              <button
                onClick={() => { setInVault(false); handleSkipExtract(); }}
                className={`flex-1 border rounded-lg p-3 text-sm font-medium transition-colors ${inVault === false ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"}`}
              >
                No, enter manually
              </button>
            </div>

            {inVault === true && (
              <div className="space-y-3 pt-2">
                <Label className="text-xs">Search for the document</Label>
                <Input
                  placeholder="Search documents…"
                  value={docSearch}
                  onChange={e => setDocSearch(e.target.value)}
                />
                <div className="max-h-48 overflow-y-auto space-y-1 border rounded-lg p-1">
                  {filteredDocs.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4">No documents found</p>
                  )}
                  {filteredDocs.map(doc => (
                    <button
                      key={doc.id}
                      onClick={() => setSelectedDoc(doc)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded text-left text-sm transition-colors ${selectedDoc?.id === doc.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                    >
                      <FileText className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{doc.title}</span>
                    </button>
                  ))}
                </div>
                {selectedDoc && (
                  <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 px-3 py-2 rounded-lg">
                    <Link2 className="h-3.5 w-3.5 shrink-0" />
                    Linked: {selectedDoc.title}
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-between gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              {inVault === true && (
                <div className="flex gap-2">
                  {AI_SUPPORTED_TYPES.has(idType) && selectedDoc ? (
                    <Button onClick={handleExtract} disabled={!selectedDoc || extracting} className="gap-2">
                      {extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      {extracting ? "Extracting…" : "Extract with AI"}
                    </Button>
                  ) : (
                    <Button onClick={handleSkipExtract} disabled={!selectedDoc}>Link & Continue</Button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Review / Manual entry */}
        {step === 3 && (
          <div className="space-y-4">
            {extractError && (
              <p className="text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-lg">{extractError}</p>
            )}
            {selectedDoc && (
              <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 px-3 py-2 rounded-lg">
                <Link2 className="h-3.5 w-3.5 shrink-0" />
                Linked to: {selectedDoc.title}
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-sm font-medium">{idType} — Details</Label>
              {manualEntries.map((entry, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Input
                    placeholder="Label"
                    className="w-36 text-xs"
                    value={entry.label}
                    onChange={e => setManualEntries(es => es.map((x, idx) => idx === i ? { ...x, label: e.target.value } : x))}
                  />
                  <Input
                    placeholder="Value"
                    className="flex-1 text-xs"
                    value={entry.value}
                    onChange={e => setManualEntries(es => es.map((x, idx) => idx === i ? { ...x, value: e.target.value } : x))}
                  />
                  <button
                    onClick={() => setManualEntries(es => es.filter((_, idx) => idx !== i))}
                    className="text-muted-foreground hover:text-destructive shrink-0"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => setManualEntries(es => [...es, { label: "", value: "" }])}
                className="text-xs text-primary hover:underline"
              >
                + Add field
              </button>
            </div>
            <div className="flex justify-between gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
              <Button onClick={handleSave} className="gap-2">
                <Check className="h-4 w-4" /> Save
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}