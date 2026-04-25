import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Plus, Pencil, Trash2, CreditCard, Landmark, Smartphone,
  WalletCards, Lock, Link2, BadgeCheck, KeyRound, Users, Hash
} from "lucide-react";
import { toast } from "sonner";
import RedBankAccountForm from "./RedBankAccountForm";
import RedBankCardForm from "./RedBankCardForm";

const CARD_FEATURE_DEFS = [
  { key: "is_digital", label: "Digital Card", icon: Smartphone, tip: "A virtual/digital-only card (no physical card issued)" },
  { key: "is_physical", label: "Physical Card", icon: CreditCard, tip: "A physical plastic/metal card has been issued" },
  { key: "pin_set", label: "PIN Set", icon: Lock, tip: "A PIN has been set for this card" },
  { key: "digital_wallet", label: "Digital Wallet", icon: WalletCards, tip: "Card has been added to Apple Pay, Google Pay, or similar" },
  { key: "linked_card", label: "Linked Card", icon: Link2, tip: "This card is linked to another account or person" },
];

function AccountSummary(accounts) {
  if (!accounts.length) return "";
  const counts = {};
  accounts.forEach(a => {
    const t = a.account_type || "Unknown";
    counts[t] = (counts[t] || 0) + 1;
  });
  return Object.entries(counts).map(([t, n]) => `${n} × ${t}`).join(", ");
}

export default function RedBankModule({ crabId }) {
  const [module, setModule] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);

  // login section state
  const [loginEdit, setLoginEdit] = useState({});
  const [loginDirty, setLoginDirty] = useState(false);
  const [savingLogin, setSavingLogin] = useState(false);

  // account / card form state
  const [addingAccount, setAddingAccount] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [addingCard, setAddingCard] = useState(false);
  const [editingCard, setEditingCard] = useState(null);

  const load = async () => {
    const [mods, accs, cds] = await Promise.all([
      base44.entities.CrabModule.filter({ crab_id: crabId, module_type: "redbank" }),
      base44.entities.RedBankAccount.filter({ crab_id: crabId }),
      base44.entities.RedBankCard.filter({ crab_id: crabId }),
    ]);
    const mod = mods[0] || null;
    setModule(mod);
    setLoginEdit(mod ? {
      redbank_customer_number: mod.redbank_customer_number || "",
      redbank_password: mod.redbank_password || "",
      redbank_joint_accounts: mod.redbank_joint_accounts || "",
    } : { redbank_customer_number: "", redbank_password: "", redbank_joint_accounts: "" });
    setAccounts(accs);
    setCards(cds);
    setLoading(false);
  };

  useEffect(() => { load(); }, [crabId]);

  // Ensure module exists before saving anything
  const ensureModule = async () => {
    if (module) return module;
    const created = await base44.entities.CrabModule.create({ crab_id: crabId, module_type: "redbank" });
    setModule(created);
    return created;
  };

  const saveLogin = async () => {
    setSavingLogin(true);
    const mod = await ensureModule();
    await base44.entities.CrabModule.update(mod.id, {
      redbank_customer_number: loginEdit.redbank_customer_number,
      redbank_password: loginEdit.redbank_password,
      redbank_joint_accounts: Number(loginEdit.redbank_joint_accounts) || 0,
    });
    toast.success("Login details saved");
    setLoginDirty(false);
    setSavingLogin(false);
    load();
  };

  const handleSaveAccount = async (form) => {
    const mod = await ensureModule();
    if (editingAccount) {
      await base44.entities.RedBankAccount.update(editingAccount.id, form);
      toast.success("Account updated");
      setEditingAccount(null);
    } else {
      await base44.entities.RedBankAccount.create({ ...form, module_id: mod.id, crab_id: crabId });
      toast.success("Account added");
      setAddingAccount(false);
    }
    load();
  };

  const handleDeleteAccount = async (acc) => {
    if (!confirm(`Delete account ${acc.account_type || ""} ${acc.account_number}?`)) return;
    await base44.entities.RedBankAccount.delete(acc.id);
    toast.success("Account deleted");
    load();
  };

  const handleSaveCard = async (form) => {
    const mod = await ensureModule();
    if (editingCard) {
      await base44.entities.RedBankCard.update(editingCard.id, form);
      toast.success("Card updated");
      setEditingCard(null);
    } else {
      await base44.entities.RedBankCard.create({ ...form, module_id: mod.id, crab_id: crabId });
      toast.success("Card added");
      setAddingCard(false);
    }
    load();
  };

  const handleDeleteCard = async (card) => {
    const masked = card.card_number ? "•••• " + card.card_number.slice(-4) : "this card";
    if (!confirm(`Delete ${masked}?`)) return;
    await base44.entities.RedBankCard.delete(card.id);
    toast.success("Card deleted");
    load();
  };

  const toggleCardFeature = async (card, key) => {
    const updated = { ...card, [key]: !card[key] };
    await base44.entities.RedBankCard.update(card.id, { [key]: updated[key] });
    setCards(cs => cs.map(c => c.id === card.id ? updated : c));
  };

  if (loading) return <div className="flex justify-center py-6"><div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  const summary = AccountSummary(accounts);

  return (
    <TooltipProvider>
      <div className="space-y-5">

        {/* Login & Security */}
        <div className="bg-card border rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-red-600" />
            <h3 className="font-semibold text-sm">MyRedBank Login &amp; Security</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs flex items-center gap-1"><Hash className="h-3 w-3" /> Customer Number</Label>
              <Input className="mt-1 font-mono" value={loginEdit.redbank_customer_number}
                onChange={e => { setLoginEdit(l => ({ ...l, redbank_customer_number: e.target.value })); setLoginDirty(true); }} />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1"><Lock className="h-3 w-3" /> Password</Label>
              <Input className="mt-1 font-mono" value={loginEdit.redbank_password}
                onChange={e => { setLoginEdit(l => ({ ...l, redbank_password: e.target.value })); setLoginDirty(true); }} />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1"><Users className="h-3 w-3" /> Joint Accounts</Label>
              <Input type="number" min={0} className="mt-1" value={loginEdit.redbank_joint_accounts}
                onChange={e => { setLoginEdit(l => ({ ...l, redbank_joint_accounts: e.target.value })); setLoginDirty(true); }} />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1"><BadgeCheck className="h-3 w-3" /> Account Summary</Label>
              <p className="mt-2 text-sm text-muted-foreground">{summary || <span className="italic">No accounts yet</span>}</p>
            </div>
          </div>
          {loginDirty && (
            <Button size="sm" onClick={saveLogin} disabled={savingLogin} className="gap-1">
              {savingLogin ? "Saving…" : "Save Login Details"}
            </Button>
          )}
        </div>

        {/* Accounts */}
        <div className="bg-card border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Landmark className="h-4 w-4 text-red-600" />
              <h3 className="font-semibold text-sm">RedBank Accounts</h3>
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
            <RedBankAccountForm onSave={handleSaveAccount} onCancel={() => setAddingAccount(false)} />
          )}

          {accounts.length === 0 && !addingAccount && (
            <p className="text-xs text-muted-foreground italic">No accounts added yet</p>
          )}

          {accounts.map(acc => (
            <div key={acc.id}>
              {editingAccount?.id === acc.id ? (
                <RedBankAccountForm initial={acc} onSave={handleSaveAccount} onCancel={() => setEditingAccount(null)} />
              ) : (
                <div className="flex items-start justify-between p-3 bg-muted/40 rounded-lg">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Landmark className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{acc.bank}</span>
                      {acc.account_type && <span className="text-xs text-muted-foreground">({acc.account_type})</span>}
                    </div>
                    <div className="text-xs font-mono text-muted-foreground pl-5">
                      BSB: {acc.bsb} &nbsp;|&nbsp; Acc: {acc.account_number}
                    </div>
                    {acc.bsb_institution_name && (
                      <div className="text-xs text-emerald-700 pl-5">
                        {acc.bsb_institution_name} — {acc.bsb_branch_name}
                        {acc.bsb_address ? `, ${acc.bsb_address}` : ""}
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

          {/* Cards (shown after accounts) */}
          {(cards.length > 0 || addingCard) && (
            <div className="border-t pt-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                <CreditCard className="h-3.5 w-3.5" /> Cards
              </p>

              {addingCard && (
                <RedBankCardForm onSave={handleSaveCard} onCancel={() => setAddingCard(false)} />
              )}

              {cards.map(card => (
                <div key={card.id}>
                  {editingCard?.id === card.id ? (
                    <RedBankCardForm initial={card} onSave={handleSaveCard} onCancel={() => setEditingCard(null)} />
                  ) : (
                    <div className="p-3 bg-muted/40 rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm font-mono font-medium">
                          <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{card.card_number || "—"}</span>
                          <span className="text-xs text-muted-foreground font-sans">Exp: {card.expiry}</span>
                          <span className="text-xs text-muted-foreground font-sans">CCV: {card.ccv}</span>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => setEditingCard(card)} className="text-muted-foreground hover:text-foreground p-1"><Pencil className="h-3.5 w-3.5" /></button>
                          <button onClick={() => handleDeleteCard(card)} className="text-muted-foreground hover:text-destructive p-1"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </div>
                      {/* Feature checkboxes */}
                      <div className="flex flex-wrap gap-3 pl-1">
                        {CARD_FEATURE_DEFS.map(({ key, label, icon: Icon, tip }) => (
                          <Tooltip key={key}>
                            <TooltipTrigger asChild>
                              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={!!card[key]}
                                  onChange={() => toggleCardFeature(card, key)}
                                  className="rounded"
                                />
                                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground">{label}</span>
                              </label>
                            </TooltipTrigger>
                            <TooltipContent><p className="text-xs max-w-xs">{tip}</p></TooltipContent>
                          </Tooltip>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add buttons at bottom if already have items */}
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