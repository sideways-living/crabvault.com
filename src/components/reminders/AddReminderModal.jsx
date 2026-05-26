import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function AddReminderModal({ crabId, onClose, onAdded }) {
  const [types, setTypes] = useState([]);
  const [selectedType, setSelectedType] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [showAddType, setShowAddType] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");
  const [addingType, setAddingType] = useState(false);

  useEffect(() => {
    base44.entities.ReminderType.list("name", 200).then(setTypes);
  }, []);

  const handleAddType = async () => {
    const name = newTypeName.trim();
    if (!name) return;
    setAddingType(true);
    const created = await base44.entities.ReminderType.create({ name });
    const updated = [...types, created].sort((a, b) => a.name.localeCompare(b.name));
    setTypes(updated);
    setSelectedType(created.name);
    setNewTypeName("");
    setShowAddType(false);
    setAddingType(false);
  };

  const handleSave = async () => {
    if (!dueDate) { toast.error("Please select a due date"); return; }
    setSaving(true);
    await base44.entities.Reminder.create({
      crab_id: crabId,
      reminder_type: selectedType || null,
      due_date: dueDate,
      notes: notes.trim() || null,
      is_done: false,
    });
    toast.success("Reminder added");
    onAdded();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-card border rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Add Reminder</h2>
          <button onClick={onClose}><X className="h-4 w-4 text-muted-foreground hover:text-foreground" /></button>
        </div>

        {/* Type selector */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Type</label>
          <select
            className="w-full border rounded-md h-9 px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            value={selectedType}
            onChange={e => {
              if (e.target.value === "__add__") {
                setShowAddType(true);
              } else {
                setSelectedType(e.target.value);
              }
            }}
          >
            <option value="">— Select type —</option>
            {types.map(t => (
              <option key={t.id} value={t.name}>{t.name}</option>
            ))}
            <option value="__add__">+ Add Item</option>
          </select>
        </div>

        {/* Inline add type */}
        {showAddType && (
          <div className="flex gap-2">
            <Input
              autoFocus
              className="h-8 text-sm flex-1"
              placeholder="New type name…"
              value={newTypeName}
              onChange={e => setNewTypeName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleAddType(); if (e.key === "Escape") setShowAddType(false); }}
            />
            <Button size="sm" className="h-8 px-3" onClick={handleAddType} disabled={addingType}>
              {addingType ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            </Button>
            <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => { setShowAddType(false); setNewTypeName(""); }}>✕</Button>
          </div>
        )}

        {/* Due date */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Due Date</label>
          <Input
            type="date"
            className="h-9 text-sm"
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
          />
        </div>

        {/* Notes */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Notes (optional)</label>
          <textarea
            className="w-full border rounded-md px-3 py-2 text-sm bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            rows={2}
            placeholder="Optional notes…"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </div>

        <div className="flex gap-2 pt-1">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Reminder"}
          </Button>
        </div>
      </div>
    </div>
  );
}