import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

export default function CrabCheatSheet() {
  const urlParams = new URLSearchParams(window.location.search);
  const id = urlParams.get("id");

  const [crab, setCrab] = useState(null);
  const [module, setModule] = useState(null);
  const [rbAccounts, setRbAccounts] = useState([]);
  const [rbCards, setRbCards] = useState([]);
  const [ybAccounts, setYbAccounts] = useState([]);
  const [ybCards, setYbCards] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      base44.entities.Crab.filter({ id }, "full_name", 1),
      base44.entities.CrabModule.filter({ crab_id: id }),
    ]).then(async ([crabs, mods]) => {
      const c = crabs[0];
      setCrab(c);
      const rbMod = mods.find(m => m.module_type === "redbank");
      const ybMod = mods.find(m => m.module_type === "yellowbank");
      setModule({ rb: rbMod, yb: ybMod });

      const fetches = [];
      if (rbMod) {
        fetches.push(
          base44.entities.RedBankAccount.filter({ crab_id: id }, "created_date").then(setRbAccounts),
          base44.entities.RedBankCard.filter({ crab_id: id }, "created_date").then(setRbCards),
        );
      }
      if (ybMod) {
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
      setTimeout(() => window.print(), 400);
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
  const dob = crab.date_of_birth
    ? new Date(crab.date_of_birth).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })
    : null;

  const rb = module?.rb;
  const yb = module?.yb;

  const address = [crab.address1, crab.address2, [crab.suburb, crab.state, crab.postcode].filter(Boolean).join(" ")]
    .filter(Boolean).join(", ");

  return (
    <>
      <style>{`
        @page { size: A4; margin: 12mm; }
        @media print {
          body { margin: 0; }
          .no-print { display: none !important; }
        }
        body { font-family: 'Arial', sans-serif; background: white; color: #111; }
      `}</style>

      {/* Print button — hidden when printing */}
      <div className="no-print fixed top-3 right-3 flex gap-2">
        <button
          onClick={() => window.print()}
          style={{ background: '#1d4ed8', color: 'white', border: 'none', padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
        >
          Print
        </button>
        <button
          onClick={() => window.close()}
          style={{ background: '#6b7280', color: 'white', border: 'none', padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
        >
          Close
        </button>
      </div>

      {/* A4 sheet */}
      <div style={{ width: '100%', maxWidth: 760, margin: '0 auto', padding: '8px 0', fontSize: 11, lineHeight: 1.4, color: '#111' }}>

        {/* Header */}
        <div style={{ borderBottom: '2px solid #111', paddingBottom: 6, marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 'bold', letterSpacing: 0.5 }}>{fullName}</div>
            {(crab.aliases || []).length > 0 && (
              <div style={{ fontSize: 10, color: '#555' }}>aka: {crab.aliases.join(", ")}</div>
            )}
          </div>
          <div style={{ textAlign: 'right', fontSize: 10, color: '#555' }}>
            <div>EMERGENCY CHEAT SHEET</div>
            <div>Generated {new Date().toLocaleDateString("en-AU")}</div>
          </div>
        </div>

        {/* Photo + Core details row */}
        <div style={{ display: 'flex', gap: 14, marginBottom: 10 }}>
          {crab.photo_url && (
            <img src={crab.photo_url} alt="Photo" style={{ width: 80, height: 100, objectFit: 'cover', border: '1px solid #ccc', flexShrink: 0 }} />
          )}
          <div style={{ flex: 1 }}>
            <Table>
              {dob && <Row label="Date of Birth" value={dob} />}
              {crab.phone && <Row label="Main Phone" value={crab.phone} />}
              {crab.email && <Row label="Main Email" value={crab.email} />}
              {address && <Row label="Address" value={address} />}
              {crab.status && crab.status !== "active" && <Row label="Status" value={crab.status.toUpperCase()} highlight />}
            </Table>
          </div>
        </div>

        {/* Additional phones */}
        {(crab.additional_phones || []).length > 0 && (
          <Section title="Additional Phone Numbers">
            <Table>
              {crab.additional_phones.map((p, i) => <Row key={i} label={p.label || `Phone ${i+1}`} value={p.number} />)}
            </Table>
          </Section>
        )}

        {/* Additional emails */}
        {(crab.additional_emails || []).length > 0 && (
          <Section title="Additional Emails">
            <Table>
              {crab.additional_emails.map((e, i) => <Row key={i} label={e.label || `Email ${i+1}`} value={e.email} />)}
            </Table>
          </Section>
        )}

        {/* Additional addresses */}
        {(crab.additional_addresses || []).length > 0 && (
          <Section title="Additional Addresses">
            <Table>
              {crab.additional_addresses.map((a, i) => (
                <Row key={i} label={a.label || `Address ${i+1}`}
                  value={[a.address1, a.address2, [a.suburb, a.state, a.postcode].filter(Boolean).join(" ")].filter(Boolean).join(", ")} />
              ))}
            </Table>
          </Section>
        )}

        {/* ID Numbers */}
        {(crab.id_numbers || []).length > 0 && (
          <Section title="ID Numbers / References">
            <Table>
              {crab.id_numbers.map((n, i) => <Row key={i} label={n.label} value={n.value} />)}
            </Table>
          </Section>
        )}

        {/* 2-col layout for bank modules */}
        {(rb || yb) && (
          <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>

            {/* RedBank */}
            {rb && (
              <div style={{ flex: 1, border: '1px solid #e44', borderRadius: 4, padding: 8 }}>
                <div style={{ fontWeight: 'bold', fontSize: 12, color: '#c00', marginBottom: 6, borderBottom: '1px solid #e44', paddingBottom: 3 }}>
                  🔴 RedBank
                </div>
                <Table>
                  {rb.redbank_customer_number && <Row label="Customer No." value={rb.redbank_customer_number} />}
                  {rb.redbank_password && <Row label="Password" value={rb.redbank_password} />}
                  {rb.redbank_app_pin && <Row label="App PIN" value={rb.redbank_app_pin} />}
                  {rb.telephone_access_code && <Row label="Tel. Access Code" value={rb.telephone_access_code} />}
                  {rb.has_joint_accounts && rb.redbank_joint_holder_name && (
                    <Row label="Joint Holder" value={rb.redbank_joint_holder_name} />
                  )}
                </Table>

                {rbAccounts.length > 0 && (
                  <>
                    <div style={{ fontWeight: 'bold', fontSize: 10, marginTop: 6, marginBottom: 3, color: '#555' }}>ACCOUNTS</div>
                    <Table>
                      {rbAccounts.map(a => (
                        <Row key={a.id} label={`${a.account_type || 'Acc'}`} value={`BSB ${a.bsb}  |  ${a.account_number}`} />
                      ))}
                    </Table>
                  </>
                )}

                {rbCards.length > 0 && (
                  <>
                    <div style={{ fontWeight: 'bold', fontSize: 10, marginTop: 6, marginBottom: 3, color: '#555' }}>CARDS</div>
                    <Table>
                      {rbCards.map(c => (
                        <Row key={c.id} label={`····${(c.card_number || '').slice(-4)}`} value={`Exp ${c.expiry || '—'}  |  CCV ${c.ccv || '—'}${c.pin ? `  |  PIN ${c.pin}` : ''}`} />
                      ))}
                    </Table>
                  </>
                )}

                {(rb.redbank_payids || []).length > 0 && (
                  <>
                    <div style={{ fontWeight: 'bold', fontSize: 10, marginTop: 6, marginBottom: 3, color: '#555' }}>PAYIDs</div>
                    {rb.redbank_payids.map((p, i) => (
                      <div key={i} style={{ fontSize: 10, fontFamily: 'monospace' }}>{p.payid}</div>
                    ))}
                  </>
                )}
              </div>
            )}

            {/* YellowBank */}
            {yb && (
              <div style={{ flex: 1, border: '1px solid #ca8', borderRadius: 4, padding: 8 }}>
                <div style={{ fontWeight: 'bold', fontSize: 12, color: '#a06000', marginBottom: 6, borderBottom: '1px solid #ca8', paddingBottom: 3 }}>
                  🟡 YellowBank
                </div>
                <Table>
                  {yb.yellowbank_client_number && <Row label="Client No." value={yb.yellowbank_client_number} />}
                  {yb.yellowbank_password && <Row label="Password" value={yb.yellowbank_password} />}
                  {yb.yellowbank_app_pin && <Row label="App PIN" value={yb.yellowbank_app_pin} />}
                  {yb.yellowbank_telephone_pin && <Row label="Tel. PIN" value={yb.yellowbank_telephone_pin} />}
                  {yb.yellowbank_last_branch && <Row label="Last Branch" value={yb.yellowbank_last_branch} />}
                  {yb.yellowbank_last_branch_purpose && <Row label="Branch Purpose" value={yb.yellowbank_last_branch_purpose} />}
                </Table>

                {(yb.yellowbank_security_q1 || yb.yellowbank_security_q2) && (
                  <>
                    <div style={{ fontWeight: 'bold', fontSize: 10, marginTop: 6, marginBottom: 3, color: '#555' }}>SECURITY QUESTIONS</div>
                    <Table>
                      {yb.yellowbank_security_q1 && <Row label={yb.yellowbank_security_q1} value={yb.yellowbank_security_a1 || '—'} />}
                      {yb.yellowbank_security_q2 && <Row label={yb.yellowbank_security_q2} value={yb.yellowbank_security_a2 || '—'} />}
                    </Table>
                  </>
                )}

                {ybAccounts.length > 0 && (
                  <>
                    <div style={{ fontWeight: 'bold', fontSize: 10, marginTop: 6, marginBottom: 3, color: '#555' }}>ACCOUNTS</div>
                    <Table>
                      {ybAccounts.map(a => (
                        <Row key={a.id} label={`${a.account_type || 'Acc'}`} value={`BSB ${a.bsb}  |  ${a.account_number}`} />
                      ))}
                    </Table>
                  </>
                )}

                {ybCards.length > 0 && (
                  <>
                    <div style={{ fontWeight: 'bold', fontSize: 10, marginTop: 6, marginBottom: 3, color: '#555' }}>CARDS</div>
                    <Table>
                      {ybCards.map(c => (
                        <Row key={c.id} label={`····${(c.card_number || '').slice(-4)}`} value={`Exp ${c.expiry || '—'}  |  CCV ${c.ccv || '—'}${c.pin ? `  |  PIN ${c.pin}` : ''}`} />
                      ))}
                    </Table>
                  </>
                )}

                {(yb.yellowbank_payids || []).length > 0 && (
                  <>
                    <div style={{ fontWeight: 'bold', fontSize: 10, marginTop: 6, marginBottom: 3, color: '#555' }}>PAYIDs</div>
                    {yb.yellowbank_payids.map((p, i) => (
                      <div key={i} style={{ fontSize: 10, fontFamily: 'monospace' }}>{p.payid}</div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Notes / Emergency summary */}
        {(crab.emergency_summary || crab.notes) && (
          <Section title="Notes">
            {crab.emergency_summary && <p style={{ marginBottom: 4 }}>{crab.emergency_summary}</p>}
            {crab.notes && <p style={{ color: '#444' }}>{crab.notes}</p>}
          </Section>
        )}

        {/* Tags */}
        {(crab.tags || []).length > 0 && (
          <div style={{ marginTop: 8, fontSize: 10, color: '#555' }}>
            Tags: {crab.tags.join("  ·  ")}
          </div>
        )}

      </div>
    </>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontWeight: 'bold', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: '#555', borderBottom: '1px solid #ddd', marginBottom: 4, paddingBottom: 2 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Table({ children }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10.5 }}>
      <tbody>{children}</tbody>
    </table>
  );
}

function Row({ label, value, highlight }) {
  if (!value) return null;
  return (
    <tr>
      <td style={{ paddingRight: 8, paddingTop: 1, paddingBottom: 1, color: '#555', whiteSpace: 'nowrap', verticalAlign: 'top', width: '35%' }}>{label}</td>
      <td style={{ paddingTop: 1, paddingBottom: 1, fontWeight: highlight ? 'bold' : 'normal', color: highlight ? '#c00' : '#111', fontFamily: 'monospace' }}>{value}</td>
    </tr>
  );
}