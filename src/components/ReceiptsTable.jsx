import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { ExternalLink, Search, Loader2, Receipt } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Link } from "react-router-dom";

const TENDER_LABELS = {
  cash: "Cash", mastercard: "Mastercard", visa: "Visa", amex: "Amex",
  eftpos: "EFTPOS", gift_voucher: "Gift Voucher", exchange_voucher: "Exchange Voucher", other: "Other"
};

const TYPE_COLORS = {
  purchase: "text-emerald-700 bg-emerald-50",
  return: "text-red-700 bg-red-50",
  exchange: "text-blue-700 bg-blue-50"
};

function fmt(num) {
  if (num == null) return "—";
  return `$${Number(num).toFixed(2)}`;
}

function fmtDate(d) {
  if (!d) return "—";
  if (d.length === 8) return `${d.slice(6,8)}/${d.slice(4,6)}/${d.slice(0,4)}`;
  return d;
}

export default function ReceiptsTable() {
  const [transactions, setTransactions] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    Promise.all([
      base44.entities.Transaction.list("-created_date", 500),
      base44.entities.Document.filter({ processing_status: "completed" }, "-created_date", 500),
    ]).then(([txns, docs]) => {
      setTransactions(txns);
      setDocuments(docs);
      setLoading(false);
    });
  }, []);

  const docMap = useMemo(() => Object.fromEntries(documents.map(d => [d.id, d])), [documents]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return transactions;
    return transactions.filter(t => {
      const doc = docMap[t.document_id];
      const fields = [
        t.store_brand, t.store_location, t.transaction_date, t.transaction_time,
        t.transaction_type, t.tender_type, t.receipt_number, t.last_four_digits,
        t.amount != null ? String(t.amount) : "",
        t.subtotal != null ? String(t.subtotal) : "",
        t.tax_amount != null ? String(t.tax_amount) : "",
        doc?.title, doc?.original_filename,
        ...(t.items || []).map(i => i.name),
      ].filter(Boolean).map(s => s.toLowerCase());
      return fields.some(f => f.includes(q));
    });
  }, [transactions, search, docMap]);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  if (transactions.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Receipt className="h-8 w-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">No receipts yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search store, date, item, amount, receipt #…"
          className="pl-9"
        />
      </div>

      <div className="text-xs text-muted-foreground">{filtered.length} receipt{filtered.length !== 1 ? "s" : ""}</div>

      <div className="rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground uppercase tracking-wide">
              <tr>
                <th className="text-left px-3 py-2.5 font-medium">Date</th>
                <th className="text-left px-3 py-2.5 font-medium">Store</th>
                <th className="text-left px-3 py-2.5 font-medium">Location</th>
                <th className="text-left px-3 py-2.5 font-medium">Type</th>
                <th className="text-left px-3 py-2.5 font-medium">Payment</th>
                <th className="text-right px-3 py-2.5 font-medium">Subtotal</th>
                <th className="text-right px-3 py-2.5 font-medium">Tax</th>
                <th className="text-right px-3 py-2.5 font-medium">Total</th>
                <th className="text-left px-3 py-2.5 font-medium">Receipt #</th>
                <th className="text-center px-3 py-2.5 font-medium">Doc</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(t => {
                const doc = docMap[t.document_id];
                const isOpen = expanded === t.id;
                return (
                  <>
                    <tr
                      key={t.id}
                      className="hover:bg-muted/30 cursor-pointer transition-colors"
                      onClick={() => setExpanded(isOpen ? null : t.id)}
                    >
                      <td className="px-3 py-2.5 whitespace-nowrap font-mono text-xs">
                        <div>{fmtDate(t.transaction_date)}</div>
                        {t.transaction_time && <div className="text-muted-foreground">{t.transaction_time}</div>}
                      </td>
                      <td className="px-3 py-2.5 font-medium">{t.store_brand || "—"}</td>
                      <td className="px-3 py-2.5 text-muted-foreground text-xs">{t.store_location || "—"}</td>
                      <td className="px-3 py-2.5">
                        {t.transaction_type ? (
                          <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${TYPE_COLORS[t.transaction_type] || "bg-muted text-muted-foreground"}`}>
                            {t.transaction_type}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        <div>{TENDER_LABELS[t.tender_type] || t.tender_type || "—"}</div>
                        {t.last_four_digits && <div className="text-muted-foreground font-mono">••{t.last_four_digits}</div>}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs">{fmt(t.subtotal)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs">{fmt(t.tax_amount)}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-semibold">{fmt(t.amount)}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground font-mono">{t.receipt_number || "—"}</td>
                      <td className="px-3 py-2.5 text-center">
                        {doc ? (
                          <Link to={`/documents/${doc.id}`} onClick={e => e.stopPropagation()} className="text-primary hover:text-primary/80">
                            <ExternalLink className="h-3.5 w-3.5 inline" />
                          </Link>
                        ) : "—"}
                      </td>
                    </tr>
                    {isOpen && (t.items || []).length > 0 && (
                      <tr key={`${t.id}-items`} className="bg-amber-50/40">
                        <td colSpan={10} className="px-6 py-3">
                          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">Line Items</p>
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-muted-foreground">
                                <th className="text-left pb-1 font-medium">Item</th>
                                <th className="text-right pb-1 font-medium w-12">Qty</th>
                                <th className="text-right pb-1 font-medium w-20">Unit</th>
                                <th className="text-right pb-1 font-medium w-20">Total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-amber-100">
                              {t.items.map((item, i) => (
                                <tr key={i}>
                                  <td className="py-1">{item.name || "—"}</td>
                                  <td className="py-1 text-right text-muted-foreground">{item.quantity ?? ""}</td>
                                  <td className="py-1 text-right font-mono">{fmt(item.unit_price)}</td>
                                  <td className="py-1 text-right font-mono font-medium">{fmt(item.total_price)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}