import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Plus, Pencil, Trash2, CreditCard, Landmark, Smartphone,
  WalletCards, Lock, Link2, KeyRound, Hash, Phone, Building2,
  ShieldQuestion, MapPin
} from "lucide-react";
import { toast } from "sonner";
import YellowBankAccountForm from "./YellowBankAccountForm";
import YellowBankCardForm from "./YellowBankCardForm";



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

export default function YellowBankModule({ crabId }) {
  const [module, setModule] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);

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
  });
  const [loginDirty, setLoginDirty] = useState(false);
  const [savingLogin, setSavingLogin] = useState(false);

  const [addingAccount, setAddingAccount] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [addingCard, setAddingCard] = useState(false);
  const [editingCard, setEditingCard] = useState(null);

  const load = async () => {
    const [mods, accs, cds] = await Promise.all([
      base44.entities.CrabModule.filter({ crab_id: crabId, module_type: "yellowbank" }),
      base44.entities.YellowBankAccount.filter({ crab_id: crabId }, "created_date"),
      base44.entities.YellowBankCard.filter({ crab_id: crabId }, "created_date"),
    ]);
    const mod = mods[0] || null;
    setModule(mod);
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
      });
    }
    setAccounts(accs);
    setCards(cds);
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
    await base44.entities.CrabModule.update(mod.id, loginEdit);
    toast.success("Login details saved");
    setLoginDirty(false);
    setSavingLogin(false);
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

  if (loading) return <div className="flex justify-center py-6"><div className="w-5 h-5 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" /></div>;

  const summary = AccountSummary(accounts);

  return (
    <TooltipProvider>
      <div className="space-y-5">

        {/* Login & Security */}
        <div className="bg-card border rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-yellow-600" />
            <h3 className="font-semibold text-sm">Yellow Bank Login &amp; Security</h3>
          </div>

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

          {/* Security Questions */}
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

          {/* Last Branch */}
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

          {loginDirty && (
            <Button size="sm" onClick={saveLogin} disabled={savingLogin} className="gap-1">
              {savingLogin ? "Saving…" : "Save Login Details"}
            </Button>
          )}
        </div>

        {/* Accounts & Cards */}
        <div className="bg-card border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Landmark className="h-4 w-4 text-yellow-600" />
              <h3 className="font-semibold text-sm">Yellow Bank Accounts</h3>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => { setAddingAccount(true); setAddingCard(false); }}>
                <Plus className="h-3 w-3" /> Add Account
              </Button>
              <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => { setAddingCard(true); setAddingAccount(false); }}>
                <Plus className="h-3 w-3" /> Add Card
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
                  </div>
                  <div className="flex gap-1 shrink-0 ml-2">
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
                <div key={card.id}>
                  {editingCard?.id === card.id ? (
                    <YellowBankCardForm initial={card} onSave={handleSaveCard} onCancel={() => setEditingCard(null)} accounts={accounts} />
                  ) : (
                    <div className="p-3 bg-muted/40 rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm font-mono font-medium">
                          <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{card.card_number || "—"}</span>
                          <span className="text-xs text-muted-foreground font-sans">Exp: {card.expiry}</span>
                          <span className="text-xs text-muted-foreground font-sans">CCV: {card.ccv}</span>
                          {card.pin && <span className="text-xs text-muted-foreground font-sans">PIN: {card.pin}</span>}
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => setEditingCard(card)} className="text-muted-foreground hover:text-foreground p-1"><Pencil className="h-3.5 w-3.5" /></button>
                          <button onClick={() => handleDeleteCard(card)} className="text-muted-foreground hover:text-destructive p-1"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-3 pl-1">
                        {CARD_FEATURE_DEFS.map(({ key, label, icon: Icon, tip }) => (
                          <Tooltip key={key}>
                            <TooltipTrigger asChild>
                              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                <input type="checkbox" checked={!!card[key]} onChange={() => toggleCardFeature(card, key)} className="rounded" />
                                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground">{label}</span>
                              </label>
                            </TooltipTrigger>
                            <TooltipContent><p className="text-xs max-w-xs">{tip}</p></TooltipContent>
                          </Tooltip>
                        ))}
                      </div>
                      {accounts.length > 0 && (
                        <div className="pl-1">
                          <Label className="text-xs flex items-center gap-1 text-muted-foreground mb-1"><Link2 className="h-3 w-3" /> Linked Account</Label>
                          <Select
                            value={card.linked_account_id || "__none__"}
                            onValueChange={v => handleCardAccountLink(card, v === "__none__" ? "" : v)}
                          >
                            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="No account linked" /></SelectTrigger>
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
                  )}
                </div>
              ))}
            </div>
          )}

          {(accounts.length > 0 || cards.length > 0) && !addingAccount && !addingCard && (
            <div className="flex gap-2 pt-1 border-t">
              <Button size="sm" variant="ghost" className="gap-1 text-xs text-muted-foreground" onClick={() => setAddingAccount(true)}>
                <Plus className="h-3 w-3" /> Add Account
              </Button>
              <Button size="sm" variant="ghost" className="gap-1 text-xs text-muted-foreground" onClick={() => setAddingCard(true)}>
                <Plus className="h-3 w-3" /> Add Card
              </Button>
            </div>
          )}
        </div>

      </div>
    </TooltipProvider>
  );
}