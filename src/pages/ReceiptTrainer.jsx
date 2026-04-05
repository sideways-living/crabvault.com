import { useState, useRef, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Upload, Trash2, Save, Plus, CheckCircle2, Loader2, BookOpen, X } from "lucide-react";
import { toast } from "sonner";

const FIELDS = [
  { key: "store_brand",       label: "Store Brand",      color: "#3b82f6" },
  { key: "store_location",    label: "Store Location",   color: "#8b5cf6" },
  { key: "transaction_date",  label: "Date",             color: "#f59e0b" },
  { key: "transaction_type",  label: "Transaction Type", color: "#ec4899" },
  { key: "tender_type",       label: "Tender Type",      color: "#10b981" },
  { key: "amount",            label: "Amount",           color: "#ef4444" },
  { key: "last_four_digits",  label: "Last 4 Digits",    color: "#6366f1" },
];

function AnnotationCanvas({ imageUrl, regions, onRegionsChange }) {
  const containerRef = useRef(null);
  const [drawing, setDrawing] = useState(null);
  const [activeField, setActiveField] = useState(FIELDS[0].key);
  const [imgNaturalSize, setImgNaturalSize] = useState(null);
  const imgRef = useRef(null);

  const toPercent = (val, dim) => (val / dim) * 100;

  const getPos = (e) => {
    const rect = containerRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: Math.max(0, Math.min(clientX - rect.left, rect.width)),
      y: Math.max(0, Math.min(clientY - rect.top, rect.height)),
      w: rect.width,
      h: rect.height,
    };
  };

  const onMouseDown = (e) => {
    e.preventDefault();
    const pos = getPos(e);
    setDrawing({ startX: pos.x, startY: pos.y, curX: pos.x, curY: pos.y, w: pos.w, h: pos.h });
  };

  const onMouseMove = (e) => {
    if (!drawing) return;
    const pos = getPos(e);
    setDrawing(d => ({ ...d, curX: pos.x, curY: pos.y }));
  };

  const onMouseUp = () => {
    if (!drawing) return;
    const { startX, startY, curX, curY, w, h } = drawing;
    const x = Math.min(startX, curX);
    const y = Math.min(startY, curY);
    const width = Math.abs(curX - startX);
    const height = Math.abs(curY - startY);
    if (width > 5 && height > 5) {
      const field = FIELDS.find(f => f.key === activeField);
      const newRegion = {
        field: activeField,
        label: field.label,
        x: toPercent(x, w),
        y: toPercent(y, h),
        width: toPercent(width, w),
        height: toPercent(height, h),
      };
      onRegionsChange([...regions, newRegion]);
    }
    setDrawing(null);
  };

  const removeRegion = (idx) => {
    onRegionsChange(regions.filter((_, i) => i !== idx));
  };

  const getColor = (fieldKey) => FIELDS.find(f => f.key === fieldKey)?.color || "#666";

  const drawBox = drawing
    ? {
        left: `${toPercent(Math.min(drawing.startX, drawing.curX), drawing.w)}%`,
        top: `${toPercent(Math.min(drawing.startY, drawing.curY), drawing.h)}%`,
        width: `${toPercent(Math.abs(drawing.curX - drawing.startX), drawing.w)}%`,
        height: `${toPercent(Math.abs(drawing.curY - drawing.startY), drawing.h)}%`,
        borderColor: getColor(activeField),
      }
    : null;

  return (
    <div className="space-y-3">
      {/* Field selector */}
      <div className="flex flex-wrap gap-2">
        {FIELDS.map(f => (
          <button
            key={f.key}
            onClick={() => setActiveField(f.key)}
            className={`text-xs px-3 py-1.5 rounded-full border-2 font-medium transition-all ${activeField === f.key ? 'text-white shadow-md scale-105' : 'bg-white opacity-70 hover:opacity-100'}`}
            style={{
              borderColor: f.color,
              backgroundColor: activeField === f.key ? f.color : undefined,
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">Select a field above, then drag to highlight that area on the receipt.</p>

      {/* Image canvas */}
      <div
        ref={containerRef}
        className="relative select-none rounded-xl overflow-hidden border-2 border-dashed border-border cursor-crosshair"
        style={{ userSelect: "none" }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <img
          ref={imgRef}
          src={imageUrl}
          alt="Receipt"
          className="w-full block pointer-events-none"
          draggable={false}
        />

        {/* Drawn regions */}
        {regions.map((r, i) => (
          <div
            key={i}
            className="absolute flex items-start"
            style={{
              left: `${r.x}%`, top: `${r.y}%`,
              width: `${r.width}%`, height: `${r.height}%`,
              border: `2px solid ${getColor(r.field)}`,
              backgroundColor: `${getColor(r.field)}22`,
            }}
          >
            <span
              className="text-[10px] font-bold px-1 text-white leading-tight"
              style={{ backgroundColor: getColor(r.field) }}
            >
              {FIELDS.find(f => f.key === r.field)?.label}
            </span>
            <button
              onMouseDown={e => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); removeRegion(i); }}
              className="ml-auto p-0.5 rounded text-white"
              style={{ backgroundColor: getColor(r.field) }}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </div>
        ))}

        {/* Live draw box */}
        {drawBox && (
          <div
            className="absolute border-2 border-dashed pointer-events-none"
            style={{ ...drawBox, backgroundColor: `${drawBox.borderColor}22` }}
          />
        )}
      </div>
    </div>
  );
}

function TemplateCard({ template, onDelete }) {
  const fieldCount = template.field_regions?.length || 0;
  return (
    <div className="bg-card border rounded-xl p-4 flex gap-4 items-start">
      {template.sample_image_url && (
        <img src={template.sample_image_url} alt={template.store_brand} className="w-16 h-20 object-cover rounded-lg border shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="font-semibold truncate">{template.store_brand}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{fieldCount} field{fieldCount !== 1 ? 's' : ''} annotated</p>
        <div className="flex flex-wrap gap-1 mt-2">
          {(template.field_regions || []).map((r, i) => {
            const f = FIELDS.find(f => f.key === r.field);
            return (
              <span key={i} className="text-[10px] px-1.5 py-0.5 rounded text-white font-medium" style={{ backgroundColor: f?.color || '#666' }}>
                {f?.label || r.field}
              </span>
            );
          })}
        </div>
        {template.notes && <p className="text-xs text-muted-foreground mt-2 italic">{template.notes}</p>}
      </div>
      <button onClick={() => onDelete(template.id)} className="text-muted-foreground hover:text-destructive transition-colors">
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function ReceiptTrainer() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [imageUrl, setImageUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [storeBrand, setStoreBrand] = useState("");
  const [notes, setNotes] = useState("");
  const [regions, setRegions] = useState([]);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef();

  const loadTemplates = async () => {
    const data = await base44.entities.ReceiptTemplate.list("-created_date", 50);
    setTemplates(data);
    setLoading(false);
  };

  useEffect(() => { loadTemplates(); }, []);

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setImageUrl(file_url);
    setUploading(false);
  };

  const handleSave = async () => {
    if (!storeBrand.trim()) { toast.error("Enter a store brand name"); return; }
    if (!imageUrl) { toast.error("Upload a receipt image first"); return; }
    if (regions.length === 0) { toast.error("Highlight at least one field region"); return; }
    setSaving(true);
    await base44.entities.ReceiptTemplate.create({
      store_brand: storeBrand.trim(),
      sample_image_url: imageUrl,
      field_regions: regions,
      notes: notes.trim() || undefined,
    });
    toast.success(`Template saved for "${storeBrand}"`);
    setImageUrl(null);
    setStoreBrand("");
    setNotes("");
    setRegions([]);
    setSaving(false);
    loadTemplates();
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this template?")) return;
    await base44.entities.ReceiptTemplate.delete(id);
    toast.success("Template deleted");
    loadTemplates();
  };

  const reset = () => {
    setImageUrl(null);
    setStoreBrand("");
    setNotes("");
    setRegions([]);
    if (fileRef.current) fileRef.current.value = "";
  };

  const annotatedFields = [...new Set(regions.map(r => r.field))];

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Receipt Trainer</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload a receipt and highlight where each data field appears. This helps the AI recognise the same layout in future receipts.
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
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. standard POS receipt layout" />
          </div>
        </div>

        {!imageUrl ? (
          <div
            onClick={() => !uploading && fileRef.current?.click()}
            className="border-2 border-dashed rounded-xl p-10 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all"
          >
            {uploading
              ? <Loader2 className="h-8 w-8 text-muted-foreground mx-auto mb-2 animate-spin" />
              : <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />}
            <p className="text-sm font-medium">{uploading ? "Uploading…" : "Click to upload receipt image"}</p>
            <p className="text-xs text-muted-foreground mt-1">JPG or PNG</p>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png" className="hidden" onChange={handleFileSelect} />
          </div>
        ) : (
          <div className="space-y-4">
            <AnnotationCanvas imageUrl={imageUrl} regions={regions} onRegionsChange={setRegions} />

            {/* Progress summary */}
            <div className="bg-muted/40 rounded-lg px-4 py-3 text-xs flex items-center justify-between flex-wrap gap-2">
              <div className="flex flex-wrap gap-1.5">
                {FIELDS.map(f => (
                  <span
                    key={f.key}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${annotatedFields.includes(f.key) ? 'text-white' : 'text-muted-foreground bg-background'}`}
                    style={annotatedFields.includes(f.key) ? { backgroundColor: f.color, borderColor: f.color } : { borderColor: '#ccc' }}
                  >
                    {annotatedFields.includes(f.key) ? '✓ ' : ''}{f.label}
                  </span>
                ))}
              </div>
              <span className="text-muted-foreground">{annotatedFields.length}/{FIELDS.length} fields annotated</span>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Template
              </Button>
              <Button variant="outline" onClick={reset}>Start Over</Button>
            </div>
          </div>
        )}
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