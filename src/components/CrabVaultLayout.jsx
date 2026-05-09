import { useState } from "react";
import { Link, useLocation, Outlet } from "react-router-dom";
import { LayoutDashboard, Users, FileText, Building2, Shield, Inbox, AlertTriangle, Menu, X, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/crabs", label: "Crabs", icon: Users },
  { to: "/crab-documents", label: "Documents", icon: FileText },
  { to: "/markets", label: "Markets", icon: Building2 },
  { to: "/ingress", label: "Ingress", icon: Inbox },
  { to: "/needs-attention", label: "Attention", icon: AlertTriangle },
  { to: "/watcher-status", label: "Watchers", icon: Activity },
];

function isActive(to, pathname) {
  return to === "/" ? pathname === "/" : pathname.startsWith(to);
}

export default function CrabVaultLayout() {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-56 bg-sidebar flex-col shrink-0">
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-sidebar-border">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Shield className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="font-bold text-sidebar-foreground text-sm leading-none">CrabVault</p>
            <p className="text-[10px] text-sidebar-foreground/50 mt-0.5">.one</p>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = isActive(to, location.pathname);
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="px-5 py-4 border-t border-sidebar-border">
          <p className="text-[10px] text-sidebar-foreground/30">Secure & Encrypted</p>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-sidebar border-b border-sidebar-border flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
            <Shield className="h-3.5 w-3.5 text-white" />
          </div>
          <p className="font-bold text-sidebar-foreground text-sm">CrabVault</p>
        </div>
        <button
          onClick={() => setMobileMenuOpen(o => !o)}
          className="text-sidebar-foreground/70 hover:text-sidebar-foreground p-1"
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile slide-down menu */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed top-[52px] left-0 right-0 z-30 bg-sidebar border-b border-sidebar-border px-3 py-3 space-y-1">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = isActive(to, location.pathname);
            return (
              <Link
                key={to}
                to={to}
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 overflow-y-auto md:pt-0 pt-[52px]">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-4 md:py-8 pb-6">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-sidebar border-t border-sidebar-border flex items-center justify-around px-2 py-2">
        {NAV.slice(0, 5).map(({ to, label, icon: Icon }) => {
          const active = isActive(to, location.pathname);
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                "flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors min-w-0",
                active ? "text-sidebar-primary" : "text-sidebar-foreground/50"
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="text-[9px] font-medium truncate">{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}