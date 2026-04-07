import { useRef, useState } from "react";
import { X } from "lucide-react";

export default function AnnotationCanvas({ imageUrl, regions, onRegionsChange, fields }) {
  const containerRef = useRef(null);
  const [drawing, setDrawing] = useState(null);
  const [activeField, setActiveField] = useState(fields[0].key);

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
      const field = fields.find(f => f.key === activeField);
      onRegionsChange([...regions, {
        field: activeField,
        label: field.label,
        x: toPercent(x, w),
        y: toPercent(y, h),
        width: toPercent(width, w),
        height: toPercent(height, h),
      }]);
    }
    setDrawing(null);
  };

  const removeRegion = (idx) => onRegionsChange(regions.filter((_, i) => i !== idx));
  const getColor = (fieldKey) => fields.find(f => f.key === fieldKey)?.color || "#666";
  const annotatedFields = [...new Set(regions.map(r => r.field))];

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
      <div className="flex flex-wrap gap-1.5">
        {fields.map(f => (
          <button
            key={f.key}
            onClick={() => setActiveField(f.key)}
            className={`text-xs px-2.5 py-1 rounded-full border-2 font-medium transition-all ${activeField === f.key ? 'text-white shadow scale-105' : 'bg-white opacity-60 hover:opacity-100'}`}
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

      {/* Canvas */}
      <div className="rounded-xl overflow-y-auto border-2 border-dashed border-border" style={{ maxHeight: 600 }}>
        <div
          ref={containerRef}
          className="relative select-none cursor-crosshair"
          style={{ userSelect: "none" }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
        >
          {(imageUrl?.toLowerCase().endsWith('.pdf') || imageUrl?.includes('application/pdf') || imageUrl?.includes('.pdf')) ? (
            <>
              <iframe src={imageUrl} title="Receipt PDF" className="w-full pointer-events-none" style={{ height: 600, display: 'block', border: 0 }} />
              <div className="absolute inset-0 cursor-crosshair" style={{ zIndex: 10 }} />
            </>
          ) : (
            <img src={imageUrl} alt="Receipt" className="w-full block pointer-events-none" draggable={false} />
          )}

          {regions.map((r, i) => (
            <div
              key={i}
              className="absolute border-2 group"
              style={{ left: `${r.x}%`, top: `${r.y}%`, width: `${r.width}%`, height: `${r.height}%`, borderColor: getColor(r.field), backgroundColor: `${getColor(r.field)}22` }}
            >
              <button
                onClick={() => removeRegion(i)}
                className="absolute -top-2 -right-2 bg-white rounded-full shadow text-xs w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ color: getColor(r.field) }}
              >
                <X className="w-2.5 h-2.5" />
              </button>
              <span className="absolute bottom-0.5 left-0.5 text-[9px] font-bold px-0.5 rounded text-white" style={{ backgroundColor: getColor(r.field) }}>
                {fields.find(f => f.key === r.field)?.label}
              </span>
            </div>
          ))}

          {drawBox && (
            <div
              className="absolute border-2 border-dashed pointer-events-none"
              style={{ ...drawBox, backgroundColor: `${drawBox.borderColor}22` }}
            />
          )}
        </div>
      </div>

      {/* Progress chips */}
      <div className="flex flex-wrap gap-1">
        {fields.map(f => (
          <span
            key={f.key}
            className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${annotatedFields.includes(f.key) ? 'text-white' : 'text-muted-foreground bg-background'}`}
            style={annotatedFields.includes(f.key) ? { backgroundColor: f.color, borderColor: f.color } : { borderColor: '#ccc' }}
          >
            {annotatedFields.includes(f.key) ? '✓ ' : ''}{f.label}
          </span>
        ))}
      </div>
    </div>
  );
}