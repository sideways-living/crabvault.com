import { Link } from "react-router-dom";
import { FileText, Clock, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import moment from "moment";

const statusConfig = {
  pending: { icon: Clock, label: "Pending", className: "bg-amber-100 text-amber-700" },
  processing: { icon: Loader2, label: "Processing", className: "bg-blue-100 text-blue-700" },
  completed: { icon: CheckCircle2, label: "Completed", className: "bg-emerald-100 text-emerald-700" },
  failed: { icon: AlertCircle, label: "Failed", className: "bg-red-100 text-red-700" },
};

export default function DocumentCard({ document, categories, selected, onToggleSelect }) {
  const status = statusConfig[document.processing_status] || statusConfig.pending;
  const StatusIcon = status.icon;
  const category = categories?.find(c => c.id === document.category_id);

  return (
    <div className={`relative group bg-card rounded-xl border overflow-hidden hover:shadow-lg transition-all duration-300 ${selected ? 'border-primary ring-1 ring-primary' : 'hover:border-primary/20'}`}>
      {/* Preview thumbnail */}
      {document.preview_url && (
        <div className="w-full h-32 bg-muted overflow-hidden">
          <img src={document.preview_url} alt={document.title} className="w-full h-full object-cover" />
        </div>
      )}

      {/* Checkbox */}
      <button
        onClick={() => onToggleSelect && onToggleSelect(document.id)}
        className={`absolute top-3 left-3 z-10 h-5 w-5 rounded border-2 flex items-center justify-center transition-all shadow-sm ${
          selected ? 'bg-primary border-primary' : 'border-slate-400 bg-white hover:border-primary'
        }`}
      >
        {selected && (
          <svg className="h-3 w-3 text-primary-foreground" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </button>

      <Link to={`/documents/${document.id}`} className="block p-4">
        <div className="flex items-start gap-3">
          {!document.preview_url && (
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
              <FileText className="h-5 w-5 text-primary" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-sm truncate group-hover:text-primary transition-colors">
              {document.title}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {document.original_filename || "No file"}
            </p>
          </div>
        </div>

        {document.summary && (
          <p className="text-xs text-muted-foreground mt-3 line-clamp-2 leading-relaxed">
            {document.summary}
          </p>
        )}

        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium ${status.className}`}>
            <StatusIcon className={`h-3 w-3 ${document.processing_status === 'processing' ? 'animate-spin' : ''}`} />
            {status.label}
          </span>
          {category && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground font-medium">
              {category.name}
            </span>
          )}
          {document.tags?.slice(0, 2).map(tag => (
            <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              {tag}
            </span>
          ))}
        </div>

        <p className="text-[10px] text-muted-foreground/60 mt-3">
          {moment(document.created_date).fromNow()}
        </p>
      </Link>
    </div>
  );
}