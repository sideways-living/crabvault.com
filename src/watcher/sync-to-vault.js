#!/usr/bin/env node
/**
 * DocVault → Cryptomator Vault Sync
 * Polls for completed documents and writes them to your local Cryptomator vault.
 *
 * Setup:
 *   1. cd watcher
 *   2. Copy .env to include the new vars below (or add to existing .env)
 *   3. node sync-to-vault.js
 *
 * Required .env vars:
 *   INGEST_URL        - same base URL as watch.js (e.g. https://your-app.base44.app/api/functions)
 *   INGEST_API_KEY    - same API key
 *   VAULT_PATH        - absolute path to your unlocked Cryptomator vault folder
 *   POLL_INTERVAL_MS  - optional, default 60000 (1 minute)
 */

const fs   = require('fs');
const path = require('path');
const https = require('https');
const http  = require('http');

// Load .env
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [key, ...vals] = line.split('=');
    if (key && vals.length) process.env[key.trim()] = vals.join('=').trim();
  });
}

const BASE_URL        = (process.env.INGEST_URL || '').replace(/\/ingestDocument$/, '').replace(/\/$/, '');
const API_KEY         = process.env.INGEST_API_KEY;
const VAULT_PATH      = process.env.VAULT_PATH;
const POLL_INTERVAL   = parseInt(process.env.POLL_INTERVAL_MS || '60000', 10);
const HEARTBEAT_URL   = process.env.HEARTBEAT_URL;
const HEARTBEAT_KEY   = process.env.HEARTBEAT_KEY || API_KEY;
const HEARTBEAT_INTERVAL = parseInt(process.env.HEARTBEAT_INTERVAL_MS || '60000', 10);

if (!BASE_URL || !API_KEY || !VAULT_PATH) {
  console.error('❌  Missing required env vars: INGEST_URL, INGEST_API_KEY, VAULT_PATH');
  process.exit(1);
}

if (!fs.existsSync(VAULT_PATH)) {
  console.error(`❌  VAULT_PATH does not exist or vault is not unlocked: ${VAULT_PATH}`);
  process.exit(1);
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function apiRequest(urlStr, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + (url.search || ''),
      method: options.method || 'GET',
      headers: {
        'x-api-key': API_KEY,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString();
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(body));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function downloadFile(fileUrl) {
  return new Promise((resolve, reject) => {
    const url = new URL(fileUrl);
    const transport = url.protocol === 'https:' ? https : http;
    const chunks = [];
    const req = transport.get(fileUrl, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // follow one redirect
        return downloadFile(res.headers.location).then(resolve).catch(reject);
      }
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
  });
}

// ── Core sync logic ───────────────────────────────────────────────────────────

async function fetchPendingVaultDocs() {
  return apiRequest(`${BASE_URL}/getPendingVaultDocs`);
}

async function markSynced(documentId, vaultFilePath) {
  return apiRequest(`${BASE_URL}/markDocumentSynced`, {
    method: 'POST',
    body: JSON.stringify({ documentId, vaultFilePath }),
  });
}

async function sendHeartbeat(currentFile = null, pendingCount = 0) {
  if (!HEARTBEAT_URL) return;
  const url = new URL(HEARTBEAT_URL);
  const transport = url.protocol === 'https:' ? https : http;
  const body = JSON.stringify({
    watcher_type: 'sync',
    version: '1.0.0',
    details: {
      vault: VAULT_PATH,
      current_file: currentFile,
      pending_count: pendingCount,
    },
  });
  return new Promise((resolve) => {
    const req = transport.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': body.length, 'x-api-key': HEARTBEAT_KEY },
    }, res => { res.on('data', () => {}); res.on('end', resolve); });
    req.on('error', () => resolve());
    req.write(body);
    req.end();
  });
}

function sanitizeName(name) {
  // Remove characters not allowed in most filesystems
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
}

async function syncDocument(doc) {
  // If the doc was already synced but moved to a new folder, delete old file first
  if (doc.needs_move && doc.old_vault_path) {
    const oldAbsPath = path.join(VAULT_PATH, doc.old_vault_path);
    if (fs.existsSync(oldAbsPath)) {
      fs.unlinkSync(oldAbsPath);
      console.log(`🗑️   Removed old vault file: ${doc.old_vault_path}`);
      // Clean up empty parent directories
      try {
        let dir = path.dirname(oldAbsPath);
        while (dir !== VAULT_PATH && fs.readdirSync(dir).length === 0) {
          fs.rmdirSync(dir);
          dir = path.dirname(dir);
        }
      } catch { /* ignore cleanup errors */ }
    }
  }

  // Build local folder path mirroring the app's folder structure
  const relPath = doc.folder_path ? doc.folder_path.replace(/^\//, '') : '';
  const localDir = relPath
    ? path.join(VAULT_PATH, ...relPath.split('/').map(sanitizeName))
    : VAULT_PATH;

  fs.mkdirSync(localDir, { recursive: true });

  // Determine filename: title + original extension
  const originalExt = doc.original_filename
    ? path.extname(doc.original_filename)
    : `.${doc.file_type || 'pdf'}`;
  const baseName = sanitizeName(doc.title || doc.original_filename || doc.id);
  let filename = baseName.endsWith(originalExt) ? baseName : baseName + originalExt;

  // Handle name collisions
  let destPath = path.join(localDir, filename);
  let counter = 1;
  while (fs.existsSync(destPath)) {
    filename = `${baseName} (${counter})${originalExt}`;
    destPath = path.join(localDir, filename);
    counter++;
  }

  // Download and write
  const fileBuffer = await downloadFile(doc.file_url);
  fs.writeFileSync(destPath, fileBuffer);

  // Mark synced in the app
  const relVaultPath = path.relative(VAULT_PATH, destPath);
  await markSynced(doc.id, relVaultPath);

  if (doc.needs_move) {
    console.log(`📦  Moved: ${doc.old_vault_path} → ${relVaultPath}`);
  } else {
    console.log(`✅  Synced: ${relVaultPath}`);
  }
}

async function poll() {
  let result;
  try {
    result = await fetchPendingVaultDocs();
  } catch (err) {
    console.error('❌  Failed to fetch pending docs:', err.message);
    return;
  }

  const docs = result.documents || [];
  if (docs.length === 0) {
    console.log(`[${new Date().toLocaleTimeString()}] No documents pending vault sync.`);
    await sendHeartbeat(null, 0);
    return;
  }

  console.log(`[${new Date().toLocaleTimeString()}] Syncing ${docs.length} document(s)...`);

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    await sendHeartbeat(doc.title || doc.original_filename, docs.length - i);
    try {
      await syncDocument(doc);
    } catch (err) {
      console.error(`❌  Failed to sync "${doc.title || doc.id}":`, err.message);
    }
  }
  await sendHeartbeat(null, 0);
}

console.log(`🔐  Vault sync started`);
console.log(`📁  Vault path: ${VAULT_PATH}`);
console.log(`⏱️   Poll interval: ${POLL_INTERVAL / 1000}s\n`);

setInterval(poll, POLL_INTERVAL);
poll();

if (HEARTBEAT_URL) {
  sendHeartbeat(null, 0);
  setInterval(() => sendHeartbeat(null, 0), HEARTBEAT_INTERVAL);
}