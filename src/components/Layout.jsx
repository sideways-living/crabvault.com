import { Outlet, Link, useLocation } from "react-router-dom";
import { LayoutDashboard, FileText, FolderTree, Search, Settings, Shield, Menu, X, BookOpen, ClipboardCheck, Trash2, Lock } from "lucide-react";
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

const navItems = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/documents", label: "Documents", icon: FileText },
  { path: "/folders", label: "Folders", icon: FolderTree },
  { path: "/search", label: "Search", icon: Search },
  { path: "/review", label: "Review Queue", icon: ClipboardCheck, badge: true },
  { path: "/receipt-trainer", label: "Receipt Trainer", icon: BookOpen },
  { path: "/deleted", label: "Deleted", icon: Trash2 },
  { path: "/settings", label: "Settings", icon: Settings },
];

export default function Layout() {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [reviewCount, setReviewCount] = useState(0);
  const [vaultConnected, setVaultConnected] = useState(null);
  const [vaultHelpOpen, setVaultHelpOpen] = useState(false);

  useEffect(() => {
    const checkVault = async () => {
      try {
        const user = await base44.auth.me();
        if (user) {
          // Try to call sync function with test payload - if it succeeds, vault is accessible
          const res = await base44.functions.invoke('syncDocumentsToVault', { vaultPath: '/tmp/test' });
          setVaultConnected(!res.data?.error || res.data?.error !== 'Cryptomator vault not connected');
        }
      } catch (err) {
        setVaultConnected(false);
      }
    };
    checkVault();
    base44.entities.Document.filter({ processing_status: "needs_review" }, "-created_date", 100)
      .then(docs => setReviewCount(docs.length))
      .catch(() => {});
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex bg-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed lg:sticky top-0 left-0 z-50 h-screen w-64 bg-sidebar text-sidebar-foreground flex flex-col transition-transform duration-300",
        sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        {/* Logo */}
        <div className="p-6 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-sidebar-primary flex items-center justify-center">
            <Shield className="h-5 w-5 text-sidebar-primary-foreground" />
          </div>
          <div>
            <h1 className="font-semibold text-sm tracking-tight text-sidebar-foreground">DocVault</h1>
            <p className="text-[10px] text-sidebar-foreground/50 uppercase tracking-widest">DMS</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 space-y-1 mt-2">
          {navItems.map((item) => {
            const isActive = item.path === "/" ? location.pathname === "/" : location.pathname.startsWith(item.path);
            return (
              <Link
              key={item.path}
              to={item.path}
              onClick={() => setSidebarOpen(false)}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200",
                isActive
                  ? "bg-sidebar-accent text-sidebar-primary font-medium"
                  : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
              )}
              >
              <item.icon className="h-4 w-4" />
              {item.label}
              {item.badge && reviewCount > 0 && (
                <span className="ml-auto bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                  {reviewCount}
                </span>
              )}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 mx-3 mb-3 rounded-lg bg-emerald-600">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-center gap-1.5 text-xs text-white/90">
              <Shield className="h-3.5 w-3.5" />
              <span>Encrypted with Cryptomator</span>
            </div>
            <button
              onClick={() => vaultConnected === false && setVaultHelpOpen(true)}
              className={cn("relative h-16 w-16 mx-auto transition-opacity", vaultConnected === false ? 'cursor-pointer hover:opacity-80' : '')}
            >
              <img 
                src={vaultConnected === true ? 'https://media.base44.com/images/public/69d0ddebd2fd28ad3f9192fe/eb5c9c541_cryptomator_online.png' : 'https://media.base44.com/images/public/69d0ddebd2fd28ad3f9192fe/d6af0f46f_cryptomator_offline.png'}
                alt="Cryptomator"
                className="h-full w-full object-contain"
              />
              {vaultConnected === true && (
                <div className="absolute -bottom-1 -right-1 bg-emerald-500 rounded-full p-1">
                  <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                  </svg>
                </div>
              )}
              {vaultConnected === false && (
                <div className="absolute -bottom-1 -right-1 bg-red-500 rounded-full p-1">
                  <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
                  </svg>
                </div>
              )}
            </button>
            <div className="text-center text-xs text-white/80">
              {vaultConnected === true ? 'Vault Online' : vaultConnected === false ? 'Vault Offline' : 'Checking...'}
            </div>
          </div>
        </div>
      </aside>

      {/* Vault Help Modal */}
      <Dialog open={vaultHelpOpen} onOpenChange={setVaultHelpOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cryptomator Vault Offline</DialogTitle>
            <DialogDescription>
              Your encrypted vault is not currently accessible. Here's how to reconnect it:
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm text-foreground">
            <div className="space-y-2">
              <h4 className="font-semibold">Steps to reconnect:</h4>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>Open Cryptomator on your device</li>
                <li>Unlock your vault with your password</li>
                <li>Ensure the vault path is properly mounted</li>
                <li>Check your network connection if using a remote vault</li>
                <li>Refresh this page once the vault is online</li>
              </ol>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900">
              <p className="font-semibold mb-1">📁 Vault Location:</p>
              <p className="font-mono break-all text-amber-800">Configure your vault path in Settings</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Mobile header */}
        <header className="lg:hidden sticky top-0 z-30 bg-background/80 backdrop-blur-lg border-b px-4 py-3 flex items-center gap-3">
          <button onClick={() => setSidebarOpen(true)} className="p-1.5 rounded-lg hover:bg-muted">
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">DocVault</span>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}