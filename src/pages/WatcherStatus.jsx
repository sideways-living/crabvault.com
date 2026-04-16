import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Activity, AlertCircle, CheckCircle2, Clock, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function WatcherStatus() {
  const [statuses, setStatuses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStatuses();
    const interval = setInterval(loadStatuses, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadStatuses = async () => {
    try {
      const data = await base44.entities.WatcherStatus.list('-last_heartbeat', 10);
      setStatuses(data);
    } catch (err) {
      // silently ignore polling errors to avoid crashing the page
    } finally {
      setLoading(false);
    }
  };

  const isRunning = (status) => {
    if (status.status !== 'running') return false;
    const lastHeartbeat = new Date(status.last_heartbeat);
    const now = new Date();
    const ageMs = now - lastHeartbeat;
    return ageMs < 5 * 60 * 1000; // running if heartbeat < 5 min ago
  };

  const formatTime = (isoString) => {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.round(diffMs / 60000);
    
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.round(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleString();
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Watcher Status</h1>
        <p className="text-sm text-muted-foreground mt-1">Monitor your local file watchers</p>
      </div>

      <div className="grid gap-4">
        {statuses.length === 0 ? (
          <div className="bg-card border rounded-lg p-8 text-center flex flex-col items-center gap-3">
            <AlertCircle className="h-8 w-8 text-amber-500" />
            <p className="font-medium">No watchers connected</p>
            <p className="text-sm text-muted-foreground">Run your watcher scripts to see their status here</p>
          </div>
        ) : (
          statuses.map(status => {
            const running = isRunning(status);
            const displayName = status.watcher_type === 'ingest' ? 'File Ingest Watcher' : 'Vault Sync Watcher';
            return (
              <div key={status.id} className="bg-card border rounded-lg p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {running ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-muted-foreground" />
                    )}
                    <div>
                      <p className="font-semibold">{displayName}</p>
                      <p className={`text-sm ${running ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                        {running ? 'Running' : 'Offline'}
                      </p>
                    </div>
                  </div>
                  {status.version && (
                    <span className="text-xs bg-muted px-2 py-1 rounded-full text-muted-foreground">
                      v{status.version}
                    </span>
                  )}
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>Last heartbeat: <strong>{formatTime(status.last_heartbeat)}</strong></span>
                  </div>
                  {status.details && (
                    <>
                      {status.details.folder && (
                        <div className="text-xs bg-muted rounded p-2 font-mono text-foreground">
                          📁 {status.details.folder}
                        </div>
                      )}
                      {status.details.vault && (
                        <div className="text-xs bg-muted rounded p-2 font-mono text-foreground">
                          🔐 {status.details.vault}
                        </div>
                      )}
                      {status.details.files_processed && (
                        <div className="text-xs text-muted-foreground">
                          ✓ {status.details.files_processed} files processed
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-5 space-y-3">
        <div className="flex gap-2">
          <Activity className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="space-y-3 text-sm w-full">
            <p className="font-semibold text-blue-900">Watcher .env Configuration</p>
            <p className="text-blue-800 text-xs">Copy these into your <code className="bg-white px-1 rounded">watcher/.env</code> file:</p>
            {[
              { label: 'INGEST_URL', value: `${window.location.origin}/api/functions/ingestDocument` },
              { label: 'HEARTBEAT_URL', value: `${window.location.origin}/api/functions/watcherHeartbeat` },
              { label: 'INGEST_API_KEY', value: '(your INGEST_API_KEY secret value)' },
              { label: 'HEARTBEAT_KEY', value: '(same as INGEST_API_KEY)' },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center gap-2">
                <div className="bg-white rounded px-3 py-2 font-mono text-xs text-foreground border border-blue-200 flex-1 overflow-auto">
                  {label}={value}
                </div>
                <button
                  onClick={() => copyToClipboard(`${label}=${value}`)}
                  className="p-1.5 rounded hover:bg-blue-100 text-blue-600"
                  title="Copy"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <p className="text-blue-700 text-xs">The watcher sends a heartbeat every 60s. If status shows Offline, check your .env has HEARTBEAT_URL set and restart the watcher.</p>
          </div>
        </div>
      </div>
    </div>
  );
}