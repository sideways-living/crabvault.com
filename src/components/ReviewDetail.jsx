import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import HierarchicalFolderPicker from "./HierarchicalFolderPicker";
import {
  Loader2, Save, Trash2, FileText, ExternalLink,
  GitMerge, AlertTriangle, FolderOpen,
  X, Pencil, FileCheck, RefreshCw
} from "lucide-react";
import FolderSelect from "./FolderSelect";
import { toast } from "sonner";

// ─── Document Preview ─────────────────────────────────────────────────────────
function DocPreview({ doc }) {
  const type = (doc.file_type || "").toLowerCase();
  const isImage = ["jpg", "jpeg", "png", "gif", "webp"].includes(type);
  const isPdf = type === "pdf";

  if (!doc.file_url) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <FileText className="h-20 w-20 opacity-20" />
        <p className="text-sm">No file available</p>
      </div>
    );
  }
  if (isImage) {
    return <img src={doc.file_url} alt={doc.title} className="w-full h-full object-contain" />;
  }
  if (isPdf) {
    return <iframe src={doc.file_url} title={doc.title} className="w-full h-full border-0" style={{ display: "block" }} />;
  }
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
      <FileText className="h-16 w-16 opacity-30" />
      <p className="text-sm font-medium">{doc.original_filename}</p>
      <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-1.5 text-sm text-primary hover:underline">
        <ExternalLink className="h-4 w-4" /> Open file externally
      </a>
    </div>
  );
}

// ─── Info Row ─────────────────────────────────────────────────────────────────
function InfoRow({ label, value, mono }) {
  if (!value && value !== 0) return null;
  return (
    <tr className="border-b border-border/30 last:border-0">
      <td className="py-2 pr-4 text-xs text-muted-foreground font-medium whitespace-nowrap w-32">{label}</td>
      <td className={`py-2 text-sm text-foreground ${mono ? "font-mono" : ""}`}>{value}</td>
    </tr>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ReviewDetail({ doc, folders, categories, duplicates = [], onConfirmed }) {
  const ai = doc.ai_data || {};
  const isReceipt = !!ai.is_receipt;
  const [mode, setMode] = useState("review");

  const [title, setTitle] = useState(doc.title || "");
  const [folderId, setFolderId] = useState(doc.folder_id || "");
  const [categoryId, setCategoryId] = useState(doc.category_id || "");
  const [summary, setSummary] = useState(doc.summary || "");
  const [tags, setTags] = useState((doc.tags || []).join(", "));
  const [docDate, setDocDate] = useState(doc.document_date || "");
  const [notes, setNotes] = useState(doc.notes || "");
  const [vaultPath, setVaultPath] = useState(doc.vault_path || "");

  const [storeBrand, setStoreBrand] = useState(ai.store_brand || ai.vendor_name || "");
  const [storeLocation, setStoreLocation] = useState(ai.store_location || "");
  const [txDate, setTxDate] = useState(ai.transaction_date || "");
  const [txTime, setTxTime] = useState(ai.transaction_time || "");
  const [txType, setTxType] = useState(ai.transaction_type || "purchase");
  const [tenderType, setTenderType] = useState(ai.tender_type || "other");
  const [amount, setAmount] = useState(ai.amount != null ? String(ai.amount) : "");
  const [lastFour, setLastFour] = useState(ai.last_four_digits || "");
  const [items, setItems] = useState(ai.items || []);
  const [subtotal, setSubtotal] = useState(ai.subtotal != null ? String(ai.subtotal) : "");
  const [taxAmount, setTaxAmount] = useState(ai.tax_amount != null ? String(ai.tax_amount) : "");
  const [receiptNumber, setReceiptNumber] = useState(ai.receipt_number || "");

  const [saving, setSaving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [merging, setMerging] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [showFolderPicker, setShowFolderPicker] = useState(false);

  useEffect(() => {
    if (!folderId) return;
    const folder = folders.find(f => f.id === folderId);
    if (folder?.vault_path) {
      const ext = doc.original_filename?.includes(".") ? doc.original_filename.split(".").pop() : "";
      setVaultPath(`${folder.vault_path}/${title}${ext ? "." + ext : ""}`);
    }
  }, [folderId, title]);

  const folderObj = folders.find(f => f.id === folderId);
  const folderDisplay = folderObj?.path || folderObj?.name || "No folder assigned";
  const categoryObj = categories.find(c => c.id === categoryId);

  const handleAccept = async () => {
    setSaving(true);
    const oldFolderId = doc.folder_id;
    await base44.entities.Document.update(doc.id, {
      title,
      folder_id: folderId || undefined,
      category_id: categoryId || undefined,
      summary,
      tags: tags.split(",").map(t => t.trim()).filter(Boolean),
      document_date: docDate || undefined,
      notes,
      vault_path: vaultPath || undefined,
      processing_status: "completed",
    });
    if (isReceipt) {
      await base44.entities.Transaction.create({
        document_id: doc.id,
        store_brand: storeBrand,
        store_location: storeLocation,
        transaction_date: txDate,
        transaction_time: txTime || undefined,
        transaction_type: txType,
        tender_type: tenderType,
        amount: amount ? parseFloat(amount) : undefined,
        subtotal: subtotal ? parseFloat(subtotal) : undefined,
        tax_amount: taxAmount ? parseFloat(taxAmount) : undefined,
        receipt_number: receiptNumber || undefined,
        last_four_digits: lastFour || undefined,
        items: items.length ? items : undefined,
      });
    }
    if (folderId !== oldFolderId && (folderId || oldFolderId)) {
      await base44.entities.LearningLog.create({
        action_type: "document_refoldered",
        original_title: doc.title,
        new_title: title,
        original_folder_id: oldFolderId || "",
        new_folder_id: folderId || "",
        original_filename: doc.original_filename || "",
        new_filename: title,
        file_type: doc.file_type || "",
        is_receipt: isReceipt,
        vendor_name: storeBrand,
        document_date: txDate || docDate,
      });
    }
    toast.success(`"${title}" accepted`);
    setSaving(false);
    onConfirmed(doc.id);
  };

  const handleReject = async () => {
    if (!confirm("Mark this document as failed/rejected?")) return;
    setRejecting(true);
    await base44.entities.Document.update(doc.id, { processing_status: "failed" });
    setRejecting(false);
    toast.success("Document rejected");
    onConfirmed(doc.id);
  };

  const handleReprocess = async () => {
    if (!confirm("Reset this document and reprocess from scratch? All AI data will be cleared.")) return;
    setReprocessing(true);
    await base44.entities.Document.update(doc.id, {
      processing_status: "pending",
      ai_data: null,
      summary: null,
      tags: [],
      folder_id: null,
      category_id: null,
      vault_path: null,
      document_date: null,
    });
    setReprocessing(false);
    toast.success("Document reset — will be reprocessed");
    onConfirmed(doc.id);
  };

  const handleMergeAndDelete = async () => {
    if (!confirm(`Keep this document and delete ${duplicates.length} duplicate(s)?`)) return;
    setMerging(true);
    await Promise.all(duplicates.map(d => base44.entities.Document.delete(d.id)));
    setMerging(false);
    toast.success(`Deleted ${duplicates.length} duplicate(s)`);
    onConfirmed(duplicates.map(d => d.id));
  };

  const updateItem = (i, field, val) =>
    setItems(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: val } : item));
  const addItem = () =>
    setItems(prev => [...prev, { name: "", quantity: 1, unit_price: null, total_price: null }]);
  const removeItem = (i) =>
    setItems(prev => prev.filter((_, idx) => idx !== i));

  return (
    <div className="flex flex-col h-full bg-card border rounded-xl overflow-hidden">

      {/* ── Top row: preview + info ── */}
      <div className="flex flex-1 min-h-0">

        {/* LEFT: Document Preview */}
        <div className="flex flex-col border-r bg-zinc-50" style={{ width: "55%", minWidth: 0 }}>
          <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
            <DocPreview doc={doc} />
          </div>
          <div className="shrink-0 border-t px-4 py-2 bg-white flex items-center gap-2 text-xs text-muted-foreground">
            <FileText className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate font-mono">{doc.original_filename || doc.title}</span>
            {doc.file_type && (
              <span className="ml-auto uppercase font-semibold bg-muted px-1.5 py-0.5 rounded text-[10px] shrink-0">
                {doc.file_type}
              </span>
            )}
            {doc.file_url && (
              <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
                className="shrink-0 hover:text-primary transition-colors">
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </div>

        {/* RIGHT: Info panel */}
        <div className="flex flex-col" style={{ width: "45%", minWidth: 0 }}>

          {/* Duplicate warning */}
          {duplicates.length > 0 && (
            <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 bg-amber-50 border-b border-amber-200">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
              <p className="text-xs text-amber-800 flex-1">
                <strong>{duplicates.length} possible duplicate{duplicates.length > 1 ? "s" : ""}</strong> detected
              </p>
              <Button size="sm" variant="outline" onClick={handleMergeAndDelete} disabled={merging}
                className="text-xs h-7 gap-1 border-amber-300 text-amber-700 hover:bg-amber-100">
                {merging ? <Loader2 className="h-3 w-3 animate-spin" /> : <GitMerge className="h-3 w-3" />}
                Keep this, delete others
              </Button>
            </div>
          )}

          {/* Proposed filename & folder */}
          <div className="shrink-0 bg-primary/5 border-b px-5 py-4 space-y-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-primary mb-1">Proposed Filename</p>
              {mode === "review" ? (
                <p className="text-sm font-semibold text-foreground leading-snug break-all">{title || "—"}</p>
              ) : (
                <Input value={title} onChange={e => setTitle(e.target.value)} className="font-semibold text-sm h-8" />
              )}
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-primary mb-1">Destination Folder</p>
              {showFolderPicker ? (
                <HierarchicalFolderPicker
                  value={folderId}
                  onValueChange={setFolderId}
                  folders={folders}
                  onFolderCreated={() => {}}
                  onDone={() => {
                    setShowFolderPicker(false);
                  }}
                />
              ) : (
               <button
                 onClick={() => setShowFolderPicker(true)}
                 className="flex items-center gap-1.5 text-sm text-foreground hover:text-primary transition-colors"
                 disabled={mode !== "edit"}
               >
                 <FolderOpen className="h-4 w-4 text-primary shrink-0" />
                 <span className="font-medium">{folderDisplay}</span>
               </button>
              )}
              </div>
            {vaultPath && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Vault Path</p>
                {mode === "review" ? (
                  <p className="text-xs font-mono text-muted-foreground break-all">{vaultPath}</p>
                ) : (
                  <Input value={vaultPath} onChange={e => setVaultPath(e.target.value)} className="font-mono text-xs h-7" />
                )}
              </div>
            )}
          </div>

          {/* Scrollable info / edit area */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            {mode === "review" ? (
              <>
                {summary && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">AI Summary</p>
                    <p className="text-xs leading-relaxed text-foreground bg-muted/40 rounded-lg px-3 py-2.5">{summary}</p>
                  </div>
                )}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Document Details</p>
                  <table className="w-full">
                    <tbody>
                      <InfoRow label="Document Date" value={docDate} />
                      <InfoRow label="Category" value={categoryObj?.name} />
                      {(doc.tags || []).length > 0 && (
                        <tr className="border-b border-border/30">
                          <td className="py-2 pr-4 text-xs text-muted-foreground font-medium whitespace-nowrap w-32">Tags</td>
                          <td className="py-2">
                            <div className="flex flex-wrap gap-1">
                              {(doc.tags || []).map(t => (
                                <span key={t} className="text-xs bg-secondary px-2 py-0.5 rounded-full">{t}</span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                      <InfoRow label="Original File" value={doc.original_filename} mono />
                    </tbody>
                  </table>
                </div>

                {isReceipt && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600 mb-2">Receipt Data</p>
                    <div className="border border-amber-200 rounded-xl overflow-hidden bg-amber-50/40">
                      <table className="w-full px-3">
                        <tbody className="divide-y divide-amber-100">
                          {[
                            ["Store", storeBrand],
                            ["Location", storeLocation],
                            ["Date", txDate],
                            ["Time", txTime],
                            ["Type", txType],
                            ["Tender", tenderType + (lastFour ? ` ••${lastFour}` : "")],
                            ["Amount", amount ? `$${parseFloat(amount).toFixed(2)}` : null],
                            ["Subtotal", subtotal ? `$${parseFloat(subtotal).toFixed(2)}` : null],
                            ["Tax (GST)", taxAmount ? `$${parseFloat(taxAmount).toFixed(2)}` : null],
                            ["Receipt #", receiptNumber || null],
                            ].filter(([, v]) => v).map(([label, value]) => (
                            <tr key={label}>
                              <td className="px-3 py-2 text-xs text-amber-700 font-medium w-24">{label}</td>
                              <td className="px-3 py-2 text-sm font-semibold text-foreground">{value}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {items.length > 0 && (
                        <div className="border-t border-amber-200">
                          <p className="px-3 py-2 text-xs font-bold text-amber-700 uppercase tracking-wide">
                            Line Items ({items.length})
                          </p>
                          <table className="w-full text-xs">
                            <thead className="bg-amber-100/60">
                              <tr>
                                <th className="text-left px-3 py-1.5 font-medium text-amber-800">Item</th>
                                <th className="text-right px-2 py-1.5 font-medium text-amber-800 w-10">Qty</th>
                                <th className="text-right px-3 py-1.5 font-medium text-amber-800 w-20">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {items.map((item, i) => (
                                <tr key={i} className="border-t border-amber-100">
                                  <td className="px-3 py-1.5">{item.name || "—"}</td>
                                  <td className="px-2 py-1.5 text-right text-muted-foreground">{item.quantity ?? ""}</td>
                                  <td className="px-3 py-1.5 text-right font-mono font-medium">
                                    {item.total_price != null ? `$${Number(item.total_price).toFixed(2)}` : "—"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {notes && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Notes</p>
                    <p className="text-xs text-foreground">{notes}</p>
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Document Date</Label>
                    <Input type="date" className="mt-1 h-8 text-sm" value={docDate} onChange={e => setDocDate(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Category</Label>
                    <Select value={categoryId} onValueChange={setCategoryId}>
                      <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue placeholder="None" /></SelectTrigger>
                      <SelectContent>
                        {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Tags (comma-separated)</Label>
                  <Input className="mt-1 h-8 text-sm" value={tags} onChange={e => setTags(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">AI Summary</Label>
                  <textarea
                    className="mt-1 w-full text-sm border rounded-md px-3 py-2 bg-background resize-none focus-visible:ring-1 focus-visible:ring-ring outline-none"
                    rows={3} value={summary} onChange={e => setSummary(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">Notes</Label>
                  <Input className="mt-1 h-8 text-sm" value={notes} onChange={e => setNotes(e.target.value)} />
                </div>

                {isReceipt && (
                  <div className="border rounded-xl p-4 space-y-3 bg-amber-50/50 border-amber-200">
                    <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Receipt Data</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label className="text-xs">Store Brand</Label><Input className="mt-1 h-8 text-sm" value={storeBrand} onChange={e => setStoreBrand(e.target.value)} /></div>
                      <div><Label className="text-xs">Location</Label><Input className="mt-1 h-8 text-sm" value={storeLocation} onChange={e => setStoreLocation(e.target.value)} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label className="text-xs">Transaction Date</Label><Input className="mt-1 h-8 text-sm" value={txDate} onChange={e => setTxDate(e.target.value)} /></div>
                      <div><Label className="text-xs">Time (HH:MM)</Label><Input className="mt-1 h-8 text-sm" value={txTime} onChange={e => setTxTime(e.target.value)} /></div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <Label className="text-xs">Type</Label>
                        <Select value={txType} onValueChange={setTxType}>
                          <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="purchase">Purchase</SelectItem>
                            <SelectItem value="return">Return</SelectItem>
                            <SelectItem value="exchange">Exchange</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Tender</Label>
                        <Select value={tenderType} onValueChange={setTenderType}>
                          <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {["cash","mastercard","visa","amex","eftpos","gift_voucher","exchange_voucher","other"].map(t => (
                              <SelectItem key={t} value={t}>{t}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div><Label className="text-xs">Amount ($)</Label><Input className="mt-1 h-8 text-sm" type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></div>
                    </div>
                    <div><Label className="text-xs">Card Last 4</Label><Input className="mt-1 h-8 text-sm w-28" value={lastFour} onChange={e => setLastFour(e.target.value)} maxLength={4} /></div>
                    <div className="grid grid-cols-3 gap-3">
                      <div><Label className="text-xs">Subtotal ($)</Label><Input className="mt-1 h-8 text-sm" type="number" step="0.01" value={subtotal} onChange={e => setSubtotal(e.target.value)} /></div>
                      <div><Label className="text-xs">Tax / GST ($)</Label><Input className="mt-1 h-8 text-sm" type="number" step="0.01" value={taxAmount} onChange={e => setTaxAmount(e.target.value)} /></div>
                      <div><Label className="text-xs">Receipt #</Label><Input className="mt-1 h-8 text-sm" value={receiptNumber} onChange={e => setReceiptNumber(e.target.value)} /></div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-xs">Line Items</Label>
                        <button onClick={addItem} className="text-xs text-primary hover:underline">+ Add row</button>
                      </div>
                      {items.length > 0 && (
                        <div className="rounded-lg border overflow-hidden text-xs">
                          <table className="w-full">
                            <thead className="bg-muted/40">
                              <tr>
                                <th className="text-left px-3 py-2 font-medium">Item</th>
                                <th className="text-right px-2 py-2 font-medium w-12">Qty</th>
                                <th className="text-right px-2 py-2 font-medium w-16">Unit $</th>
                                <th className="text-right px-2 py-2 font-medium w-16">Total $</th>
                                <th className="w-6" />
                              </tr>
                            </thead>
                            <tbody>
                              {items.map((item, i) => (
                                <tr key={i} className="border-t group">
                                  <td className="px-3 py-1"><Input className="h-6 text-xs border-0 p-0 bg-transparent" value={item.name || ""} onChange={e => updateItem(i, "name", e.target.value)} /></td>
                                  <td className="px-2 py-1"><Input className="h-6 text-xs text-right border-0 p-0 bg-transparent" type="number" value={item.quantity ?? ""} onChange={e => updateItem(i, "quantity", parseFloat(e.target.value))} /></td>
                                  <td className="px-2 py-1"><Input className="h-6 text-xs text-right border-0 p-0 bg-transparent" type="number" step="0.01" value={item.unit_price ?? ""} onChange={e => updateItem(i, "unit_price", parseFloat(e.target.value))} /></td>
                                  <td className="px-2 py-1"><Input className="h-6 text-xs text-right border-0 p-0 bg-transparent" type="number" step="0.01" value={item.total_price ?? ""} onChange={e => updateItem(i, "total_price", parseFloat(e.target.value))} /></td>
                                  <td className="px-1"><button onClick={() => removeItem(i)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Full-width Action Bar ── */}
      <div className="shrink-0 border-t bg-muted/20 px-4 py-3">
        {mode === "review" ? (
          <div className="flex items-center gap-2">
            <Button onClick={handleAccept} disabled={saving || rejecting || reprocessing} size="lg" className="gap-2 flex-1">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck className="h-4 w-4" />}
              {saving ? "Accepting…" : "Accept AI Processing"}
            </Button>
            <Button onClick={() => setMode("edit")} variant="outline" size="lg" className="gap-2">
              <Pencil className="h-4 w-4" />
              Edit &amp; Learn
            </Button>
            <Button onClick={handleReprocess} disabled={saving || rejecting || reprocessing} variant="outline" size="lg"
              className="gap-2 text-amber-700 border-amber-300 hover:bg-amber-50">
              {reprocessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Strip all Processing &amp; Start Again
            </Button>
            <Button onClick={handleReject} disabled={saving || rejecting || reprocessing} variant="ghost" size="lg"
              className="gap-2 text-destructive hover:bg-destructive/10 px-3">
              {rejecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button onClick={handleAccept} disabled={saving} size="lg" className="gap-2 flex-1">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Saving…" : "Save & Accept"}
            </Button>
            <Button onClick={() => setMode("review")} variant="outline" size="lg">Cancel</Button>
            <Button onClick={handleReject} disabled={saving || rejecting} variant="ghost" size="lg"
              className="gap-2 text-destructive hover:bg-destructive/10 px-3">
              {rejecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}