import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

export default function CrabCheatSheet() {
  const urlParams = new URLSearchParams(window.location.search);
  const id = urlParams.get("id");

  const [crab, setCrab] = useState(null);
  const [rbMod, setRbMod] = useState(null);
  const [ybMod, setYbMod] = useState(null);
  const [rbAccounts, setRbAccounts] = useState([]);
  const [rbCards, setRbCards] = useState([]);
  const [ybAccounts, setYbAccounts] = useState([]);
  const [ybCards, setYbCards] = useState([]);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      base44.entities.Crab.filter({ id }, "full_name", 1),
      base44.entities.CrabModule.filter({ crab_id: id }),
    ]).then(async ([crabs, mods]) => {
      const c = crabs[0];
      setCrab(c);
      const rb = mods.find(m => m.module_type === "redbank") || null;
      const yb = mods.find(m => m.module_type === "yellowbank") || null;
      setRbMod(rb);
      setYbMod(yb);

      const fetches = [
        base44.entities.CrabDevice.filter({ crab_id: id }, "created_date").then(setDevices),
      ];
      if (rb) {
        fetches.push(
          base44.entities.RedBankAccount.filter({ crab_id: id }, "created_date").then(setRbAccounts),
          base44.entities.RedBankCard.filter({ crab_id: id }, "created_date").then(setRbCards),
        );
      }
      if (yb) {
        fetches.push(
          base44.entities.YellowBankAccount.filter({ crab_id: id }, "created_date").then(setYbAccounts),
          base44.entities.YellowBankCard.filter({ crab_id: id }, "created_date").then(setYbCards),
        );
      }
      await Promise.all(fetches);
      setLoading(false);
    });
  }, [id]);

  useEffect(() => {
    if (!loading && crab) {
      setTimeout(() => window.print(), 500);
    }
  }, [loading, crab]);

  if (loading || !crab) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-6 h-6 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const fullName = [crab.first_name, crab.middle_name, crab.surname].filter(Boolean).join(" ");
  const surnameUpper = crab.surname?.toUpperCase() || "";
  const displayName = [crab.first_name, crab.middle_name, surnameUpper].filter(Boolean).join(" ");

  const dob = crab.date_of_birth
    ? new Date(crab.date_of_birth).toLocaleDateString("en-AU", { day: "2-digit", month: "2-digit", year: "numeric" })
    : null;

  const getSelectedPhone = (mod) => {
    if (!mod || !crab) return crab?.phone || null;
    if (mod.selected_phone_type === "additional" && mod.selected_phone_index != null) {
      return crab.additional_phones?.[mod.selected_phone_index]?.number || crab.phone;
    }
    return crab.phone || null;
  };

  const getSelectedAddress = (mod) => {
    if (!mod || !crab) {
      return formatAddress(crab?.address1, crab?.address2, crab?.suburb, crab?.state, crab?.postcode);
    }
    if (mod.selected_address_type === "additional" && mod.selected_address_index != null) {
      const a = crab.additional_addresses?.[mod.selected_address_index];
      if (a) return formatAddress(a.address1, a.address2, a.suburb, a.state, a.postcode);
    }
    return formatAddress(crab.address1, crab.address2, crab.suburb, crab.state, crab.postcode);
  };

  const formatAddress = (a1, a2, suburb, state, postcode) => {
    const line1 = [a1, a2].filter(Boolean).join(", ");
    const line2 = [suburb, state, postcode].filter(Boolean).join(" ");
    return [line1, line2].filter(Boolean).join(", ");
  };

  const now = new Date();
  const generatedStr = now.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" }) +
    " at " + now.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: true });

  const formatSalary = (v) => {
    if (!v) return null;
    return "$" + Number(v).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatCommencementDate = (d) => {
    if (!d) return null;
    return new Date(d).toLocaleDateString("en-AU", { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter', Arial, sans-serif; background: white; color: #111; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        @page { size: A4; margin: 15mm; }
        @media print {
          .no-print { display: none !important; }
          .page-break { page-break-before: always; }
        }
        table { border-collapse: collapse; width: 100%; }
        td { padding: 5px 8px; border-bottom: 1px solid #eee; font-size: 10.5px; vertical-align: top; }
        .label-col { color: #666; width: 42%; }
        .value-col { font-weight: 600; color: #111; }
        .section-title { font-size: 9px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; color: #888; margin-top: 14px; margin-bottom: 4px; }
      `}</style>

      {/* Screen-only buttons */}
      <div className="no-print" style={{ position: 'fixed', top: 12, right: 12, display: 'flex', gap: 8, zIndex: 999 }}>
        <button onClick={() => window.print()} style={{ background: '#1d4ed8', color: 'white', border: 'none', padding: '6px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>Print</button>
        <button onClick={() => window.close()} style={{ background: '#6b7280', color: 'white', border: 'none', padding: '6px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>Close</button>
      </div>

      <div style={{ maxWidth: 760, margin: '0 auto' }}>

        {/* ═══════════════════════════════════════════
            PAGE 1 — YellowBank (only if yb module exists)
            ═══════════════════════════════════════════ */}
        {ybMod && (
          <div style={{ paddingTop: 0 }}>
            <PageHeader fullName={fullName} bank="YellowBank" bankColor="#a06000" generatedStr={generatedStr} />
            <PersonSection crab={crab} displayName={displayName} dob={dob} phone={getSelectedPhone(ybMod)} address={getSelectedAddress(ybMod)} />
            <YellowBankSection mod={ybMod} accounts={ybAccounts} cards={ybCards} formatSalary={formatSalary} formatDate={formatCommencementDate} />
            <DevicesSection devices={devices} />
            <PageFooter generatedStr={generatedStr} />
          </div>
        )}

        {/* ═══════════════════════════════════════════
            PAGE 2 — RedBank (only if rb module exists)
            ═══════════════════════════════════════════ */}
        {rbMod && (
          <div className={ybMod ? "page-break" : ""} style={{ paddingTop: ybMod ? 0 : 0 }}>
            <PageHeader fullName={fullName} bank="RedBank" bankColor="#b91c1c" generatedStr={generatedStr} />
            <PersonSection crab={crab} displayName={displayName} dob={dob} phone={getSelectedPhone(rbMod)} address={getSelectedAddress(rbMod)} />
            <RedBankSection mod={rbMod} accounts={rbAccounts} cards={rbCards} />
            <DevicesSection devices={devices} />
            <PageFooter generatedStr={generatedStr} />
          </div>
        )}

      </div>
    </>
  );
}

/* ─── Page Header ─── */
function PageHeader({ fullName, bank, bankColor, generatedStr }) {
  return (
    <div>
      {/* Top row: logo left, bank name right */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 22 }}>🦀</span>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: 1, color: '#111' }}>CRABCLAWS</div>
            <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: 1.5, color: '#888', textTransform: 'uppercase' }}>Emergency Profile Details</div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: bankColor }}>{bank}</div>
          <div style={{ fontSize: 10, color: '#888', marginTop: 1 }}>{fullName}</div>
        </div>
      </div>
      {/* Amber divider line */}
      <div style={{ height: 3, background: 'linear-gradient(to right, #f59e0b, #fbbf24)', borderRadius: 2, marginBottom: 10 }} />
      {/* Confidential banner */}
      <div style={{ background: '#fffbeb', border: '1px solid #fbbf24', borderRadius: 6, padding: '6px 12px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13 }}>⚠️</span>
        <span style={{ fontSize: 10, color: '#92400e' }}>
          <strong>CONFIDENTIAL</strong> — Keep this document in a secure location. Do not share with unauthorised persons.
        </span>
      </div>
    </div>
  );
}

/* ─── Person / Common Section ─── */
function PersonSection({ crab, displayName, dob, phone, address }) {
  const hasAliases = (crab.aliases || []).length > 0;
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="section-title">Personal Details</div>
      <table>
        <tbody>
          <DataRow label="Full Name" value={displayName} />
          {hasAliases && <DataRow label="Known Aliases" value={crab.aliases.join(", ")} />}
          {dob && <DataRow label="Date of Birth" value={dob} />}
          {phone && <DataRow label="Mobile Number" value={phone} />}
          {crab.email && <DataRow label="Email" value={crab.email} />}
          {address && <DataRow label="Address" value={address} />}
        </tbody>
      </table>
    </div>
  );
}

/* ─── YellowBank Section ─── */
function YellowBankSection({ mod, accounts, cards, formatSalary, formatDate }) {
  const hasEmployer = mod.yellowbank_employer || mod.yellowbank_job_role || mod.yellowbank_annual_salary || mod.yellowbank_commencement_date;
  const hasSecurity = mod.yellowbank_security_q1 || mod.yellowbank_security_q2;

  return (
    <div>
      {/* Account & Security */}
      <div className="section-title">Account &amp; Security</div>
      <table>
        <tbody>
          {mod.yellowbank_client_number && <DataRow label="Client Number" value={mod.yellowbank_client_number} />}
          {mod.yellowbank_password && <DataRow label="Password" value={mod.yellowbank_password} />}
          {mod.yellowbank_app_pin && <DataRow label="App PIN" value={mod.yellowbank_app_pin} />}
          {mod.yellowbank_telephone_pin && <DataRow label="Telephone PIN" value={mod.yellowbank_telephone_pin} />}
          {mod.yellowbank_last_branch && <DataRow label="Last Branch" value={mod.yellowbank_last_branch} />}
          {mod.yellowbank_last_branch_purpose && <DataRow label="Branch Purpose" value={mod.yellowbank_last_branch_purpose} />}
        </tbody>
      </table>

      {/* Security Questions */}
      {hasSecurity && (
        <>
          <div className="section-title">Security Questions</div>
          <table>
            <tbody>
              {mod.yellowbank_security_q1 && <DataRow label={mod.yellowbank_security_q1} value={mod.yellowbank_security_a1 || "—"} />}
              {mod.yellowbank_security_q2 && <DataRow label={mod.yellowbank_security_q2} value={mod.yellowbank_security_a2 || "—"} />}
            </tbody>
          </table>
        </>
      )}

      {/* Employment */}
      {hasEmployer && (
        <>
          <div className="section-title">Employment</div>
          <table>
            <tbody>
              {mod.yellowbank_employer && <DataRow label="Employer" value={mod.yellowbank_employer} />}
              {mod.yellowbank_job_role && <DataRow label="Job Role" value={mod.yellowbank_job_role} />}
              {mod.yellowbank_annual_salary && <DataRow label="Annual Salary" value={formatSalary(mod.yellowbank_annual_salary)} />}
              {mod.yellowbank_commencement_date && <DataRow label="Commencement Date" value={formatDate(mod.yellowbank_commencement_date)} />}
            </tbody>
          </table>
        </>
      )}

      {/* Accounts */}
      {accounts.length > 0 && (
        <>
          <div className="section-title">Bank Accounts</div>
          <table>
            <tbody>
              {accounts.map(a => (
                <DataRow key={a.id} label={a.account_type || "Account"} value={`BSB ${a.bsb}  |  ${a.account_number}${a.bsb_branch_name ? `  (${a.bsb_branch_name})` : ""}`} />
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* Cards */}
      {cards.length > 0 && (
        <>
          <div className="section-title">Cards</div>
          {cards.map(c => (
            <div key={c.id} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#555', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                •••• {(c.card_number || "").slice(-4)}
              </div>
              <table>
                <tbody>
                  <DataRow label="Card Number" value={c.card_number} />
                  {c.expiry && <DataRow label="Expiry" value={c.expiry} />}
                  {c.ccv && <DataRow label="CVV" value={c.ccv} />}
                  {c.pin && <DataRow label="PIN" value={c.pin} />}
                  {c.credit_limit && <DataRow label="Credit Limit" value={`$${Number(c.credit_limit).toLocaleString("en-AU", { minimumFractionDigits: 2 })}`} />}
                </tbody>
              </table>
            </div>
          ))}
        </>
      )}

      {/* PayIDs */}
      {(mod.yellowbank_payids || []).length > 0 && (
        <>
          <div className="section-title">PayIDs</div>
          <table>
            <tbody>
              {mod.yellowbank_payids.map((p, i) => (
                <DataRow key={i} label={`PayID ${i + 1}`} value={p.payid} />
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

/* ─── RedBank Section ─── */
function RedBankSection({ mod, accounts, cards }) {
  return (
    <div>
      <div className="section-title">Account &amp; Security</div>
      <table>
        <tbody>
          {mod.redbank_customer_number && <DataRow label="Customer Number" value={mod.redbank_customer_number} />}
          {mod.redbank_password && <DataRow label="Password" value={mod.redbank_password} />}
          {mod.redbank_app_pin && <DataRow label="App PIN" value={mod.redbank_app_pin} />}
          {mod.telephone_access_code && <DataRow label="Telephone Access Code" value={mod.telephone_access_code} />}
          {mod.has_joint_accounts && mod.redbank_joint_holder_name && (
            <DataRow label="Joint Holder" value={mod.redbank_joint_holder_name} />
          )}
        </tbody>
      </table>

      {accounts.length > 0 && (
        <>
          <div className="section-title">Bank Accounts</div>
          <table>
            <tbody>
              {accounts.map(a => (
                <DataRow key={a.id} label={a.account_type || "Account"} value={`BSB ${a.bsb}  |  ${a.account_number}${a.bsb_branch_name ? `  (${a.bsb_branch_name})` : ""}`} />
              ))}
            </tbody>
          </table>
        </>
      )}

      {cards.length > 0 && (
        <>
          <div className="section-title">Cards</div>
          {cards.map(c => (
            <div key={c.id} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#555', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                •••• {(c.card_number || "").slice(-4)}
              </div>
              <table>
                <tbody>
                  <DataRow label="Card Number" value={c.card_number} />
                  {c.expiry && <DataRow label="Expiry" value={c.expiry} />}
                  {c.ccv && <DataRow label="CVV" value={c.ccv} />}
                  {c.pin && <DataRow label="PIN" value={c.pin} />}
                </tbody>
              </table>
            </div>
          ))}
        </>
      )}

      {(mod.redbank_payids || []).length > 0 && (
        <>
          <div className="section-title">PayIDs</div>
          <table>
            <tbody>
              {mod.redbank_payids.map((p, i) => (
                <DataRow key={i} label={`PayID ${i + 1}`} value={p.payid} />
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

/* ─── Devices Section ─── */
function DevicesSection({ devices }) {
  if (!devices || devices.length === 0) return null;
  return (
    <div>
      <div className="section-title">Devices</div>
      {devices.map((d, i) => (
        <div key={d.id} style={{ marginBottom: 6 }}>
          {devices.length > 1 && (
            <div style={{ fontSize: 10, fontWeight: 700, color: '#555', marginBottom: 2 }}>
              Device {i + 1}{d.brand || d.model ? ` — ${[d.brand, d.model].filter(Boolean).join(" ")}` : ""}
            </div>
          )}
          <table>
            <tbody>
              {d.brand && <DataRow label="Brand" value={d.brand} />}
              {d.model && <DataRow label="Model" value={d.model} />}
              {d.colour && <DataRow label="Colour" value={d.colour} />}
              {d.imei && <DataRow label="IMEI" value={d.imei} />}
              {(d.used_for || []).length > 0 && <DataRow label="Used For" value={d.used_for.join(", ")} />}
              {d.notes && <DataRow label="Notes" value={d.notes} />}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

/* ─── Page Footer ─── */
function PageFooter({ generatedStr }) {
  return (
    <div style={{ marginTop: 24, borderTop: '1px solid #eee', paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 9, color: '#aaa' }}>Generated {generatedStr}</span>
      <span style={{ fontSize: 9, color: '#aaa', display: 'flex', alignItems: 'center', gap: 4 }}>
        🦀 CrabClaws — Store securely
      </span>
    </div>
  );
}

/* ─── Table Row ─── */
function DataRow({ label, value }) {
  if (!value) return null;
  return (
    <tr>
      <td className="label-col">{label}</td>
      <td className="value-col">{value}</td>
    </tr>
  );
}