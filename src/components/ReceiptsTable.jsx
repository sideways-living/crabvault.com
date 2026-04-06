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
  const s = String(d).replace(/-/g, "");
  if (s.length === 8) return `${s.slice(6,8)}/${s.slice(4,6)}/${s.slice(0,4)}`;
  return d;
}

// Merge a Transaction record with a Document's ai_data, preferring Transaction fields
function mergeReceiptData(doc, txn) {
  const ai = doc.ai_data || {};
  const t = txn || {};
  return {
    id: doc.id,
    document_id: doc.id,
    doc,
    store_brand: t.store_brand || ai.store_brand || ai.vendor_name || "",
    store_location: t.store_location || ai.store_location || "",
    transaction_date: t.transaction_date || ai.transaction_date || doc.document_date || "",
    transaction_time: t.transaction_time || ai.transaction_time || "",
    transaction_type: t.transaction_type || ai.transaction_type || "",
    tender_type: t.tender_type || ai.tender_type || "",
    amount: t.amount ?? ai.amount ?? null,
    subtotal: t.subtotal ?? ai.subtotal ?? null,
    tax_amount: t.tax_amount ?? ai.tax_amount ?? null,
    last_four_digits: t.last_four_digits || ai.last_four_digits || "",
    receipt_number: t.receipt_number || ai.receipt_number || "",
    items: t.items || ai.items || [],
  };
}

export default function ReceiptsTable() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    Promise.all([
      base44.entities.Document.list("-created_date", 1000),
      base44.entities.Transaction.list("-created_date", 1000),
      base44.entities.Folder.list(),
    ]).then(([docs, txns, folders]) => {
      // Find all receipt folder IDs (Receipts root + children)
      const receiptsRoot = folders.find(f => f.name.toLowerCase() === "receipts" && !f.parent_folder_id);
      const receiptFolderIds = new Set();
      if (receiptsRoot) {
        receiptFolderIds.add(receiptsRoot.id);
        folders.forEach(f => { if (f.parent_folder_id === receiptsRoot.id) receiptFolderIds.add(f.id); });
      }

      const txnByDocId = Object.fromEntries(txns.map(t => [t.document_id, t]));

      // Include docs that are receipts (ai_data.is_receipt) OR in receipt folders
      const receiptDocs = docs.filter(d =>
        !d.is_deleted &&
        (d.ai_data?.is_receipt === true || receiptFolderIds.has(d.folder_id))
      );

      setRows(receiptDocs.map(d => mergeReceiptData(d, txnByDocId[d.id])));
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return rows;
    return rows.filter(r => {
      const fields = [
        r.store_brand, r.store_location, r.transaction_date, r.transaction_time,
        r.transaction_type, r.tender_type, r.receipt_number, r.last_four_digits,
        r.amount != null ? String(r.amount) : "",
        r.doc?.title, r.doc?.original_filename,
        ...(r.items || []).map(i => i.name),
      ].filter(Boolean).map(s => s.toLowerCase());
      return fields.some(f => f.includes(q));
    });
  }, [rows, search]);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  if (rows.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Receipt className="h-8 w-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">No receipts found</p>
        <p className="text-xs mt-1">Receipts will appear here once documents are processed</p>
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
              {filtered.map(r => {
                const isOpen = expanded === r.id;
                return (
                  <>
                    <tr
                      key={r.id}
                      className="hover:bg-muted/30 cursor-pointer transition-colors"
                      onClick={() => setExpanded(isOpen ? null : r.id)}
                    >
                      <td className="px-3 py-2.5 whitespace-nowrap font-mono text-xs">
                        <div>{fmtDate(r.transaction_date)}</div>
                        {r.transaction_time && <div className="text-muted-foreground">{r.transaction_time}</div>}
                      </td>
                      <td className="px-3 py-2.5 font-medium">{r.store_brand || "—"}</td>
                      <td className="px-3 py-2.5 text-muted-foreground text-xs">{r.store_location || "—"}</td>
                      <td className="px-3 py-2.5">
                        {r.transaction_type ? (
                          <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${TYPE_COLORS[r.transaction_type] || "bg-muted text-muted-foreground"}`}>
                            {r.transaction_type}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        <div>{TENDER_LABELS[r.tender_type] || r.tender_type || "—"}</div>
                        {r.last_four_digits && <div className="text-muted-foreground font-mono">••{r.last_four_digits}</div>}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs">{fmt(r.subtotal)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs">{fmt(r.tax_amount)}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-semibold">{fmt(r.amount)}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground font-mono">{r.receipt_number || "—"}</td>
                      <td className="px-3 py-2.5 text-center">
                        <Link to={`/documents/${r.doc.id}`} onClick={e => e.stopPropagation()} className="text-primary hover:text-primary/80">
                          <ExternalLink className="h-3.5 w-3.5 inline" />
                        </Link>
                      </td>
                    </tr>
                    {isOpen && (r.items || []).length > 0 && (
                      <tr key={`${r.id}-items`} className="bg-amber-50/40">
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
                              {r.items.map((item, i) => (
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