import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { FileText, Clock, CheckCircle2, AlertCircle, Loader2, Copy } from "lucide-react"
import moment from "moment";
import { duplicateDocument } from "@/lib/duplicateDocument";

const statusConfig = {
  pending: { icon: Clock, className: "text-amber-600", label: "Pending" },
  processing: { icon: Loader2, className: "text-blue-600", label: "Processing" },
  needs_review: { icon: AlertCircle, className: "text-purple-600", label: "Review" },
  completed: { icon: CheckCircle2, className: "text-emerald-600", label: "Done" },
  failed: { icon: AlertCircle, className: "text-red-600", label: "Failed" },
};

function DuplicateBtn({ doc }) {
  const [duplicating, setDuplicating] = useState(false);
  return (
    <button
      onClick={async () => { setDuplicating(true); await duplicateDocument(doc); setDuplicating(false); }}
      disabled={duplicating}
      title="Duplicate to file elsewhere"
      className="flex items-center gap-1 px-2 py-1 rounded-md bg-violet-100 text-violet-700 hover:bg-violet-200 transition-colors text-[11px] font-medium"
    >
      {duplicating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Copy className="h-3 w-3" />}
      <span className="hidden lg:inline">Duplicate</span>
    </button>
  );
}

const fileTypeColors = {
  pdf: "bg-red-100 text-red-700",
  docx: "bg-blue-100 text-blue-700",
  xlsx: "bg-green-100 text-green-700",
  pptx: "bg-orange-100 text-orange-700",
  txt: "bg-gray-100 text-gray-700",
  jpg: "bg-purple-100 text-purple-700",
  png: "bg-purple-100 text-purple-700",
};

export default function DocumentListView({ documents, categories, selectedIds = [], onToggleSelect }) {
  const [previewDocId, setPreviewDocId] = React.useState(null);
  const previewDoc = previewDocId ? documents.find(d => d.id === previewDocId) : null;

  return (
    <div className="flex gap-4">
      {/* List */}
      <div className="flex-1 bg-card rounded-xl border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/30">
            <th className="w-10 px-4 py-3" />
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Category</th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Type</th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Date</th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
            <th className="w-10 px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {documents.map((doc, i) => {
            const status = statusConfig[doc.processing_status] || statusConfig.pending;
            const StatusIcon = status.icon;
            const category = categories.find(c => c.id === doc.category_id);
            const typeColor = fileTypeColors[doc.file_type] || "bg-gray-100 text-gray-700";
            const isSelected = selectedIds.includes(doc.id);
            const isCompleted = doc.processing_status === 'completed';

            return (
              <tr key={doc.id} className={`border-b last:border-0 hover:bg-muted/20 transition-colors cursor-pointer ${isSelected ? 'bg-primary/5' : i % 2 === 0 ? '' : 'bg-muted/10'}`} onMouseEnter={() => setPreviewDocId(doc.id)}>
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => onToggleSelect && onToggleSelect(doc.id)}
                    className={`h-5 w-5 rounded border-2 flex items-center justify-center transition-all shadow-sm ${
                      isSelected ? 'bg-primary border-primary' : 'border-slate-400 bg-muted hover:border-primary'
                    }`}
                  >
                    {isSelected && (
                      <svg className="h-3 w-3 text-primary-foreground" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <Link to={`/documents/${doc.id}`} className="flex items-center gap-2.5 group">
                    {doc.preview_url ? (
                      <img src={doc.preview_url} alt="preview" className="h-6 w-6 rounded object-cover flex-shrink-0" />
                    ) : (
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <span className="font-medium group-hover:text-primary transition-colors truncate max-w-xs">{doc.title}</span>
                  </Link>
                </td>
                <td className="px-4 py-3 hidden md:table-cell">
                  {category ? <Badge variant="secondary" className="text-xs">{category.name}</Badge> : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-3 hidden sm:table-cell">
                  {doc.file_type ? (
                    <span className={`text-xs px-2 py-0.5 rounded font-medium uppercase ${typeColor}`}>{doc.file_type}</span>
                  ) : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">
                  {doc.document_date ? moment(doc.document_date).format("D MMM YYYY") : moment(doc.created_date).format("D MMM YYYY")}
                </td>
                <td className="px-4 py-3">
                  <span className={`flex items-center gap-1 ${status.className}`}>
                    <StatusIcon className={`h-3.5 w-3.5 ${doc.processing_status === 'processing' ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline text-xs">{status.label}</span>
                  </span>
                </td>
                <td className="px-2 py-3" onClick={e => e.stopPropagation()}>
                  {isCompleted && (
                    <DuplicateBtn doc={doc} />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>

      {/* Always-visible preview panel */}
      <div className="w-48 shrink-0 bg-card rounded-xl border p-3 flex flex-col gap-2 sticky top-0 h-fit">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Preview</p>
        {previewDoc ? (
          <>
            {previewDoc.preview_url ? (
              <img src={previewDoc.preview_url} alt={previewDoc.title} className="w-full h-auto rounded-lg border bg-muted object-cover max-h-64" />
            ) : (
              <div className="w-full h-40 rounded-lg border bg-muted flex items-center justify-center text-muted-foreground">
                <FileText className="h-8 w-8" />
              </div>
            )}
            <div className="text-xs space-y-1">
              <p className="font-medium truncate">{previewDoc.title}</p>
              <p className="text-muted-foreground truncate">{previewDoc.original_filename}</p>
            </div>
          </>
        ) : (
          <div className="w-full h-40 rounded-lg border bg-muted flex items-center justify-center text-muted-foreground">
            <FileText className="h-8 w-8" />
          </div>
        )}
      </div>
    </div>
  );
}