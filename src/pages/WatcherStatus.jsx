import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Activity, AlertCircle, AlertTriangle, CheckCircle2, Clock, Copy, Loader2, WifiOff } from "lucide-react";
import { toast } from "sonner";

const WATCHER_CONFIG = [
  {
    type: "ingest",
    label: "File Ingest Watcher",
    script: "watch.js",
    envPrefix: "INGEST",
    heartbeatVar: "HEARTBEAT_URL",
    keyVar: "HEARTBEAT_KEY",
    fixes: [
      "Make sure watch.js is running: node watch.js",
      "Check HEARTBEAT_URL is set in your watcher/.env",
      "Check HEARTBEAT_KEY matches your INGEST_API_KEY secret",
      "Ensure your machine can reach the internet",
    ],
  },
  {
    type: "ingest_crab",
    label: "Crab Ingest Watcher",
    script: "watch-crab.js",
    envPrefix: "CRAB",
    heartbeatVar: "CRAB_HEARTBEAT_URL",
    keyVar: "INGEST_API_KEY",
    fixes: [
      "Make sure watch-crab.js is running: node watch-crab.js",
      "Check CRAB_HEARTBEAT_URL is set in your watcher/.env",
      "Check INGEST_API_KEY matches your app secret",
      "Ensure your machine can reach the internet",
    ],
  },
  {
    type: "sync",
    label: "Vault Sync Watcher",
    script: "sync-to-vault.js",
    envPrefix: "SYNC",
    heartbeatVar: "HEARTBEAT_URL",
    keyVar: "HEARTBEAT_KEY",
    fixes: [
      "Make sure sync-to-vault.js is running: node sync-to-vault.js",
      "Check HEARTBEAT_URL is set in your watcher/.env",
      "Check VAULT_PATH is set and the Cryptomator vault is mounted",
      "Ensure your machine can reach the internet",
    ],
  },
];

const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

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
      const data = await base44.entities.WatcherStatus.list('-last_heartbeat', 20);
      setStatuses(data);
    } catch {
      // silently ignore polling errors
    } finally {
      setLoading(false);
    }
  };

  const isRunning = (status) => {
    if (!status || status.status !== 'running') return false;
    return (new Date() - new Date(status.last_heartbeat)) < STALE_THRESHOLD_MS;
  };

  const formatTime = (isoString) => {
    if (!isoString) return 'never';
    const diffMins = Math.round((new Date() - new Date(isoString)) / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.round(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return new Date(isoString).toLocaleString();
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
        {WATCHER_CONFIG.map(config => {
          const status = statuses.find(s => s.watcher_type === config.type);
          const running = isRunning(status);
          const missing = !status;
          const stale = status && !running;

          return (
            <div
              key={config.type}
              className={`bg-card border rounded-lg p-5 space-y-4 ${stale || missing ? 'border-amber-300' : ''}`}
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {running ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  ) : missing ? (
                    <WifiOff className="h-5 w-5 text-amber-500" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                  )}
                  <div>
                    <p className="font-semibold">{config.label}</p>
                    <p className={`text-sm ${running ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {running ? 'Running' : missing ? 'Never connected' : 'Offline / Stale'}
                    </p>
                  </div>
                </div>
                {status?.version && (
                  <span className="text-xs bg-muted px-2 py-1 rounded-full text-muted-foreground">
                    v{status.version}
                  </span>
                )}
              </div>

              {/* Details */}
              {status && (
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>Last heartbeat: <strong>{formatTime(status.last_heartbeat)}</strong></span>
                  </div>
                  {status.details?.folder && (
                    <div className="text-xs bg-muted rounded p-2 font-mono text-foreground">
                      📁 {status.details.folder}
                    </div>
                  )}
                  {status.details?.vault && (
                    <div className="text-xs bg-muted rounded p-2 font-mono text-foreground">
                      🔐 {status.details.vault}
                    </div>
                  )}
                  {status.details?.files_processed > 0 && (
                    <div className="text-xs text-muted-foreground">
                      ✓ {status.details.files_processed} files processed
                    </div>
                  )}
                </div>
              )}

              {/* Alert banner for offline / missing */}
              {(missing || stale) && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2 text-amber-800 font-medium text-sm">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {missing
                      ? `${config.label} has never sent a heartbeat.`
                      : `${config.label} stopped responding — last seen ${formatTime(status.last_heartbeat)}.`}
                  </div>
                  <p className="text-xs text-amber-700 font-semibold mt-1">How to fix:</p>
                  <ul className="space-y-1">
                    {config.fixes.map((fix, i) => (
                      <li key={i} className="text-xs text-amber-700 flex items-start gap-1.5">
                        <span className="mt-0.5 shrink-0">•</span>
                        {fix.includes(':') ? (
                          <>
                            {fix.split(':')[0]}:&nbsp;
                            <code className="bg-white px-1 rounded border border-amber-200 font-mono">
                              {fix.split(':').slice(1).join(':').trim()}
                            </code>
                          </>
                        ) : fix}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Config reference */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-5 space-y-3">
        <div className="flex gap-2">
          <Activity className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="space-y-3 text-sm w-full">
            <p className="font-semibold text-blue-900">Watcher .env Configuration</p>
            <p className="text-blue-800 text-xs">Copy these into your <code className="bg-white px-1 rounded">watcher/.env</code> file:</p>
            {[
              { label: 'INGEST_URL', value: `${window.location.origin}/api/functions/ingestDocument` },
              { label: 'HEARTBEAT_URL', value: `${window.location.origin}/api/functions/watcherHeartbeat` },
              { label: 'CRAB_INGEST_URL', value: `${window.location.origin}/api/functions/ingestCrabDocument` },
              { label: 'CRAB_HEARTBEAT_URL', value: `${window.location.origin}/api/functions/watcherHeartbeat` },
              { label: 'INGEST_API_KEY', value: '(your INGEST_API_KEY secret value)' },
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
            <p className="text-blue-700 text-xs">Watchers send a heartbeat every 60s. A watcher is considered offline if no heartbeat is received for 5 minutes.</p>
          </div>
        </div>
      </div>
    </div>
  );
}