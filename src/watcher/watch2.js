#!/usr/bin/env node
/* eslint-env node */
/**
 * DocVault Local Folder Watcher #2
 * Second watch folder — same behavior as watch.js but fully independent.
 *
 * Setup:
 *   1. cd watcher
 *   2. npm install (if not already done)
 *   3. Add WATCH_FOLDER_2, INGEST_URL, INGEST_API_KEY etc. to your .env
 *   4. node watch2.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Load .env manually (no dependencies needed)
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [key, ...vals] = line.split('=');
    if (key && vals.length) process.env[key.trim()] = vals.join('=').trim();
  });
}

const WATCH_FOLDER     = process.env.WATCH_FOLDER_2;
const INGEST_URL       = process.env.INGEST_URL;
const API_KEY          = process.env.INGEST_API_KEY;
const HEARTBEAT_URL    = process.env.HEARTBEAT_URL;
const HEARTBEAT_KEY    = process.env.HEARTBEAT_KEY || API_KEY;
const MOVE_TO          = process.env.MOVE_AFTER_UPLOAD_2 || '';
const POLL_INTERVAL    = parseInt(process.env.POLL_INTERVAL_MS || '5000', 10);
const HEARTBEAT_INTERVAL = parseInt(process.env.HEARTBEAT_INTERVAL_MS || '60000', 10);

const SUPPORTED = ['.pdf', '.docx', '.xlsx', '.pptx', '.txt', '.jpg', '.jpeg', '.png'];

if (!WATCH_FOLDER || !INGEST_URL || !API_KEY) {
  console.error('❌  Missing required env vars: WATCH_FOLDER_2, INGEST_URL, INGEST_API_KEY');
  process.exit(1);
}

// Separate log/lock files so watch.js and watch2.js can run at the same time
const UPLOADED_LOG = path.join(__dirname, '.uploaded2.json');
let uploadedFiles = new Set();
if (fs.existsSync(UPLOADED_LOG)) {
  try {
    const data = JSON.parse(fs.readFileSync(UPLOADED_LOG, 'utf8'));
    uploadedFiles = new Set(data);
    console.log(`📋  Loaded ${uploadedFiles.size} previously uploaded filenames from log`);
  } catch { /* ignore corrupt log */ }
}
fs.readdirSync(WATCH_FOLDER).forEach(f => uploadedFiles.add(f));
saveUploadedLog();

function saveUploadedLog() {
  fs.writeFileSync(UPLOADED_LOG, JSON.stringify([...uploadedFiles]), 'utf8');
}

const LOCK_FILE = path.join(__dirname, '.watcher2.lock');
if (fs.existsSync(LOCK_FILE)) {
  const pid = fs.readFileSync(LOCK_FILE, 'utf8').trim();
  try {
    process.kill(parseInt(pid), 0);
    console.error(`❌  Another watch2 instance is already running (PID ${pid}). Exiting.`);
    console.error(`    If that process is gone, delete ${LOCK_FILE} and retry.`);
    process.exit(1);
  } catch {
    console.warn(`⚠️  Stale lockfile found (PID ${pid} not running). Continuing.`);
  }
}
fs.writeFileSync(LOCK_FILE, String(process.pid), 'utf8');
process.on('exit', () => { try { fs.unlinkSync(LOCK_FILE); } catch {} });
process.on('SIGINT', () => process.exit());
process.on('SIGTERM', () => process.exit());

const seen = uploadedFiles;
let currentUploadFile = null;
console.log(`👀  Watching (folder 2): ${WATCH_FOLDER}`);
console.log(`📤  Uploading to: ${INGEST_URL}`);
console.log(`⏱️   Poll interval: ${POLL_INTERVAL}ms\n`);

async function uploadFile(filePath, filename) {
  const fileBuffer = fs.readFileSync(filePath);
  const boundary = '----DocVaultBoundary' + Date.now();

  const bodyStart = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="filename"\r\n\r\n` +
    `${filename}\r\n` +
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
    `Content-Type: application/octet-stream\r\n\r\n`,
    'utf8'
  );
  const bodyEnd = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  const body = Buffer.concat([bodyStart, fileBuffer, bodyEnd]);

  const url = new URL(INGEST_URL);
  const transport = url.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const req = transport.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
        'x-api-key': API_KEY,
      },
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) resolve(JSON.parse(data));
        else reject(new Error(`HTTP ${res.statusCode}: ${data}`));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function poll() {
  let files;
  try {
    files = fs.readdirSync(WATCH_FOLDER);
  } catch (e) {
    console.error('Cannot read watch folder:', e.message);
    return;
  }

  for (const filename of files) {
    if (seen.has(filename)) continue;
    const ext = path.extname(filename).toLowerCase();
    if (!SUPPORTED.includes(ext)) { seen.add(filename); continue; }

    const filePath = path.join(WATCH_FOLDER, filename);
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) { seen.add(filename); continue; }

    seen.add(filename);
    saveUploadedLog();
    console.log(`📄  New file detected: ${filename}`);
    currentUploadFile = filename;
    if (HEARTBEAT_URL) sendHeartbeat();

    try {
      const result = await uploadFile(filePath, filename);
      console.log(`✅  Uploaded: ${filename} → document_id: ${result.document_id}`);
      currentUploadFile = null;
      if (HEARTBEAT_URL) sendHeartbeat();

      if (MOVE_TO) {
        const dest = path.join(MOVE_TO, filename);
        fs.mkdirSync(MOVE_TO, { recursive: true });
        fs.renameSync(filePath, dest);
        console.log(`📦  Moved to: ${dest}`);
      }
    } catch (err) {
      console.error(`❌  Failed to upload ${filename}:`, err.message);
      currentUploadFile = null;
      seen.delete(filename);
    }
  }
}

async function sendHeartbeat() {
  if (!HEARTBEAT_URL) return;

  const url = new URL(HEARTBEAT_URL);
  const transport = url.protocol === 'https:' ? https : http;
  const body = JSON.stringify({
    watcher_type: 'ingest2',
    version: '1.0.0',
    details: {
      folder: WATCH_FOLDER,
      files_processed: uploadedFiles.size,
      current_file: currentUploadFile,
    }
  });

  return new Promise((resolve) => {
    const req = transport.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': body.length,
        'x-api-key': HEARTBEAT_KEY,
      },
    }, res => {
      res.on('data', () => {});
      res.on('end', () => {
        if (res.statusCode === 200) console.log('💓 Heartbeat sent');
        else console.warn(`⚠️  Heartbeat failed: HTTP ${res.statusCode}`);
        resolve();
      });
    });
    req.on('error', (err) => {
      console.warn('⚠️  Heartbeat error:', err.message);
      resolve();
    });
    req.write(body);
    req.end();
  });
}

setInterval(poll, POLL_INTERVAL);
poll();

if (HEARTBEAT_URL) {
  sendHeartbeat();
  setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
}