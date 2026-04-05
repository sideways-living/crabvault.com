import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save, Trash2, FileText, ExternalLink, BookOpen, Copy, GitMerge, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

function DocPreview({ doc }) {
  const isImage = ["jpg", "jpeg", "png"].includes(doc.file_type);
  const isPdf = doc.file_type === "pdf";
  if (!doc.file_url) return <div className="flex items-center justify-center h-full text-muted-foreground"><FileText className="h-10 w-10" /></div>;
  if (isImage) return <img src={doc.file_url} alt={doc.title} className="w-full h-full object-contain" />;
  if (isPdf) return <iframe src={doc.file_url} title={doc.title} className="w-full h-full border-0" />;
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
      <FileText className="h-10 w-10" />
      <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
        <ExternalLink className="h-3 w-3" /> Open file
      </a>
    </div>
  );
}

export default function ReviewDetail({ doc, folders, categories, duplicates = [], onConfirmed }) {
  const ai = doc.ai_data || {};
  const isReceipt = !!(ai.is_receipt);

  const [title, setTitle] = useState(doc.title || "");
  const [folderId, setFolderId] = useState(doc.folder_id || "");
  const [categoryId, setCategoryId] = useState(doc.category_id || "");
  const [summary, setSummary] = useState(doc.summary || "");
  const [tags, setTags] = useState((doc.tags || []).join(", "));
  const [docDate, setDocDate] = useState(doc.document_date || "");
  const defaultScanDate = doc.created_date ? new Date(doc.created_date).toISOString().split('T')[0] : "";
  const [scanDate, setScanDate] = useState(defaultScanDate);
  const [notes, setNotes] = useState(doc.notes || "");
  const [vaultPath, setVaultPath] = useState(doc.vault_path || "");
  const [createTemplate, setCreateTemplate] = useState(isReceipt);

  // Receipt fields
  const [storeBrand, setStoreBrand] = useState(ai.store_brand || ai.vendor_name || "");
  const [storeLocation, setStoreLocation] = useState(ai.store_location || "");
  const [txDate, setTxDate] = useState(ai.transaction_date || "");
  const [txTime, setTxTime] = useState(ai.transaction_time || "");
  const [txType, setTxType] = useState(ai.transaction_type || "purchase");
  const [tenderType, setTenderType] = useState(ai.tender_type || "other");
  const [amount, setAmount] = useState(ai.amount != null ? String(ai.amount) : "");
  const [lastFour, setLastFour] = useState(ai.last_four_digits || "");
  const [items, setItems] = useState(ai.items || []);
  const [docState, setDocState] = useState(doc);

  const [saving, setSaving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [merging, setMerging] = useState(false);

  // Auto-update vault path when folder or title changes
  useEffect(() => {
    if (!folderId) return;
    const folder = folders.find(f => f.id === folderId);
    if (folder?.vault_path) {
      const ext = doc.original_filename?.split(".").pop() || "";
      setVaultPath(`${folder.vault_path}/${title}${ext ? "." + ext : ""}`);
    }
  }, [folderId, title]);

  // Generate preview if missing
  useEffect(() => {
    if (!docState.preview_url) {
      base44.functions.invoke('generateDocumentPreview', { documentId: doc.id })
        .then(() => {
          setDocState({ ...docState, preview_url: true });
        })
        .catch(() => {});
    }
  }, [doc.id, docState.preview_url]);

  const handleConfirm = async () => {
    setSaving(true);
    const oldFolderId = doc.folder_id;
    const folderChanged = folderId !== oldFolderId;

    // Update Document
    // Only mark as completed if user explicitly confirms; otherwise stay in review
    await base44.entities.Document.update(doc.id, {
      title,
      folder_id: folderId || undefined,
      category_id: categoryId || undefined,
      summary,
      tags: tags.split(",").map(t => t.trim()).filter(Boolean),
      document_date: docDate || undefined,
      scan_date: scanDate || undefined,
      notes,
      vault_path: vaultPath || undefined,
      processing_status: "completed",
    });

    // Create Transaction record if receipt
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
        last_four_digits: lastFour || undefined,
        items: items.length ? items : undefined,
      });
    }

    // Optionally create receipt template
    if (createTemplate && isReceipt && storeBrand && doc.file_url) {
      const existing = await base44.entities.ReceiptTemplate.filter({ store_brand: storeBrand });
      if (existing.length > 0) {
        const tpl = existing[0];
        const newSamples = [...(tpl.samples || []), {
          label: txType || "purchase",
          image_url: doc.file_url,
          field_regions: [],
        }];
        await base44.entities.ReceiptTemplate.update(tpl.id, { samples: newSamples });
      } else {
        await base44.entities.ReceiptTemplate.create({
          store_brand: storeBrand,
          samples: [{ label: txType || "purchase", image_url: doc.file_url, field_regions: [] }],
        });
      }
      toast.success(`Receipt template ${existing.length > 0 ? "updated" : "created"} for ${storeBrand}`);
    }

    // Log learning decision
    if (folderChanged) {
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

    toast.success(`"${title}" confirmed and saved`);
    setSaving(false);
    onConfirmed(doc.id);
  };

  const handleReject = async () => {
    if (!confirm("Remove this document from the queue without saving?")) return;
    setRejecting(true);
    await base44.entities.Document.update(doc.id, { processing_status: "failed" });
    setRejecting(false);
    toast.success('Document rejected and removed from queue');
    onConfirmed(doc.id);
  };

  const handleMergeAndDelete = async () => {
    if (!confirm(`Keep this document and delete ${duplicates.length} duplicate(s)? This cannot be undone.`)) return;
    setMerging(true);
    await Promise.all(duplicates.map(d => base44.entities.Document.delete(d.id)));
    setMerging(false);
    toast.success(`Merged — deleted ${duplicates.length} duplicate(s)`);
    // Remove duplicates from queue, keep current doc selected
    onConfirmed(duplicates.map(d => d.id));
  };

  const updateItem = (i, field, val) => {
    setItems(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: val } : item));
  };

  const addItem = () => {
    setItems(prev => [...prev, { name: "", quantity: 1, unit_price: null, total_price: null }]);
  };

  const removeItem = (i) => {
    setItems(prev => prev.filter((_, idx) => idx !== i));
  };

  return (
    <div className="bg-card border rounded-xl overflow-hidden flex flex-col gap-0">
      {duplicates.length > 0 && (
        <div className="flex items-center gap-3 px-5 py-3 bg-amber-50 border-b border-amber-200">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800 flex-1">
            <strong>{duplicates.length} possible duplicate{duplicates.length > 1 ? 's' : ''}</strong> also in queue:
            {' '}{duplicates.map(d => <span key={d.id} className="font-mono text-xs bg-amber-100 px-1 rounded">{d.title}</span>).reduce((a, b) => [a, ', ', b])}
          </p>
          <Button
            size="sm" variant="outline"
            onClick={handleMergeAndDelete}
            disabled={merging}
            className="gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-100 shrink-0"
          >
            {merging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitMerge className="h-3.5 w-3.5" />}
            Keep this, delete duplicates
          </Button>
        </div>
      )}
      <div className="flex-1 flex flex-col gap-0 min-h-0">
        {/* Small preview tile at top */}
        <div className="shrink-0 border-b bg-muted/20 p-4 flex gap-4 items-start">
          <div className="w-24 h-32 rounded-lg border bg-background overflow-hidden flex-shrink-0 shadow-sm">
            <DocPreview doc={docState} />
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Proposed Filename</p>
              <p className="text-xs font-medium text-foreground truncate">{title}{doc.original_filename?.split('.').slice(-1)[0] ? '.' + doc.original_filename.split('.').pop() : ''}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Folder Location</p>
              <p className="text-xs font-medium text-foreground truncate">{folderId ? folders.find(f => f.id === folderId)?.path || 'Selected' : '—'}</p>
            </div>
          </div>
        </div>

        {/* Scrollable fields */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <Label className="text-xs">Proposed Title / Filename</Label>
            <Input className="mt-1 font-medium" value={title} onChange={e => setTitle(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Folder</Label>
              <Select value={folderId} onValueChange={setFolderId}>
                <SelectTrigger className="mt-1 h-8 text-sm">
                  <SelectValue placeholder="No folder" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>— No folder —</SelectItem>
                  {folders.map(f => <SelectItem key={f.id} value={f.id}>{f.path || f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="mt-1 h-8 text-sm">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>— None —</SelectItem>
                  {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Scan / Created Date</Label>
              <Input type="date" className="mt-1 h-8 text-sm" value={scanDate} onChange={e => setScanDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Document Date <span className="text-muted-foreground font-normal">(from document)</span></Label>
              <Input type="date" className="mt-1 h-8 text-sm" value={docDate} onChange={e => setDocDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Tags (comma-separated)</Label>
              <Input className="mt-1 h-8 text-sm" value={tags} onChange={e => setTags(e.target.value)} />
            </div>
          </div>

          <div>
            <Label className="text-xs">AI Summary</Label>
            <textarea
              className="mt-1 w-full text-sm border rounded-md px-3 py-2 bg-background resize-none"
              rows={3}
              value={summary}
              onChange={e => setSummary(e.target.value)}
            />
          </div>

          <div>
            <Label className="text-xs">Vault Path (Cryptomator)</Label>
            <Input className="mt-1 h-8 text-sm font-mono" value={vaultPath} onChange={e => setVaultPath(e.target.value)} placeholder="/Vault/Folder/filename.pdf" />
          </div>

          <div>
            <Label className="text-xs">Notes</Label>
            <Input className="mt-1 h-8 text-sm" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>

          {/* Receipt fields */}
          {isReceipt && (
            <div className="border rounded-xl p-4 space-y-3 bg-amber-50/50 border-amber-200">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Receipt Data</p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Store Brand</Label>
                  <Input className="mt-1 h-8 text-sm" value={storeBrand} onChange={e => setStoreBrand(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Store Location</Label>
                  <Input className="mt-1 h-8 text-sm" value={storeLocation} onChange={e => setStoreLocation(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Transaction Date (YYYYMMDD)</Label>
                  <Input className="mt-1 h-8 text-sm" value={txDate} onChange={e => setTxDate(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Time (HH:MM)</Label>
                  <Input className="mt-1 h-8 text-sm" value={txTime} onChange={e => setTxTime(e.target.value)} />
                </div>
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
                <div>
                  <Label className="text-xs">Amount ($)</Label>
                  <Input className="mt-1 h-8 text-sm" type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} />
                </div>
              </div>

              <div>
                <Label className="text-xs">Card Last 4 Digits</Label>
                <Input className="mt-1 h-8 text-sm w-32" value={lastFour} onChange={e => setLastFour(e.target.value)} maxLength={4} />
              </div>

              {/* Items table */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs">Line Items ({items.length})</Label>
                  <button onClick={addItem} className="text-xs text-primary hover:underline flex items-center gap-1">+ Add row</button>
                </div>
                {items.length > 0 ? (
                  <div className="rounded-lg border overflow-hidden text-xs">
                    <table className="w-full">
                      <thead className="bg-muted/40">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium">Item Name</th>
                          <th className="text-right px-2 py-2 font-medium w-14">Qty</th>
                          <th className="text-right px-2 py-2 font-medium w-20">Unit $</th>
                          <th className="text-right px-2 py-2 font-medium w-20">Total $</th>
                          <th className="w-6"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item, i) => (
                          <tr key={i} className="border-t group">
                            <td className="px-3 py-1.5">
                              <Input className="h-6 text-xs border-0 p-0 bg-transparent" value={item.name || ""} onChange={e => updateItem(i, "name", e.target.value)} placeholder="Item name…" />
                            </td>
                            <td className="px-2 py-1.5">
                              <Input className="h-6 text-xs text-right border-0 p-0 bg-transparent" type="number" value={item.quantity ?? ""} onChange={e => updateItem(i, "quantity", parseFloat(e.target.value))} placeholder="1" />
                            </td>
                            <td className="px-2 py-1.5">
                              <Input className="h-6 text-xs text-right border-0 p-0 bg-transparent" type="number" step="0.01" value={item.unit_price ?? ""} onChange={e => updateItem(i, "unit_price", parseFloat(e.target.value))} placeholder="0.00" />
                            </td>
                            <td className="px-2 py-1.5">
                              <Input className="h-6 text-xs text-right border-0 p-0 bg-transparent" type="number" step="0.01" value={item.total_price ?? ""} onChange={e => updateItem(i, "total_price", parseFloat(e.target.value))} placeholder="0.00" />
                            </td>
                            <td className="px-1 py-1.5">
                              <button onClick={() => removeItem(i)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all">
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">No items — add rows above if this receipt has line items.</p>
                )}
              </div>
            </div>
          )}

          {/* Create template checkbox */}
          {isReceipt && (
            <label className="flex items-center gap-2.5 cursor-pointer group">
              <input
                type="checkbox"
                checked={createTemplate}
                onChange={e => setCreateTemplate(e.target.checked)}
                className="h-4 w-4 rounded"
              />
              <BookOpen className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              <span className="text-sm">Save as receipt trainer template for <strong>{storeBrand || "this store"}</strong></span>
            </label>
          )}
        </div>
      </div>

      {/* Action bar */}
      <div className="border-t px-5 py-3 flex items-center gap-3 bg-muted/20">
        <Button onClick={handleConfirm} disabled={saving || rejecting} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Confirm & Save to Vault
        </Button>
        <Button onClick={handleReject} disabled={saving || rejecting} variant="outline" className="gap-2 text-destructive hover:bg-destructive/10 border-destructive/30">
          {rejecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          Reject
        </Button>
        <p className="ml-auto text-xs text-muted-foreground">Review and confirm all details before saving to the encrypted vault.</p>
      </div>
    </div>
  );
}