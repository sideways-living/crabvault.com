import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Plus, Search, User, Tag, Phone, Mail, MapPin, FileText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const MODULE_STYLES = {
  redbank: { label: "RedBank", color: "bg-red-100 text-red-700 border-red-200" },
  yellowbank: { label: "YellowBank", color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
};

const STATUS_COLORS = {
  inactive: "bg-gray-100 text-gray-600",
  banned: "bg-red-100 text-red-700",
  watch: "bg-amber-100 text-amber-700",
  nathan: "bg-blue-100 text-blue-700",
  tony: "bg-purple-100 text-purple-700",
  nigel: "bg-orange-100 text-orange-700",
  ben: "bg-teal-100 text-teal-700",
};

const PRIORITY_STATUSES = new Set(["nathan", "tony", "nigel", "ben"]);
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function getActivityBadge(crab) {
  if (!crab.updated_date) return null;
  const elapsed = Date.now() - new Date(crab.updated_date).getTime();
  const window = PRIORITY_STATUSES.has(crab.status) ? THREE_DAYS_MS : SEVEN_DAYS_MS;
  if (elapsed < window) return { label: "active", cls: "bg-emerald-100 text-emerald-700" };
  return null;
}

function buildAddress(crab) {
  const parts = [crab.address1, crab.address2, crab.suburb, crab.state, crab.postcode].filter(Boolean);
  return parts.join(", ");
}

function getStarSign(dob) {
  const d = new Date(dob + 'T12:00:00');
  const m = d.getMonth() + 1;
  const day = d.getDate();
  if ((m === 3 && day >= 21) || (m === 4 && day <= 19)) return { name: "Aries", emoji: "♈" };
  if ((m === 4 && day >= 20) || (m === 5 && day <= 20)) return { name: "Taurus", emoji: "♉" };
  if ((m === 5 && day >= 21) || (m === 6 && day <= 20)) return { name: "Gemini", emoji: "♊" };
  if ((m === 6 && day >= 21) || (m === 7 && day <= 22)) return { name: "Cancer", emoji: "♋" };
  if ((m === 7 && day >= 23) || (m === 8 && day <= 22)) return { name: "Leo", emoji: "♌" };
  if ((m === 8 && day >= 23) || (m === 9 && day <= 22)) return { name: "Virgo", emoji: "♍" };
  if ((m === 9 && day >= 23) || (m === 10 && day <= 22)) return { name: "Libra", emoji: "♎" };
  if ((m === 10 && day >= 23) || (m === 11 && day <= 21)) return { name: "Scorpio", emoji: "♏" };
  if ((m === 11 && day >= 22) || (m === 12 && day <= 21)) return { name: "Sagittarius", emoji: "♐" };
  if ((m === 12 && day >= 22) || (m === 1 && day <= 19)) return { name: "Capricorn", emoji: "♑" };
  if ((m === 1 && day >= 20) || (m === 2 && day <= 18)) return { name: "Aquarius", emoji: "♒" };
  return { name: "Pisces", emoji: "♓" };
}

export default function CrabsPage() {
  const [crabs, setCrabs] = useState([]);
  const [docsByCrab, setDocsByCrab] = useState({});
  const [modulesByCrab, setModulesByCrab] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    // Load crabs first so the page renders immediately
    base44.entities.Crab.filter({ is_deleted: false }, "full_name", 500)
      .then(crbs => {
        setCrabs(crbs);
        setLoading(false);
        // Then load supplementary data in the background
        return Promise.all([
          base44.entities.CrabDocument.list("-updated_date", 500),
          base44.entities.CrabModule.list("created_date", 1000),
        ]);
      })
      .then(([docs, mods]) => {
        const map = {};
        docs.filter(d => !d.is_deleted).forEach(doc => {
          (doc.crab_ids || []).forEach(cid => {
            if (!map[cid]) map[cid] = [];
            if (map[cid].length < 2) map[cid].push(doc);
          });
        });
        setDocsByCrab(map);
        const modMap = {};
        mods.forEach(m => {
          if (!modMap[m.crab_id]) modMap[m.crab_id] = [];
          modMap[m.crab_id].push(m.module_type);
        });
        setModulesByCrab(modMap);
      });
  }, []);

  const filtered = crabs.filter(c => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      c.full_name?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.phone?.includes(q) ||
      (c.aliases || []).some(a => a.toLowerCase().includes(q)) ||
      (c.tags || []).some(t => t.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Crabs</h1>
          <p className="text-sm text-muted-foreground mt-1">{crabs.length} profile{crabs.length !== 1 ? "s" : ""}</p>
        </div>
        <Link to="/crabs/new">
          <Button className="gap-2"><Plus className="h-4 w-4" /> New Crab</Button>
        </Link>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name, alias, email, phone, tag…"
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <User className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">{search ? "No crabs match your search" : "No crabs yet — add your first profile"}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(crab => {
            const address = buildAddress(crab);
            const recentDocs = docsByCrab[crab.id] || [];
            const crabModules = modulesByCrab[crab.id] || [];
            return (
              <Link key={crab.id} to={`/crabs/${crab.id}`}>
                <div className="bg-card border rounded-xl p-5 hover:shadow-md transition-shadow cursor-pointer h-full flex flex-col gap-4">
                  {/* Header */}
                  <div className="flex items-start gap-4">
                    {crab.photo_url ? (
                      <img src={crab.photo_url} alt={crab.full_name} className="w-14 h-14 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-primary font-semibold text-xl">{crab.full_name?.[0]?.toUpperCase()}</span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold truncate">{crab.full_name}</h3>
                      <div className="flex items-center gap-1.5 flex-wrap mt-1">
                        {crab.status && (
                          <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded shrink-0 ${STATUS_COLORS[crab.status] || "bg-gray-100 text-gray-600"}`}>
                            {crab.status}
                          </span>
                        )}
                        {(() => {
                          const badge = getActivityBadge(crab);
                          return badge ? (
                            <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded shrink-0 ${badge.cls}`}>
                              {badge.label}
                            </span>
                          ) : null;
                        })()}
                      </div>
                      {crab.date_of_birth && (() => {
                        const sign = getStarSign(crab.date_of_birth);
                        const age = Math.floor((Date.now() - new Date(crab.date_of_birth).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
                        const dob = new Date(crab.date_of_birth + 'T12:00:00').toLocaleDateString("en-AU", { day: "2-digit", month: "long", year: "numeric" });
                        return (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {dob} · {age} yrs · <span title={sign.name}>{sign.emoji} {sign.name}</span>
                          </p>
                        );
                      })()}
                      {(crab.aliases || []).length > 0 && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">aka {crab.aliases.join(", ")}</p>
                      )}
                    </div>
                  </div>

                  {/* Contact details */}
                  <div className="space-y-1.5">
                    {crab.phone && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Phone className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{crab.phone}</span>
                      </div>
                    )}
                    {crab.email && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Mail className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{crab.email}</span>
                      </div>
                    )}
                    {address && (
                      <div className="flex items-start gap-2 text-xs text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <span className="line-clamp-2">{address}</span>
                      </div>
                    )}
                  </div>

                  {/* Modules */}
                  {crabModules.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {crabModules.map(mod => {
                        const style = MODULE_STYLES[mod];
                        if (!style) return null;
                        return (
                          <span key={mod} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${style.color}`}>
                            {style.label}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {/* Tags */}
                  {(crab.tags || []).length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {crab.tags.slice(0, 4).map(t => (
                        <span key={t} className="text-[10px] bg-secondary px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                          <Tag className="h-2.5 w-2.5" />{t}
                        </span>
                      ))}
                      {crab.tags.length > 4 && <span className="text-[10px] text-muted-foreground">+{crab.tags.length - 4}</span>}
                    </div>
                  )}

                  {/* Recent documents */}
                  {recentDocs.length > 0 && (
                    <div className="border-t pt-3 space-y-1.5">
                      <p className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wide">Recent Documents</p>
                      {recentDocs.map(doc => (
                        <div key={doc.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                          <FileText className="h-3.5 w-3.5 shrink-0 text-primary/60" />
                          <span className="truncate">{doc.title}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}