import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Plus, Pencil, Trash2, CreditCard, Landmark, Smartphone,
  WalletCards, Lock, LockOpen, Link2, KeyRound, Hash, Phone, Building2,
  ShieldQuestion, ShieldCheck, MapPin, Eye, EyeOff, AtSign, X, Check
} from "lucide-react";
import { getCardImage } from "@/lib/cardImages";
import { toast } from "sonner";
import YellowBankAccountForm from "./YellowBankAccountForm";
import YellowBankCardForm from "./YellowBankCardForm";
import { PhoneSelector, EmailSelector, AddressSelector } from "@/components/ContactSelector";
import IdentificationUsedSelector from "./IdentificationUsedSelector";



const CARD_FEATURE_DEFS = [
  { key: "is_digital", label: "Digital Card", icon: Smartphone, tip: "A virtual/digital-only card" },
  { key: "is_physical", label: "Physical Card", icon: CreditCard, tip: "A physical plastic/metal card has been issued" },
  { key: "pin_set", label: "PIN Set", icon: Lock, tip: "A PIN has been set for this card" },
  { key: "digital_wallet", label: "Digital Wallet", icon: WalletCards, tip: "Card has been added to Apple Pay, Google Pay, or similar" },
];

function accountLabel(acc) {
  return `${acc.account_type || "Account"} ${acc.account_number || ""}`.trim();
}

function AccountSummary(accounts) {
  if (!accounts.length) return "";
  const counts = {};
  accounts.forEach(a => {
    const t = a.account_type || "Unknown";
    counts[t] = (counts[t] || 0) + 1;
  });
  return Object.entries(counts).map(([t, n]) => `${n} × ${t}`).join(", ");
}

function formatPayid(value) {
  const trimmed = value.trim();
  // Only format if it looks like a phone number (digits, spaces, +, dashes only — no @)
  if (trimmed.includes("@") || trimmed.includes(".")) return trimmed;
  const digits = trimmed.replace(/[^\d]/g, "");
  if (digits.length < 8) return trimmed;
  let local = digits;
  if (local.startsWith("61")) local = local.slice(2);
  else if (local.startsWith("0")) local = local.slice(1);
  if (local.length !== 9) return trimmed;
  return `+61 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
}

function PayidForm({ form, setForm, accounts, onSave, onCancel }) {
  return (
    <div className="space-y-2 p-3 bg-muted/30 rounded-lg border">
      <div>
        <Label className="text-xs">PayID (email, phone, or ABN)</Label>
        <Input
          autoFocus
          className="mt-1 text-sm font-mono"
          placeholder="e.g. +61 412 345 678 or name@email.com"
          value={form.payid}
          onChange={e => setForm(f => ({ ...f, payid: e.target.value }))}
          onBlur={e => setForm(f => ({ ...f, payid: formatPayid(f.payid) }))}
          onKeyDown={e => { if (e.key === "Enter") onSave(); if (e.key === "Escape") onCancel(); }}
        />
      </div>
      {accounts.length > 0 && (
        <div>
          <Label className="text-xs">Linked Account</Label>
          <Select value={form.linked_account_id || "__none__"} onValueChange={v => setForm(f => ({ ...f, linked_account_id: v === "__none__" ? "" : v }))}>
            <SelectTrigger className="mt-1 h-7 text-xs"><SelectValue placeholder="None" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">None</SelectItem>
              {accounts.map(acc => (
                <SelectItem key={acc.id} value={acc.id}>{`${acc.account_type || "Account"} ${acc.account_number || ""}`.trim()}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={onSave} disabled={!form.payid.trim()} className="gap-1 h-7 text-xs px-2">
          <Check className="h-3 w-3" /> Save
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel} className="h-7 text-xs px-2">Cancel</Button>
      </div>
    </div>
  );
}

// Shift digits 9-12 (positions 8-11 in the raw digit string) up by 1 (wrapping 9→0)
function obfuscateCardNumber(cardNumber) {
  if (!cardNumber) return cardNumber;
  const digits = cardNumber.replace(/\D/g, "");
  if (digits.length < 12) return cardNumber;
  const shifted = digits.slice(0, 8) +
    digits.slice(8, 12).replace(/\d/g, d => String((parseInt(d) + 1) % 10)) +
    digits.slice(12);
  // Re-format into groups of 4 with spaces
  return shifted.replace(/(.{4})/g, "$1 ").trim();
}

function CardRow({ card, editing, accounts, onEdit, onDelete, onSave, onCancel, onToggleFeature, onLinkAccount }) {
  const [locked, setLocked] = useState(true);
  const [showCcv, setShowCcv] = useState(false);
  const [showPin, setShowPin] = useState(false);

  if (editing) {
    return <YellowBankCardForm initial={card} onSave={onSave} onCancel={onCancel} accounts={accounts} />;
  }

  const displayCardNumber = locked ? obfuscateCardNumber(card.card_number) : (card.card_number || "—");

  const cardImg = getCardImage(card.card_number);

  return (
    <div className="p-3 bg-muted/40 rounded-lg space-y-2">
      <div className="flex gap-3">
        {/* Card image */}
        {cardImg && (
          <img src={cardImg.url} alt={cardImg.label} className="rounded-lg object-cover shrink-0 self-start" style={{ width: 108, height: 68 }} />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              {/* Card number */}
              <div className="flex items-center gap-2 text-sm font-mono font-medium">
                <CreditCard className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span>{displayCardNumber}</span>
                <button onClick={() => setLocked(v => !v)} className="text-muted-foreground hover:text-foreground ml-1">
                  {locked ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5 text-amber-500" />}
                </button>
              </div>
              {/* Expiry | CVV | PIN */}
              <div className="flex items-center gap-1.5 pl-[22px] font-mono text-xs text-muted-foreground">
                <span>Expiry: {card.expiry || "—"}</span>
                <span className="opacity-40">|</span>
                <span>CVV: {showCcv ? (card.ccv || "—") : "•••"}</span>
                <button onClick={() => setShowCcv(v => !v)} className="text-muted-foreground hover:text-foreground">
                  {showCcv ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                </button>
                <span className="opacity-40">|</span>
                <span>PIN: {showPin ? (card.pin || "—") : "•••"}</span>
                <button onClick={() => setShowPin(v => !v)} className="text-muted-foreground hover:text-foreground">
                  {showPin ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                </button>
              </div>
              {/* Linked Account or Credit Limit */}
              {(card.card_number || "").replace(/\s/g, "").startsWith("5523") ? (
                card.credit_limit ? (
                  <div className="flex items-center gap-1.5 pl-[22px] text-xs text-muted-foreground">
                    <span>Credit Limit: ${card.credit_limit.toLocaleString()}</span>
                  </div>
                ) : null
              ) : accounts.length > 0 && (
                <div className="pl-0">
                  <Select
                    value={card.linked_account_id || "__none__"}
                    onValueChange={v => onLinkAccount(card, v === "__none__" ? "" : v)}
                  >
                    <SelectTrigger className="h-6 text-xs border-0 bg-transparent px-0 shadow-none text-muted-foreground gap-2 w-auto focus:ring-0">
                      <Link2 className="h-3.5 w-3.5 shrink-0" />
                      <SelectValue placeholder="No account linked" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {accounts.map(acc => (
                        <SelectItem key={acc.id} value={acc.id}>{accountLabel(acc)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-0.5 shrink-0 ml-2">
                      <button onClick={onEdit} className="text-muted-foreground hover:text-foreground p-1"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={onDelete} className="text-muted-foreground hover:text-destructive p-1"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
          </div>
        </div>
      </div>
      {/* Checkboxes */}
      <div className="flex flex-wrap gap-3 pl-1">
        {CARD_FEATURE_DEFS.map(({ key, label, icon: FeatureIcon, tip }) => (
          <Tooltip key={key}>
            <TooltipTrigger asChild>
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input type="checkbox" checked={!!card[key]} onChange={() => onToggleFeature(card, key)} className="rounded" />
                <FeatureIcon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{label}</span>
              </label>
            </TooltipTrigger>
            <TooltipContent><p className="text-xs max-w-xs">{tip}</p></TooltipContent>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}

export default function YellowBankModule({ crabId }) {
  const [module, setModule] = useState(null);
  const [crab, setCrab] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loginEditing, setLoginEditing] = useState(false);
  const [shown, setShown] = useState({ password: false, app_pin: false, tel_pin: false, a1: false, a2: false });
  const [identificationUsed, setIdentificationUsed] = useState([]);
  const toggleShown = (key) => setShown(s => ({ ...s, [key]: !s[key] }));

  const [loginEdit, setLoginEdit] = useState({
    yellowbank_client_number: "",
    yellowbank_password: "",
    yellowbank_app_pin: "",
    yellowbank_telephone_pin: "",
    yellowbank_security_q1: "",
    yellowbank_security_a1: "",
    yellowbank_security_q2: "",
    yellowbank_security_a2: "",
    yellowbank_last_branch: "",
    yellowbank_last_branch_purpose: "",
    yellowbank_employer: "",
    yellowbank_job_role: "",
    yellowbank_annual_salary: "",
    yellowbank_commencement_date: "",
  });
  const [loginDirty, setLoginDirty] = useState(false);
  const [savingLogin, setSavingLogin] = useState(false);

  const [addingAccount, setAddingAccount] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [addingCard, setAddingCard] = useState(false);
  const [editingCard, setEditingCard] = useState(null);

  const [payids, setPayids] = useState([]);
  const [addingPayid, setAddingPayid] = useState(false);
  const [editingPayidIdx, setEditingPayidIdx] = useState(null);
  const [payidForm, setPayidForm] = useState({ payid: "", linked_account_id: "" });

  const load = async () => {
    const [mods, crabs, accs, cds] = await Promise.all([
      base44.entities.CrabModule.filter({ crab_id: crabId, module_type: "yellowbank" }),
      base44.entities.Crab.filter({ id: crabId }),
      base44.entities.YellowBankAccount.filter({ crab_id: crabId }, "created_date"),
      base44.entities.YellowBankCard.filter({ crab_id: crabId }, "created_date"),
    ]);
    const mod = mods[0] || null;
    setModule(mod);
    setCrab(crabs[0] || null);
    if (mod) {
      setLoginEdit({
        yellowbank_client_number: mod.yellowbank_client_number || "",
        yellowbank_password: mod.yellowbank_password || "",
        yellowbank_app_pin: mod.yellowbank_app_pin || "",
        yellowbank_telephone_pin: mod.yellowbank_telephone_pin || "",
        yellowbank_security_q1: mod.yellowbank_security_q1 || "",
        yellowbank_security_a1: mod.yellowbank_security_a1 || "",
        yellowbank_security_q2: mod.yellowbank_security_q2 || "",
        yellowbank_security_a2: mod.yellowbank_security_a2 || "",
        yellowbank_last_branch: mod.yellowbank_last_branch || "",
        yellowbank_last_branch_purpose: mod.yellowbank_last_branch_purpose || "",
        yellowbank_employer: mod.yellowbank_employer || "",
        yellowbank_job_role: mod.yellowbank_job_role || "",
        yellowbank_annual_salary: mod.yellowbank_annual_salary ? String(mod.yellowbank_annual_salary) : "",
        yellowbank_commencement_date: mod.yellowbank_commencement_date || "",
      });
    }
    setAccounts(accs);
    setCards(cds);
    setPayids(mod?.yellowbank_payids || []);
    setIdentificationUsed(mod?.identification_used || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [crabId]);

  const ensureModule = async () => {
    if (module) return module;
    const created = await base44.entities.CrabModule.create({ crab_id: crabId, module_type: "yellowbank" });
    setModule(created);
    return created;
  };

  const L = (field) => (e) => { setLoginEdit(l => ({ ...l, [field]: e.target.value })); setLoginDirty(true); };
  const LV = (field, value) => { setLoginEdit(l => ({ ...l, [field]: value })); setLoginDirty(true); };

  const saveLogin = async () => {
    setSavingLogin(true);
    const mod = await ensureModule();
    const saveData = {
      ...loginEdit,
      identification_used: identificationUsed,
      yellowbank_annual_salary: loginEdit.yellowbank_annual_salary ? Number(loginEdit.yellowbank_annual_salary) : undefined,
    };
    await base44.entities.CrabModule.update(mod.id, saveData);
    toast.success("Login details saved");
    setLoginDirty(false);
    setSavingLogin(false);
    setLoginEditing(false);
    load();
  };

  const handleSaveAccount = async (form) => {
    const mod = await ensureModule();
    if (editingAccount) {
      await base44.entities.YellowBankAccount.update(editingAccount.id, form);
      toast.success("Account updated");
      setEditingAccount(null);
    } else {
      await base44.entities.YellowBankAccount.create({ ...form, module_id: mod.id, crab_id: crabId });
      toast.success("Account added");
      setAddingAccount(false);
    }
    load();
  };

  const handleDeleteAccount = async (acc) => {
    if (!confirm(`Delete account ${acc.account_type || ""} ${acc.account_number}?`)) return;
    const linkedCards = cards.filter(c => c.linked_account_id === acc.id);
    await Promise.all(linkedCards.map(c => base44.entities.YellowBankCard.update(c.id, { linked_account_id: "" })));
    await base44.entities.YellowBankAccount.delete(acc.id);
    toast.success("Account deleted");
    load();
  };

  const syncAccountCardLinks = async (card, newAccountId, oldAccountId) => {
    if (oldAccountId && oldAccountId !== newAccountId) {
      const oldAcc = accounts.find(a => a.id === oldAccountId);
      if (oldAcc) {
        const updated = (oldAcc.linked_card_ids || []).filter(id => id !== card.id);
        await base44.entities.YellowBankAccount.update(oldAcc.id, { linked_card_ids: updated });
      }
    }
    if (newAccountId) {
      const newAcc = accounts.find(a => a.id === newAccountId);
      if (newAcc) {
        const existing = newAcc.linked_card_ids || [];
        if (!existing.includes(card.id)) {
          await base44.entities.YellowBankAccount.update(newAcc.id, { linked_card_ids: [...existing, card.id] });
        }
      }
    }
  };

  const handleSaveCard = async (form) => {
    const mod = await ensureModule();
    let savedCard;
    if (editingCard) {
      await base44.entities.YellowBankCard.update(editingCard.id, form);
      savedCard = { ...editingCard, ...form };
      toast.success("Card updated");
      setEditingCard(null);
    } else {
      savedCard = await base44.entities.YellowBankCard.create({ ...form, module_id: mod.id, crab_id: crabId });
      toast.success("Card added");
      setAddingCard(false);
    }
    await syncAccountCardLinks(savedCard, form.linked_account_id, editingCard?.linked_account_id);
    load();
  };

  const handleDeleteCard = async (card) => {
    const masked = card.card_number ? "•••• " + card.card_number.slice(-4) : "this card";
    if (!confirm(`Delete ${masked}?`)) return;
    if (card.linked_account_id) {
      const acc = accounts.find(a => a.id === card.linked_account_id);
      if (acc) {
        await base44.entities.YellowBankAccount.update(acc.id, {
          linked_card_ids: (acc.linked_card_ids || []).filter(id => id !== card.id)
        });
      }
    }
    await base44.entities.YellowBankCard.delete(card.id);
    toast.success("Card deleted");
    load();
  };

  const toggleCardFeature = async (card, key) => {
    const updated = { ...card, [key]: !card[key] };
    await base44.entities.YellowBankCard.update(card.id, { [key]: updated[key] });
    setCards(cs => cs.map(c => c.id === card.id ? updated : c));
  };

  const handleCardAccountLink = async (card, newAccountId) => {
    const oldAccountId = card.linked_account_id || "";
    await base44.entities.YellowBankCard.update(card.id, { linked_account_id: newAccountId || "" });
    await syncAccountCardLinks({ id: card.id }, newAccountId, oldAccountId);
    load();
  };

  const handlePhoneSelect = async (type, index) => {
    const mod = await ensureModule();
    await base44.entities.CrabModule.update(mod.id, {
      selected_phone_type: type,
      selected_phone_index: index,
    });
    load();
  };

  const handleEmailSelect = async (type, index) => {
    const mod = await ensureModule();
    await base44.entities.CrabModule.update(mod.id, {
      selected_email_type: type,
      selected_email_index: index,
    });
    load();
  };

  const handleAddressSelect = async (type, index) => {
    const mod = await ensureModule();
    await base44.entities.CrabModule.update(mod.id, {
      selected_address_type: type,
      selected_address_index: index,
    });
    load();
  };

  const savePayids = async (updated) => {
    const mod = await ensureModule();
    await base44.entities.CrabModule.update(mod.id, { yellowbank_payids: updated });
    setPayids(updated);
  };

  const handleSavePayid = async () => {
    if (!payidForm.payid.trim()) return;
    let updated;
    if (editingPayidIdx !== null) {
      updated = payids.map((p, i) => i === editingPayidIdx ? { ...payidForm } : p);
      setEditingPayidIdx(null);
    } else {
      updated = [...payids, { ...payidForm }];
      setAddingPayid(false);
    }
    setPayidForm({ payid: "", linked_account_id: "" });
    await savePayids(updated);
    toast.success("PayID saved");
  };

  const handleDeletePayid = async (idx) => {
    const updated = payids.filter((_, i) => i !== idx);
    await savePayids(updated);
    toast.success("PayID deleted");
  };

  if (loading) return <div className="flex justify-center py-6"><div className="w-5 h-5 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" /></div>;

  const summary = AccountSummary(accounts);

  return (
    <TooltipProvider>
      <div className="space-y-5">

        {/* Login & Security */}
        <div className="bg-card border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-yellow-600" />
              <h3 className="font-semibold text-sm">YellowBank Login &amp; Security</h3>
            </div>
            {!loginEditing && (
              <button onClick={() => setLoginEditing(true)} className="text-muted-foreground hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
            )}
          </div>

          {loginEditing ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs flex items-center gap-1"><Hash className="h-3 w-3" /> Client Number</Label>
                  <Input className="mt-1 font-mono" value={loginEdit.yellowbank_client_number} onChange={L("yellowbank_client_number")} />
                </div>
                <div>
                  <Label className="text-xs flex items-center gap-1"><Lock className="h-3 w-3" /> Password</Label>
                  <Input className="mt-1 font-mono" value={loginEdit.yellowbank_password} onChange={L("yellowbank_password")} />
                </div>
                <div>
                  <Label className="text-xs flex items-center gap-1"><Phone className="h-3 w-3" /> App PIN</Label>
                  <Input className="mt-1 font-mono" placeholder="4-6 digits" maxLength={6}
                    value={loginEdit.yellowbank_app_pin}
                    onChange={e => { setLoginEdit(l => ({ ...l, yellowbank_app_pin: e.target.value.replace(/\D/g, "").slice(0, 6) })); setLoginDirty(true); }} />
                </div>
                <div>
                  <Label className="text-xs flex items-center gap-1"><Phone className="h-3 w-3" /> Telephone PIN</Label>
                  <Input className="mt-1 font-mono" placeholder="4-6 digits" maxLength={6}
                    value={loginEdit.yellowbank_telephone_pin}
                    onChange={e => { setLoginEdit(l => ({ ...l, yellowbank_telephone_pin: e.target.value.replace(/\D/g, "").slice(0, 6) })); setLoginDirty(true); }} />
                </div>
              </div>

              {/* Security Questions — edit */}
              <div className="space-y-3 pt-1">
                <Label className="text-xs flex items-center gap-1 text-muted-foreground"><ShieldQuestion className="h-3 w-3" /> Security Questions</Label>
                {[1, 2].map(n => (
                  <div key={n} className="space-y-2 p-3 bg-muted/30 rounded-lg">
                    <Label className="text-xs">Question {n}</Label>
                    <Input className="text-xs" placeholder="Security question…"
                      value={loginEdit[`yellowbank_security_q${n}`]}
                      onChange={L(`yellowbank_security_q${n}`)} />
                    <Input className="text-xs" placeholder="Answer…"
                      value={loginEdit[`yellowbank_security_a${n}`]}
                      onChange={L(`yellowbank_security_a${n}`)} />
                  </div>
                ))}
              </div>

              {/* Last Branch — edit */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <Label className="text-xs flex items-center gap-1"><MapPin className="h-3 w-3" /> Last Branch Visited</Label>
                  <Input className="mt-1" placeholder="Branch name / location" value={loginEdit.yellowbank_last_branch} onChange={L("yellowbank_last_branch")} />
                </div>
                <div>
                  <Label className="text-xs flex items-center gap-1"><Building2 className="h-3 w-3" /> Purpose of Visit</Label>
                  <Input className="mt-1" placeholder="e.g. Open account, dispute…" value={loginEdit.yellowbank_last_branch_purpose} onChange={L("yellowbank_last_branch_purpose")} />
                </div>
              </div>

              {/* Employment */}
              <div className="space-y-2 pt-1">
                <Label className="text-xs flex items-center gap-1 text-muted-foreground font-semibold uppercase tracking-wide">Employment Information</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Employer</Label>
                    <Input className="mt-1" placeholder="Employer name" value={loginEdit.yellowbank_employer} onChange={L("yellowbank_employer")} />
                  </div>
                  <div>
                    <Label className="text-xs">Job Role</Label>
                    <Input className="mt-1" placeholder="Job title / role" value={loginEdit.yellowbank_job_role} onChange={L("yellowbank_job_role")} />
                  </div>
                  <div>
                    <Label className="text-xs">Annual Salary ($)</Label>
                    <Input className="mt-1 font-mono" type="number" placeholder="0.00" value={loginEdit.yellowbank_annual_salary} onChange={L("yellowbank_annual_salary")} />
                  </div>
                  <div>
                    <Label className="text-xs">Commencement Date</Label>
                    <Input className="mt-1" type="date" value={loginEdit.yellowbank_commencement_date} onChange={L("yellowbank_commencement_date")} />
                  </div>
                </div>
              </div>

              <IdentificationUsedSelector
                crab={crab}
                selected={identificationUsed}
                onChange={setIdentificationUsed}
              />
              <Button size="sm" onClick={saveLogin} disabled={savingLogin} className="gap-1">
                {savingLogin ? "Saving…" : "Save Login Details"}
              </Button>
            </>
          ) : (
            <div className="space-y-3 text-sm">
              {/* Row 1+2: credentials in 2-col grid */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Client Number</span>
                  <span className="font-mono">{loginEdit.yellowbank_client_number || "—"}</span>
                </div>
                <div className="flex justify-between items-center gap-2">
                  <span className="text-muted-foreground">Password</span>
                  <span className="flex items-center gap-1 font-mono">
                    {shown.password ? (loginEdit.yellowbank_password || "—") : (loginEdit.yellowbank_password ? "••••••" : "—")}
                    {loginEdit.yellowbank_password && (
                      <button onClick={() => toggleShown("password")} className="text-muted-foreground hover:text-foreground ml-1">
                        {shown.password ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      </button>
                    )}
                  </span>
                </div>
                <div className="flex justify-between items-center gap-2">
                  <span className="text-muted-foreground">App PIN</span>
                  <span className="flex items-center gap-1 font-mono">
                    {shown.app_pin ? (loginEdit.yellowbank_app_pin || "—") : (loginEdit.yellowbank_app_pin ? "••••" : "—")}
                    {loginEdit.yellowbank_app_pin && (
                      <button onClick={() => toggleShown("app_pin")} className="text-muted-foreground hover:text-foreground ml-1">
                        {shown.app_pin ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      </button>
                    )}
                  </span>
                </div>
                <div className="flex justify-between items-center gap-2">
                  <span className="text-muted-foreground">Telephone PIN</span>
                  <span className="flex items-center gap-1 font-mono">
                    {shown.tel_pin ? (loginEdit.yellowbank_telephone_pin || "—") : (loginEdit.yellowbank_telephone_pin ? "••••" : "—")}
                    {loginEdit.yellowbank_telephone_pin && (
                      <button onClick={() => toggleShown("tel_pin")} className="text-muted-foreground hover:text-foreground ml-1">
                        {shown.tel_pin ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      </button>
                    )}
                  </span>
                </div>
              </div>

              {/* Last branch — bottom 1-col row */}
              {(loginEdit.yellowbank_last_branch || loginEdit.yellowbank_last_branch_purpose) && (
                <div className="flex justify-between pt-1 border-t">
                  <span className="text-muted-foreground">{loginEdit.yellowbank_last_branch || "—"}</span>
                  <span>{loginEdit.yellowbank_last_branch_purpose || ""}</span>
                </div>
              )}

              {/* Employment */}
              {(loginEdit.yellowbank_employer || loginEdit.yellowbank_job_role || loginEdit.yellowbank_annual_salary || loginEdit.yellowbank_commencement_date) && (
                <div className="pt-1 border-t space-y-1.5">
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Employment</p>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                    {loginEdit.yellowbank_employer && (
                      <div className="flex justify-between"><span className="text-muted-foreground text-sm">Employer</span><span className="text-sm font-medium">{loginEdit.yellowbank_employer}</span></div>
                    )}
                    {loginEdit.yellowbank_job_role && (
                      <div className="flex justify-between"><span className="text-muted-foreground text-sm">Job Role</span><span className="text-sm font-medium">{loginEdit.yellowbank_job_role}</span></div>
                    )}
                    {loginEdit.yellowbank_annual_salary && (
                      <div className="flex justify-between"><span className="text-muted-foreground text-sm">Annual Salary</span><span className="text-sm font-medium font-mono">${Number(loginEdit.yellowbank_annual_salary).toLocaleString("en-AU")}</span></div>
                    )}
                    {loginEdit.yellowbank_commencement_date && (
                      <div className="flex justify-between"><span className="text-muted-foreground text-sm">Commenced</span><span className="text-sm font-medium">{new Date(loginEdit.yellowbank_commencement_date).toLocaleDateString("en-AU")}</span></div>
                    )}
                  </div>
                </div>
              )}

              {/* Security Questions */}
              {(loginEdit.yellowbank_security_q1 || loginEdit.yellowbank_security_q2) && (
                <div className="space-y-2 pt-1 border-t">
                  {loginEdit.yellowbank_security_q1 && (
                    <div>
                      <p className="text-xs text-muted-foreground font-medium">Question 1:</p>
                      <div className="flex justify-between items-baseline gap-4">
                        <span className="text-sm">{loginEdit.yellowbank_security_q1}</span>
                        <span className="flex items-center gap-1 text-sm font-mono text-right shrink-0">
                          {shown.a1 ? (loginEdit.yellowbank_security_a1 || "—") : (loginEdit.yellowbank_security_a1 ? "••••••" : "—")}
                          {loginEdit.yellowbank_security_a1 && (
                            <button onClick={() => toggleShown("a1")} className="text-muted-foreground hover:text-foreground ml-1">
                              {shown.a1 ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                            </button>
                          )}
                        </span>
                      </div>
                    </div>
                  )}
                  {loginEdit.yellowbank_security_q2 && (
                    <div>
                      <p className="text-xs text-muted-foreground font-medium">Question 2:</p>
                      <div className="flex justify-between items-baseline gap-4">
                        <span className="text-sm">{loginEdit.yellowbank_security_q2}</span>
                        <span className="flex items-center gap-1 text-sm font-mono text-right shrink-0">
                          {shown.a2 ? (loginEdit.yellowbank_security_a2 || "—") : (loginEdit.yellowbank_security_a2 ? "••••••" : "—")}
                          {loginEdit.yellowbank_security_a2 && (
                            <button onClick={() => toggleShown("a2")} className="text-muted-foreground hover:text-foreground ml-1">
                              {shown.a2 ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                            </button>
                          )}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {/* Identification Used — view mode */}
          {identificationUsed.length > 0 && (
            <div className="pt-2 border-t space-y-1.5">
              <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                <ShieldCheck className="h-3 w-3" /> Identification Used
              </p>
              <div className="flex flex-wrap gap-1.5">
                {identificationUsed.map(t => (
                  <span key={t} className="text-xs px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium">{t}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Contact Selection */}
        {crab && (
          <div className="bg-card border rounded-xl p-5 space-y-3">
            <h3 className="font-semibold text-sm text-muted-foreground">Contact Information for YellowBank</h3>
            <div className="space-y-3">
              <div>
                <Label className="text-xs mb-2 block">Phone Number</Label>
                <PhoneSelector crab={crab} selectedType={module?.selected_phone_type} selectedIndex={module?.selected_phone_index} onChange={handlePhoneSelect} />
              </div>
              <div>
                <Label className="text-xs mb-2 block">Email Address</Label>
                <EmailSelector crab={crab} selectedType={module?.selected_email_type} selectedIndex={module?.selected_email_index} onChange={handleEmailSelect} />
              </div>
              <div>
                <Label className="text-xs mb-2 block">Residential Address</Label>
                <AddressSelector crab={crab} selectedType={module?.selected_address_type} selectedIndex={module?.selected_address_index} onChange={handleAddressSelect} />
              </div>
            </div>
          </div>
        )}

        {/* Accounts & Cards */}
        <div className="bg-card border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Landmark className="h-4 w-4 text-yellow-600" />
              <h3 className="font-semibold text-sm">YellowBank Accounts</h3>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => { setAddingAccount(true); setAddingCard(false); setAddingPayid(false); }}>
                <Plus className="h-3 w-3" /> Account
              </Button>
              <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => { setAddingCard(true); setAddingAccount(false); setAddingPayid(false); }}>
                <Plus className="h-3 w-3" /> Card
              </Button>
              <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => { setAddingPayid(true); setAddingAccount(false); setAddingCard(false); setPayidForm({ payid: "", linked_account_id: "" }); }}>
                <Plus className="h-3 w-3" /> PayID
              </Button>
            </div>
          </div>

          {addingAccount && (
            <YellowBankAccountForm onSave={handleSaveAccount} onCancel={() => setAddingAccount(false)} />
          )}

          {accounts.length === 0 && !addingAccount && (
            <p className="text-xs text-muted-foreground italic">No accounts added yet</p>
          )}

          {accounts.map(acc => (
            <div key={acc.id}>
              {editingAccount?.id === acc.id ? (
                <YellowBankAccountForm initial={acc} onSave={handleSaveAccount} onCancel={() => setEditingAccount(null)} />
              ) : (
                <div className="flex items-start justify-between p-3 bg-muted/40 rounded-lg">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Landmark className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{acc.bank}</span>
                      {acc.account_type && <span className="text-xs text-muted-foreground">({acc.account_type})</span>}
                    </div>
                    <div className="text-xs font-mono text-muted-foreground pl-5">
                      BSB: {acc.bsb} &nbsp;|&nbsp; Acc: {acc.account_number}
                    </div>
                    {acc.bsb_branch_name && (
                      <div className="text-xs text-emerald-700 pl-5">{acc.bsb_branch_name}</div>
                    )}
                    {/* Linked cards */}
                    {cards.length > 0 && (
                      <div className="pl-5 pt-1">
                        <Label className="text-xs flex items-center gap-1 text-muted-foreground"><Link2 className="h-3 w-3" /> Linked Cards</Label>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {cards.map(card => {
                            const linked = card.linked_account_id === acc.id;
                            return (
                              <button
                                key={card.id}
                                onClick={() => handleCardAccountLink(card, linked ? "" : acc.id)}
                                className={`text-[10px] px-2 py-0.5 rounded-full border font-mono transition-colors ${
                                  linked
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-muted text-muted-foreground border-border hover:border-primary"
                                }`}
                              >
                                •••• {card.card_number?.slice(-4) || "????"}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {/* Linked PayIDs */}
                    {payids.filter(p => p.linked_account_id === acc.id).length > 0 && (
                      <div className="pl-5 pt-1">
                        <Label className="text-xs flex items-center gap-1 text-muted-foreground"><AtSign className="h-3 w-3" /> PayID</Label>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {payids.filter(p => p.linked_account_id === acc.id).map((p, idx) => (
                            <span key={idx} className="text-[10px] px-2 py-0.5 rounded-full border font-mono bg-yellow-50 text-yellow-700 border-yellow-200">
                              {p.payid}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-0.5 shrink-0 ml-2">
                    <button onClick={() => setEditingAccount(acc)} className="text-muted-foreground hover:text-foreground p-1"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={() => handleDeleteAccount(acc)} className="text-muted-foreground hover:text-destructive p-1"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Cards section */}
          {(cards.length > 0 || addingCard) && (
            <div className="border-t pt-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                <CreditCard className="h-3.5 w-3.5" /> Cards
              </p>

              {addingCard && (
                <YellowBankCardForm onSave={handleSaveCard} onCancel={() => setAddingCard(false)} accounts={accounts} />
              )}

              {cards.map(card => (
                <CardRow
                  key={card.id}
                  card={card}
                  editing={editingCard?.id === card.id}
                  accounts={accounts}
                  onEdit={() => setEditingCard(card)}
                  onDelete={() => handleDeleteCard(card)}
                  onSave={handleSaveCard}
                  onCancel={() => setEditingCard(null)}
                  onToggleFeature={toggleCardFeature}
                  onLinkAccount={handleCardAccountLink}
                />
              ))}
            </div>
          )}

          {/* PayIDs section */}
          {(payids.length > 0 || addingPayid) && (
            <div className="border-t pt-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                <AtSign className="h-3.5 w-3.5" /> PayIDs
              </p>
              {payids.map((p, idx) => (
                <div key={idx}>
                  {editingPayidIdx === idx ? (
                    <PayidForm form={payidForm} setForm={setPayidForm} accounts={accounts} onSave={handleSavePayid} onCancel={() => { setEditingPayidIdx(null); setPayidForm({ payid: "", linked_account_id: "" }); }} />
                  ) : (
                    <div className="flex items-center justify-between p-2.5 bg-muted/40 rounded-lg">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2 text-sm font-mono">
                          <AtSign className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span>{p.payid}</span>
                        </div>
                        {p.linked_account_id && accounts.find(a => a.id === p.linked_account_id) && (
                          <div className="text-xs text-muted-foreground pl-5">
                            Linked: {accountLabel(accounts.find(a => a.id === p.linked_account_id))}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-0.5 shrink-0 ml-2">
                        <button onClick={() => { setEditingPayidIdx(idx); setPayidForm({ payid: p.payid, linked_account_id: p.linked_account_id || "" }); setAddingPayid(false); }} className="text-muted-foreground hover:text-foreground p-1"><Pencil className="h-3.5 w-3.5" /></button>
                        <button onClick={() => handleDeletePayid(idx)} className="text-muted-foreground hover:text-destructive p-1"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {addingPayid && (
                <PayidForm form={payidForm} setForm={setPayidForm} accounts={accounts} onSave={handleSavePayid} onCancel={() => { setAddingPayid(false); setPayidForm({ payid: "", linked_account_id: "" }); }} />
              )}
            </div>
          )}


        </div>

      </div>
    </TooltipProvider>
  );
}