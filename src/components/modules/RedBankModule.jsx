import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Plus, Pencil, Trash2, CreditCard, Landmark, Smartphone,
  WalletCards, Lock, Link2, KeyRound, Users, Hash, Phone, BadgeCheck
} from "lucide-react";
import { toast } from "sonner";
import RedBankAccountForm from "./RedBankAccountForm";
import RedBankCardForm from "./RedBankCardForm";

const CARD_FEATURE_DEFS = [
  { key: "is_digital", label: "Digital Card", icon: Smartphone, tip: "A virtual/digital-only card (no physical card issued)" },
  { key: "is_physical", label: "Physical Card", icon: CreditCard, tip: "A physical plastic/metal card has been issued" },
  { key: "pin_set", label: "PIN Set", icon: Lock, tip: "A PIN has been set for this card" },
  { key: "digital_wallet", label: "Digital Wallet", icon: WalletCards, tip: "Card has been added to Apple Pay, Google Pay, or similar" },
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

function cardLabel(card) {
  if (!card) return "None";
  const masked = card.card_number ? card.card_number.slice(-4) : "????";
  return `•••• ${masked}${card.expiry ? ` (${card.expiry})` : ""}`;
}

function accountLabel(acc) {
  if (!acc) return "None";
  return `${acc.account_type || "Account"} ${acc.account_number || ""}`.trim();
}

export default function RedBankModule({ crabId }) {
  const [module, setModule] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);

  const [loginEdit, setLoginEdit] = useState({});
  const [loginDirty, setLoginDirty] = useState(false);
  const [savingLogin, setSavingLogin] = useState(false);

  const [addingAccount, setAddingAccount] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [addingCard, setAddingCard] = useState(false);
  const [editingCard, setEditingCard] = useState(null);

  const load = async () => {
    const [mods, accs, cds] = await Promise.all([
      base44.entities.CrabModule.filter({ crab_id: crabId, module_type: "redbank" }),
      base44.entities.RedBankAccount.filter({ crab_id: crabId }, "created_date"),
      base44.entities.RedBankCard.filter({ crab_id: crabId }, "created_date"),
    ]);
    const mod = mods[0] || null;
    setModule(mod);
    setLoginEdit(mod ? {
      redbank_customer_number: mod.redbank_customer_number || "",
      redbank_password: mod.redbank_password || "",
      telephone_access_code: mod.telephone_access_code || "",
      has_joint_accounts: mod.has_joint_accounts || false,
      redbank_joint_holder_name: mod.redbank_joint_holder_name || "",
      redbank_joint_accounts: mod.redbank_joint_accounts || "",
    } : {
      redbank_customer_number: "", redbank_password: "", telephone_access_code: "",
      has_joint_accounts: false, redbank_joint_holder_name: "", redbank_joint_accounts: "",
    });
    setAccounts(accs);
    setCards(cds);
    setLoading(false);
  };

  useEffect(() => { load(); }, [crabId]);

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
      telephone_access_code: loginEdit.telephone_access_code,
      has_joint_accounts: loginEdit.has_joint_accounts,
      redbank_joint_holder_name: loginEdit.has_joint_accounts ? loginEdit.redbank_joint_holder_name : "",
      redbank_joint_accounts: loginEdit.has_joint_accounts ? (Number(loginEdit.redbank_joint_accounts) || 0) : 0,
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
    // Unlink any cards pointing to this account
    const linkedCards = cards.filter(c => c.linked_account_id === acc.id);
    await Promise.all(linkedCards.map(c => base44.entities.RedBankCard.update(c.id, { linked_account_id: "" })));
    await base44.entities.RedBankAccount.delete(acc.id);
    toast.success("Account deleted");
    load();
  };

  const handleSaveCard = async (form) => {
    const mod = await ensureModule();
    let savedCard;
    if (editingCard) {
      await base44.entities.RedBankCard.update(editingCard.id, form);
      savedCard = { ...editingCard, ...form };
      toast.success("Card updated");
      setEditingCard(null);
    } else {
      savedCard = await base44.entities.RedBankCard.create({ ...form, module_id: mod.id, crab_id: crabId });
      toast.success("Card added");
      setAddingCard(false);
    }
    // Sync linked_card_ids on the account side
    await syncAccountCardLinks(savedCard, form.linked_account_id, editingCard?.linked_account_id);
    load();
  };

  // Keep account.linked_card_ids in sync when a card's linked_account_id changes
  const syncAccountCardLinks = async (card, newAccountId, oldAccountId) => {
    if (oldAccountId && oldAccountId !== newAccountId) {
      const oldAcc = accounts.find(a => a.id === oldAccountId);
      if (oldAcc) {
        const updated = (oldAcc.linked_card_ids || []).filter(id => id !== card.id);
        await base44.entities.RedBankAccount.update(oldAcc.id, { linked_card_ids: updated });
      }
    }
    if (newAccountId) {
      const newAcc = accounts.find(a => a.id === newAccountId);
      if (newAcc) {
        const existing = newAcc.linked_card_ids || [];
        if (!existing.includes(card.id)) {
          await base44.entities.RedBankAccount.update(newAcc.id, { linked_card_ids: [...existing, card.id] });
        }
      }
    }
  };

  const handleDeleteCard = async (card) => {
    const masked = card.card_number ? "•••• " + card.card_number.slice(-4) : "this card";
    if (!confirm(`Delete ${masked}?`)) return;
    // Remove from linked account
    if (card.linked_account_id) {
      const acc = accounts.find(a => a.id === card.linked_account_id);
      if (acc) {
        await base44.entities.RedBankAccount.update(acc.id, {
          linked_card_ids: (acc.linked_card_ids || []).filter(id => id !== card.id)
        });
      }
    }
    await base44.entities.RedBankCard.delete(card.id);
    toast.success("Card deleted");
    load();
  };

  const toggleCardFeature = async (card, key) => {
    const updated = { ...card, [key]: !card[key] };
    await base44.entities.RedBankCard.update(card.id, { [key]: updated[key] });
    setCards(cs => cs.map(c => c.id === card.id ? updated : c));
  };

  // Link a card to an account (or unlink)
  const handleCardAccountLink = async (card, newAccountId) => {
    const oldAccountId = card.linked_account_id || "";
    await base44.entities.RedBankCard.update(card.id, { linked_account_id: newAccountId || "" });
    await syncAccountCardLinks({ id: card.id }, newAccountId, oldAccountId);
    load();
  };



  if (loading) return <div className="flex justify-center py-6"><div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  const summary = AccountSummary(accounts);
  const L = (field) => (e) => { setLoginEdit(l => ({ ...l, [field]: e.target.value })); setLoginDirty(true); };

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
              <Input className="mt-1 font-mono" value={loginEdit.redbank_customer_number} onChange={L("redbank_customer_number")} />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1"><Lock className="h-3 w-3" /> Password</Label>
              <Input className="mt-1 font-mono" value={loginEdit.redbank_password} onChange={L("redbank_password")} />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1"><Phone className="h-3 w-3" /> Telephone Access Code</Label>
              <Input
                className="mt-1 font-mono"
                placeholder="3 digits"
                maxLength={3}
                value={loginEdit.telephone_access_code}
                onChange={e => { setLoginEdit(l => ({ ...l, telephone_access_code: e.target.value.replace(/\D/g, "").slice(0, 3) })); setLoginDirty(true); }}
              />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1"><BadgeCheck className="h-3 w-3" /> Account Summary</Label>
              <p className="mt-2 text-sm text-muted-foreground">{summary || <span className="italic">No accounts yet</span>}</p>
            </div>

            {/* Joint Accounts — full width */}
            <div className="col-span-2 space-y-2">
              <Label className="text-xs flex items-center gap-1"><Users className="h-3 w-3" /> Joint Accounts</Label>
              <Select
                value={loginEdit.has_joint_accounts ? "yes" : "no"}
                onValueChange={v => { setLoginEdit(l => ({ ...l, has_joint_accounts: v === "yes" })); setLoginDirty(true); }}
              >
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="no">No</SelectItem>
                  <SelectItem value="yes">Yes</SelectItem>
                </SelectContent>
              </Select>
              {loginEdit.has_joint_accounts && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <Label className="text-xs">Joint Holder Name</Label>
                    <Input className="mt-1" value={loginEdit.redbank_joint_holder_name} onChange={L("redbank_joint_holder_name")} placeholder="Full name" />
                  </div>
                  <div>
                    <Label className="text-xs">Number of Joint Accounts</Label>
                    <Input type="number" min={1} className="mt-1" value={loginEdit.redbank_joint_accounts} onChange={L("redbank_joint_accounts")} />
                  </div>
                </div>
              )}
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
            <RedBankAccountForm onSave={handleSaveAccount} onCancel={() => setAddingAccount(false)} cards={cards} />
          )}

          {accounts.length === 0 && !addingAccount && (
            <p className="text-xs text-muted-foreground italic">No accounts added yet</p>
          )}

          {accounts.map(acc => (
            <div key={acc.id}>
              {editingAccount?.id === acc.id ? (
                <RedBankAccountForm initial={acc} onSave={handleSaveAccount} onCancel={() => setEditingAccount(null)} cards={cards} />
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
                      <div className="text-xs text-emerald-700 pl-5">
                        {acc.bsb_branch_name}
                      </div>
                    )}
                    {/* Linked cards — Choice accounts only */}
                    {acc.account_type?.toLowerCase().includes("choice") && cards.length > 0 && (
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
                <RedBankCardForm onSave={handleSaveCard} onCancel={() => setAddingCard(false)} accounts={accounts} />
              )}

              {cards.map(card => (
                <div key={card.id}>
                  {editingCard?.id === card.id ? (
                    <RedBankCardForm initial={card} onSave={handleSaveCard} onCancel={() => setEditingCard(null)} accounts={accounts} />
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
                                <input type="checkbox" checked={!!card[key]} onChange={() => toggleCardFeature(card, key)} className="rounded" />
                                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground">{label}</span>
                              </label>
                            </TooltipTrigger>
                            <TooltipContent><p className="text-xs max-w-xs">{tip}</p></TooltipContent>
                          </Tooltip>
                        ))}
                      </div>
                      {/* Linked account selector */}
                      {accounts.length > 0 && (
                        <div className="pl-1">
                          <Label className="text-xs flex items-center gap-1 text-muted-foreground mb-1"><Link2 className="h-3 w-3" /> Linked Account</Label>
                          <Select
                            value={card.linked_account_id || "__none__"}
                            onValueChange={v => handleCardAccountLink(card, v === "__none__" ? "" : v)}
                          >
                            <SelectTrigger className="h-7 text-xs">
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