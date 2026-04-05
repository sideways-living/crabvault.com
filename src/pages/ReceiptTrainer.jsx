import { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, Trash2, Save, Plus, Loader2, BookOpen, X, ChevronDown, ChevronUp, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import AnnotationCanvas from "../components/AnnotationCanvas";

const FIELDS = [
  { key: "store_brand",       label: "Store Brand",      color: "#3b82f6" },
  { key: "store_location",    label: "Store Location",   color: "#8b5cf6" },
  { key: "transaction_date",  label: "Date",             color: "#f59e0b" },
  { key: "transaction_time",  label: "Time",             color: "#f97316" },
  { key: "transaction_type",  label: "Transaction Type", color: "#ec4899" },
  { key: "tender_type",       label: "Tender Type",      color: "#10b981" },
  { key: "amount",            label: "Amount",           color: "#ef4444" },
  { key: "last_four_digits",  label: "Last 4 Digits",    color: "#6366f1" },
  { key: "items",             label: "Items",            color: "#14b8a6" },
];

function SampleEditor({ sample, index, onChange, onRemove }) {
  return (
    <div className="border rounded-xl p-4 space-y-3 bg-muted/20">
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sample {index + 1}</span>
        <Input
          value={sample.label}
          onChange={e => onChange({ ...sample, label: e.target.value })}
          placeholder="Label (e.g. Standard POS, Return receipt, Self-checkout…)"
          className="h-7 text-xs flex-1"
        />
        <button onClick={onRemove} className="text-muted-foreground hover:text-destructive transition-colors shrink-0">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      {sample.image_url ? (
        <AnnotationCanvas
          imageUrl={sample.image_url}
          regions={sample.field_regions || []}
          onRegionsChange={regions => onChange({ ...sample, field_regions: regions })}
          fields={FIELDS}
        />
      ) : (
        <UploadImageSlot onUploaded={url => onChange({ ...sample, image_url: url })} />
      )}
    </div>
  );
}

function UploadImageSlot({ onUploaded }) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    onUploaded(file_url);
    setUploading(false);
  };

  return (
    <div
      onClick={() => !uploading && fileRef.current?.click()}
      className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all"
    >
      {uploading
        ? <Loader2 className="h-7 w-7 text-muted-foreground mx-auto mb-2 animate-spin" />
        : <Upload className="h-7 w-7 text-muted-foreground mx-auto mb-2" />}
      <p className="text-sm font-medium">{uploading ? "Uploading…" : "Click to upload receipt image"}</p>
      <p className="text-xs text-muted-foreground mt-1">JPG or PNG</p>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png" className="hidden" onChange={handleFile} />
    </div>
  );
}

function TemplateCard({ template, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const sampleCount = template.samples?.length || 0;

  return (
    <div className="bg-card border rounded-xl overflow-hidden">
      <div className="flex items-center gap-4 px-4 py-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">{template.store_brand}</p>
          <p className="text-xs text-muted-foreground">{sampleCount} receipt sample{sampleCount !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setExpanded(v => !v)} className="text-muted-foreground hover:text-foreground transition-colors p-1">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        <button onClick={() => onDelete(template.id)} className="text-muted-foreground hover:text-destructive transition-colors p-1">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {expanded && (
        <div className="border-t px-4 py-4 space-y-4">
          {(template.samples || []).map((s, i) => (
            <div key={i} className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Sample {i + 1}{s.label ? ` — ${s.label}` : ''}</p>
              <div className="flex gap-3">
                {s.image_url && (
                  <img src={s.image_url} alt="" className="w-20 h-24 object-cover rounded-lg border shrink-0" />
                )}
                <div className="flex flex-wrap gap-1 content-start">
                  {(s.field_regions || []).map((r, j) => {
                    const f = FIELDS.find(f => f.key === r.field);
                    return (
                      <span key={j} className="text-[10px] px-1.5 py-0.5 rounded text-white font-medium" style={{ backgroundColor: f?.color || '#666' }}>
                        {f?.label || r.field}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
          {template.notes && <p className="text-xs text-muted-foreground italic">{template.notes}</p>}
        </div>
      )}
    </div>
  );
}

export default function ReceiptTrainer() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [storeBrand, setStoreBrand] = useState("");
  const [notes, setNotes] = useState("");
  const [samples, setSamples] = useState([{ label: "", image_url: null, field_regions: [] }]);
  const [saving, setSaving] = useState(false);

  const loadTemplates = async () => {
    const data = await base44.entities.ReceiptTemplate.list("-created_date", 50);
    setTemplates(data);
    setLoading(false);
  };

  useEffect(() => { loadTemplates(); }, []);

  const updateSample = (index, updated) => {
    setSamples(prev => prev.map((s, i) => i === index ? updated : s));
  };

  const removeSample = (index) => {
    setSamples(prev => prev.filter((_, i) => i !== index));
  };

  const addSample = () => {
    setSamples(prev => [...prev, { label: "", image_url: null, field_regions: [] }]);
  };

  const handleSave = async () => {
    if (!storeBrand.trim()) { toast.error("Enter a store brand name"); return; }
    const validSamples = samples.filter(s => s.image_url);
    if (validSamples.length === 0) { toast.error("Upload at least one receipt image"); return; }
    const hasAnnotations = validSamples.some(s => (s.field_regions || []).length > 0);
    if (!hasAnnotations) { toast.error("Highlight at least one field region on a receipt"); return; }

    setSaving(true);
    await base44.entities.ReceiptTemplate.create({
      store_brand: storeBrand.trim(),
      samples: validSamples,
      notes: notes.trim() || undefined,
    });
    toast.success(`Template saved for "${storeBrand}"`);
    setStoreBrand("");
    setNotes("");
    setSamples([{ label: "", image_url: null, field_regions: [] }]);
    setSaving(false);
    loadTemplates();
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this template?")) return;
    await base44.entities.ReceiptTemplate.delete(id);
    toast.success("Template deleted");
    loadTemplates();
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Receipt Trainer</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload one or more receipt layouts per store and highlight where each data field appears. The AI uses these templates to improve recognition.
        </p>
      </div>

      {/* New template form */}
      <div className="bg-card border rounded-xl p-6 space-y-5">
        <h2 className="font-semibold flex items-center gap-2"><Plus className="h-4 w-4" /> New Receipt Template</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">Store Brand *</label>
            <Input value={storeBrand} onChange={e => setStoreBrand(e.target.value)} placeholder="e.g. Woolworths, Bunnings…" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">Notes (optional)</label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. multiple POS types" />
          </div>
        </div>

        {/* Samples */}
        <div className="space-y-4">
          {samples.map((sample, i) => (
            <SampleEditor
              key={i}
              index={i}
              sample={sample}
              onChange={updated => updateSample(i, updated)}
              onRemove={() => removeSample(i)}
            />
          ))}

          <button
            onClick={addSample}
            className="w-full flex items-center justify-center gap-2 border-2 border-dashed rounded-xl py-3 text-sm text-muted-foreground hover:text-primary hover:border-primary/50 transition-all"
          >
            <ImagePlus className="h-4 w-4" /> Add another receipt sample
          </button>
        </div>

        <div className="flex gap-2 pt-1">
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Template
          </Button>
          <Button variant="outline" onClick={() => { setStoreBrand(""); setNotes(""); setSamples([{ label: "", image_url: null, field_regions: [] }]); }}>
            Reset
          </Button>
        </div>
      </div>

      {/* Saved templates */}
      <div>
        <h2 className="font-semibold flex items-center gap-2 mb-4"><BookOpen className="h-4 w-4" /> Saved Templates ({templates.length})</h2>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : templates.length === 0 ? (
          <div className="bg-card border rounded-xl p-8 text-center text-sm text-muted-foreground">
            No templates saved yet. Create one above.
          </div>
        ) : (
          <div className="space-y-3">
            {templates.map(t => <TemplateCard key={t.id} template={t} onDelete={handleDelete} />)}
          </div>
        )}
      </div>
    </div>
  );
}