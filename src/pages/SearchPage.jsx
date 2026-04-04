import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Search, SlidersHorizontal, FileText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import DocumentCard from "../components/DocumentCard";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [documents, setDocuments] = useState([]);
  const [categories, setCategories] = useState([]);
  const [results, setResults] = useState([]);
  const [searched, setSearched] = useState(false);
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [docs, cats] = await Promise.all([
        base44.entities.Document.list("-created_date", 500),
        base44.entities.Category.list(),
      ]);
      setDocuments(docs);
      setCategories(cats);
      setLoading(false);
    };
    load();
  }, []);

  const handleSearch = () => {
    if (!query.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    setSearched(true);
    const q = query.toLowerCase();

    const scored = documents.map(doc => {
      let score = 0;
      if (doc.title?.toLowerCase().includes(q)) score += 10;
      if (doc.summary?.toLowerCase().includes(q)) score += 8;
      if (doc.extracted_text?.toLowerCase().includes(q)) score += 6;
      if (doc.tags?.some(t => t.toLowerCase().includes(q))) score += 5;
      if (doc.original_filename?.toLowerCase().includes(q)) score += 3;
      if (doc.notes?.toLowerCase().includes(q)) score += 2;
      return { ...doc, _score: score };
    }).filter(d => d._score > 0);

    let filtered = scored;
    if (filterCategory !== "all") filtered = filtered.filter(d => d.category_id === filterCategory);
    if (filterType !== "all") filtered = filtered.filter(d => d.file_type === filterType);

    filtered.sort((a, b) => b._score - a._score);
    setResults(filtered);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSearch();
  };

  const allTags = [...new Set(documents.flatMap(d => d.tags || []))];
  const popularTags = allTags.slice(0, 12);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
        <p className="text-sm text-muted-foreground mt-1">Search across all documents, summaries, and tags</p>
      </div>

      {/* Search bar */}
      <div className="bg-card rounded-xl border p-6">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search documents, summaries, tags, content..."
              className="pl-10 h-11"
            />
          </div>
          <Button onClick={handleSearch} className="h-11 px-6">Search</Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mt-4">
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="sm:w-48">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="sm:w-48">
              <SelectValue placeholder="File Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="pdf">PDF</SelectItem>
              <SelectItem value="docx">DOCX</SelectItem>
              <SelectItem value="xlsx">XLSX</SelectItem>
              <SelectItem value="txt">TXT</SelectItem>
              <SelectItem value="jpg">JPG</SelectItem>
              <SelectItem value="png">PNG</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Popular tags */}
        {popularTags.length > 0 && !searched && (
          <div className="mt-4">
            <p className="text-xs text-muted-foreground mb-2">Popular tags:</p>
            <div className="flex flex-wrap gap-1.5">
              {popularTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => { setQuery(tag); }}
                  className="text-xs px-2.5 py-1 rounded-full bg-muted hover:bg-primary/10 hover:text-primary transition-colors"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      {searched && (
        <div>
          <p className="text-sm text-muted-foreground mb-4">
            {results.length} result{results.length !== 1 ? 's' : ''} for "{query}"
          </p>
          {results.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {results.map(doc => (
                <DocumentCard key={doc.id} document={doc} categories={categories} />
              ))}
            </div>
          ) : (
            <div className="bg-card rounded-xl border p-12 text-center">
              <FileText className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No documents found matching your search.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}