import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Smartphone, Search, LayoutGrid, List } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Link } from "react-router-dom";

const MODULE_BADGES = [
  { key: "redbank", label: "RedBank", color: "bg-red-100 text-red-700 border-red-200" },
  { key: "yellowbank", label: "YellowBank", color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
];

export default function DevicesPage() {
  const [devices, setDevices] = useState([]);
  const [crabs, setCrabs] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [view, setView] = useState("grid");

  useEffect(() => {
    const load = async () => {
      const [devList, crabList] = await Promise.all([
        base44.entities.CrabDevice.list("-created_date", 500),
        base44.entities.Crab.filter({ is_deleted: false }),
      ]);
      const crabMap = {};
      crabList.forEach(c => { crabMap[c.id] = c; });
      setDevices(devList);
      setCrabs(crabMap);
      setLoading(false);
    };
    load();
  }, []);

  const filtered = devices.filter(d => {
    if (!search) return true;
    const q = search.toLowerCase();
    const name = [d.brand, d.model, d.colour, d.imei].filter(Boolean).join(" ").toLowerCase();
    const crab = crabs[d.crab_id];
    const crabName = (crab?.canonical_name || crab?.full_name || "").toLowerCase();
    return name.includes(q) || crabName.includes(q);
  });

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Devices</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{devices.length} device{devices.length !== 1 ? "s" : ""} across all profiles</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="pl-8 h-8 text-sm"
              placeholder="Search devices or profiles…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="flex border rounded-md overflow-hidden">
            <button
              onClick={() => setView("grid")}
              className={`px-2.5 py-1.5 ${view === "grid" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-accent"}`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setView("list")}
              className={`px-2.5 py-1.5 ${view === "list" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-accent"}`}
            >
              <List className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center py-24 gap-3 text-muted-foreground">
          <Smartphone className="h-12 w-12 opacity-30" />
          <p>{search ? "No devices match your search" : "No devices added yet"}</p>
        </div>
      ) : view === "grid" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(device => {
            const crab = crabs[device.crab_id];
            const usedFor = MODULE_BADGES.filter(m => (device.used_for || []).includes(m.key));
            return (
              <div key={device.id} className="bg-card border rounded-xl p-4 flex gap-3">
                <div className="shrink-0">
                  {device.image_url ? (
                    <img src={device.image_url} alt="Device" className="w-14 h-14 object-contain rounded-lg" />
                  ) : (
                    <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center">
                      <Smartphone className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0 space-y-1.5">
                  <p className="font-medium text-sm leading-tight">
                    {[device.brand, device.model].filter(Boolean).join(" ") || "Unknown Device"}
                    {device.colour && <span className="text-xs text-muted-foreground font-normal ml-1.5">· {device.colour}</span>}
                  </p>
                  {device.imei && (
                    <p className="text-xs font-mono text-muted-foreground">IMEI: {device.imei}</p>
                  )}
                  {crab ? (
                    <Link to={`/crabs/${crab.id}`} className="text-xs text-primary hover:underline font-medium block">
                      {crab.canonical_name || crab.full_name || crab.surname}
                    </Link>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">No profile linked</p>
                  )}
                  {usedFor.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {usedFor.map(mod => (
                        <span key={mod.key} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${mod.color}`}>{mod.label}</span>
                      ))}
                    </div>
                  )}
                  {device.notes && <p className="text-xs text-muted-foreground italic truncate">{device.notes}</p>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-card border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Device</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">IMEI</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Profile</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Modules</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Notes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((device, i) => {
                const crab = crabs[device.crab_id];
                const usedFor = MODULE_BADGES.filter(m => (device.used_for || []).includes(m.key));
                return (
                  <tr key={device.id} className={`border-b last:border-0 ${i % 2 === 0 ? "" : "bg-muted/20"}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        {device.image_url ? (
                          <img src={device.image_url} alt="Device" className="w-8 h-8 object-contain rounded shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded bg-muted flex items-center justify-center shrink-0">
                            <Smartphone className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-sm">{[device.brand, device.model].filter(Boolean).join(" ") || "Unknown"}</p>
                          {device.colour && <p className="text-xs text-muted-foreground">{device.colour}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-muted-foreground">{device.imei || "—"}</span>
                    </td>
                    <td className="px-4 py-3">
                      {crab ? (
                        <Link to={`/crabs/${crab.id}`} className="text-xs text-primary hover:underline font-medium">
                          {crab.canonical_name || crab.full_name || crab.surname}
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">None</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {usedFor.length > 0 ? usedFor.map(mod => (
                          <span key={mod.key} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${mod.color}`}>{mod.label}</span>
                        )) : <span className="text-xs text-muted-foreground">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 max-w-[200px]">
                      <span className="text-xs text-muted-foreground truncate block">{device.notes || "—"}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}