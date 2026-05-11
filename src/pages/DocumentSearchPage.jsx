import { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Search, FileText, Loader2, Tag, CalendarDays, ScanText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const CATEGORY_COLORS = {
  correspondence: "bg-blue-50 text-blue-700",
  evidence: "bg-purple-50 text-purple-700",
  receipt: "bg-amber-50 text-amber-700",
  id: "bg-green-50 text-green-700",
  legal: "bg-red-50 text-red-700",
  medical: "bg-pink-50 text-pink-700",
  financial: "bg-emerald-50 text-emerald-700",
  other: "bg-gray-50 text-gray-600",
};

function highlight(text, query) {
  if (!text || !query) return text;
  const terms = query.trim().split(/\s+/).filter(Boolean);
  const escaped = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return parts.map((part, i) =>
    terms.some(t => part.toLowerCase() === t.toLowerCase())
      ? <mark key={i} className="bg-yellow-200 text-yellow-900 rounded px-0.5">{part}</mark>
      : part
  );
}

export default function DocumentSearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [extractingId, setExtractingId] = useState(null);
  const inputRef = useRef(null);

  const handleSearch = async (e) => {
    e?.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await base44.functions.invoke("searchDocuments", { query: query.trim(), limit: 100 });
      setResults(res.data.results);
      setTotal(res.data.total);
    } catch {
      toast.error("Search failed");
    } finally {
      setLoading(false);
    }
  };

  const handleExtractText = async (doc) => {
    setExtractingId(doc.id);
    try {
      await base44.functions.invoke("extractDocumentText", { document_id: doc.id });
      toast.success("Text extracted — re-run your search to see updated results");
    } catch {
      toast.error("Text extraction failed");
    } finally {
      setExtractingId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Full-Text Search</h1>
        <p className="text-sm text-muted-foreground mt-1">Search inside document content, receipts, contracts and more</p>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search document text… e.g. Woolworths, lease agreement, invoice"
            className="pl-9"
            autoFocus
          />
        </div>
        <Button type="submit" disabled={loading || !query.trim()} className="gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Search
        </Button>
      </form>

      {results === null && !loading && (
        <div className="text-center py-16 text-muted-foreground">
          <Search className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm">Enter keywords to search inside document text</p>
          <p className="text-xs mt-1 opacity-60">Only documents that have been processed and have extracted text will appear</p>
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {results !== null && !loading && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {total === 0 ? "No results found" : `${total} result${total !== 1 ? "s" : ""} — showing top ${results.length}`}
          </p>

          {results.length === 0 && (
            <div className="text-center py-12 text-muted-foreground border rounded-xl">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-20" />
              <p className="text-sm">No documents matched "<strong>{query}</strong>"</p>
              <p className="text-xs mt-1 opacity-60">Try different keywords, or extract text from more documents first</p>
            </div>
          )}

          {results.map(doc => (
            <div key={doc.id} className="border rounded-xl p-4 space-y-2 hover:bg-muted/20 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <Link to={`/crab-documents/${doc.id}`} className="font-semibold text-sm hover:text-primary transition-colors">
                    {highlight(doc.title, query)}
                  </Link>
                  {doc.original_filename && (
                    <p className="text-[11px] font-mono text-muted-foreground truncate mt-0.5">{doc.original_filename}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {doc.category && (
                    <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${CATEGORY_COLORS[doc.category] || ""}`}>
                      {doc.category}
                    </span>
                  )}
                  {doc.document_date && (
                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                      <CalendarDays className="h-3 w-3" /> {doc.document_date}
                    </span>
                  )}
                </div>
              </div>

              {doc.snippet && (
                <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 font-mono leading-relaxed">
                  {highlight(doc.snippet, query)}
                </p>
              )}

              {!doc.snippet && doc.summary && (
                <p className="text-xs text-muted-foreground italic">{highlight(doc.summary, query)}</p>
              )}

              {!doc.snippet && !doc.summary && (
                <div className="flex items-center gap-2">
                  <p className="text-xs text-muted-foreground italic">No extracted text — matched on title/tags/summary</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[10px] px-2 gap-1"
                    onClick={() => handleExtractText(doc)}
                    disabled={extractingId === doc.id}
                  >
                    {extractingId === doc.id
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <ScanText className="h-3 w-3" />}
                    Extract Text
                  </Button>
                </div>
              )}

              {doc.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  <Tag className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
                  {doc.tags.map(t => (
                    <span key={t} className="text-[10px] bg-secondary px-1.5 py-0.5 rounded-full">{t}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}