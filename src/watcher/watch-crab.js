#!/usr/bin/env node
/* eslint-disable no-undef */
/**
 * CrabVault Local Folder Watcher  (macOS)
 * Watches a folder for new files and ingests them into CrabVault automatically.
 *
 * Setup (Mac):
 *   1. cd watcher
 *   2. npm install
 *   3. Create a .env file (copy .env.example):
 *        CRAB_WATCH_FOLDER=/Users/yourname/Desktop/CrabDrop
 *        CRAB_INGEST_URL=https://your-app.base44.app/api/functions/ingestCrabDocument
 *        INGEST_API_KEY=your_api_key
 *
 *        # Optional: pre-set a crab for all files in this folder
 *        CRAB_DEFAULT_SURNAME=Smith
 *        CRAB_DEFAULT_FIRST_NAME=John
 *        CRAB_DEFAULT_MIDDLE_NAME=
 *        CRAB_DEFAULT_ID=   # if set, links to existing crab instead of creating
 *
 *   4. node watch-crab.js
 *      (or: npm start)
 *
 * Cryptomator on Mac:
 *   - Unlock your vault in Cryptomator first
 *   - The vault mounts at /Volumes/VaultName/  (shown in Cryptomator app)
 *   - Set VAULT_PATH=/Volumes/YourVaultName in .env for the sync script
 *
 * File naming convention (auto-parsed if CRAB_DEFAULT_SURNAME is not set):
 *   Option A — Subfolder per crab (folder name parsed):
 *     /CrabDrop/John SMITH/document.pdf
 *     /CrabDrop/John Michael SMITH/document.pdf
 *
 *   Option B — Flat files with crab name embedded in filename (separator " - "):
 *     /CrabDrop/John SMITH - document.pdf
 *     /CrabDrop/John Michael SMITH - document.pdf
 *     /CrabDrop/SMITH John - document.pdf
 *     /CrabDrop/SMITH, John Michael - document.pdf
 *
 *   In both cases, the last word of the name portion is treated as the surname.
 *
 * Or just drop flat files and set CRAB_DEFAULT_SURNAME for a single-crab watch folder.
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

const WATCH_FOLDER   = process.env.CRAB_WATCH_FOLDER;
const INGEST_URL     = process.env.CRAB_INGEST_URL;
const API_KEY        = process.env.INGEST_API_KEY;
const DEFAULT_SURNAME    = process.env.CRAB_DEFAULT_SURNAME || '';
const DEFAULT_FIRST_NAME = process.env.CRAB_DEFAULT_FIRST_NAME || '';
const DEFAULT_MIDDLE     = process.env.CRAB_DEFAULT_MIDDLE_NAME || '';
const DEFAULT_CRAB_ID    = process.env.CRAB_DEFAULT_ID || '';
const MOVE_TO        = process.env.CRAB_MOVE_AFTER_UPLOAD || '';
const POLL_INTERVAL       = parseInt(process.env.POLL_INTERVAL_MS || '5000', 10);
const CATEGORY            = process.env.CRAB_DEFAULT_CATEGORY || 'other';
const HEARTBEAT_URL       = process.env.CRAB_HEARTBEAT_URL || '';
const HEARTBEAT_INTERVAL  = parseInt(process.env.HEARTBEAT_INTERVAL_MS || '60000', 10);

const SUPPORTED = ['.pdf', '.docx', '.xlsx', '.txt', '.jpg', '.jpeg', '.png', '.heic', '.psd'];

// macOS metadata files to always ignore
const MAC_IGNORE = new Set(['.DS_Store', '.localized', 'Thumbs.db', 'desktop.ini']);
function isMacJunk(filename) {
  return MAC_IGNORE.has(filename) || filename.startsWith('._') || filename.startsWith('__MACOSX');
}

if (!WATCH_FOLDER || !INGEST_URL || !API_KEY) {
  console.error('❌  Missing required env vars: CRAB_WATCH_FOLDER, CRAB_INGEST_URL, INGEST_API_KEY');
  process.exit(1);
}

// Uploaded log
const UPLOADED_LOG = path.join(__dirname, '.crab-uploaded.json');
let uploadedFiles = new Set();

const SCAN_MODE = process.argv.includes('--scan');

// --reset flag clears the uploaded log so all files are re-processed
if (process.argv.includes('--reset')) {
  console.log('🔄  --reset: clearing uploaded log, all files will be re-processed');
  try { fs.unlinkSync(UPLOADED_LOG); } catch { /* already gone */ }
} else if (fs.existsSync(UPLOADED_LOG)) {
  try {
    const data = JSON.parse(fs.readFileSync(UPLOADED_LOG, 'utf8'));
    uploadedFiles = new Set(data);
    console.log(`📋  Loaded ${uploadedFiles.size} previously uploaded files from log`);
  } catch {
    console.warn('⚠️  Could not parse uploaded log — starting fresh');
  }
}

function saveLog() {
  fs.writeFileSync(UPLOADED_LOG, JSON.stringify([...uploadedFiles]), 'utf8');
}

// Lock file
const LOCK_FILE = path.join(__dirname, '.crab-watcher.lock');
if (fs.existsSync(LOCK_FILE)) {
  const pid = fs.readFileSync(LOCK_FILE, 'utf8').trim();
  try {
    process.kill(parseInt(pid), 0);
    console.error(`❌  Another crab watcher is already running (PID ${pid}). Exiting.`);
    process.exit(1);
  } catch {
    console.warn(`⚠️  Stale lockfile (PID ${pid}). Continuing.`);
  }
}
fs.writeFileSync(LOCK_FILE, String(process.pid), 'utf8');
process.on('exit', () => { try { fs.unlinkSync(LOCK_FILE); } catch {} });
process.on('SIGINT', () => process.exit());
process.on('SIGTERM', () => process.exit());

/**
 * Parse crab identity from a name string: "Firstname [Middle] SURNAME"
 * The last word is always treated as the surname (uppercased or not).
 * Middle name is optional.
 * Examples:
 *   "John SMITH"          → { firstName: "John",  middleName: "",        surname: "Smith" }
 *   "John Michael SMITH"  → { firstName: "John",  middleName: "Michael", surname: "Smith" }
 * Returns { surname, firstName, middleName }
 */
function parseCrabName(name) {
  // Handle "SURNAME, Firstname [Middle]" format (comma-separated)
  if (name.includes(',')) {
    const [surnamePart, restPart] = name.split(',').map(s => s.trim());
    const restParts = restPart ? restPart.split(/\s+/) : [];
    return {
      surname: surnamePart,
      firstName: restParts[0] || '',
      middleName: restParts.slice(1).join(' '),
    };
  }

  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return { surname: parts[0], firstName: '', middleName: '' };
  }
  const surname    = parts[parts.length - 1];
  const firstName  = parts[0];
  const middleName = parts.length > 2 ? parts.slice(1, -1).join(' ') : '';
  return { surname, firstName, middleName };
}

// Keep alias for subfolder parsing
const parseCrabFolder = (folderName) => parseCrabName(folderName);

/**
 * Try to parse crab identity from a filename.
 * Expects the format: "<Name> - <rest of filename>.<ext>"
 * The name portion is everything before the first " - " separator.
 * Returns { surname, firstName, middleName } or null if no separator found.
 *
 * Examples:
 *   "John SMITH - statement.pdf"         → { firstName: "John", middleName: "", surname: "SMITH" }
 *   "John Michael SMITH - id scan.jpg"   → { firstName: "John", middleName: "Michael", surname: "SMITH" }
 *   "SMITH John - letter.pdf"            → { firstName: "John", middleName: "", surname: "SMITH" }  ← last word = surname
 *   "SMITH, John Michael - docs.pdf"     → { firstName: "John", middleName: "Michael", surname: "SMITH" }
 */
function parseCrabFromFilename(filename) {
  // Strip extension
  const base = filename.replace(/\.[^/.]+$/, '');
  // Require " - " separator
  const sepIdx = base.indexOf(' - ');
  if (sepIdx === -1) return null;

  const namePart = base.slice(0, sepIdx).trim();
  if (!namePart) return null;

  return parseCrabName(namePart);
}

async function uploadFile(filePath, filename, crabInfo) {
  const fileBuffer = fs.readFileSync(filePath);
  const boundary = '----CrabVaultBoundary' + Date.now();

  const fields = {
    filename,
    first_name:  crabInfo.firstName,
    middle_name: crabInfo.middleName,
    surname:     crabInfo.surname,
    category:    CATEGORY,
  };
  if (crabInfo.crabId) fields.crab_id = crabInfo.crabId;
  if (crabInfo.aiIdentify) fields.ai_identify = 'true';

  let bodyParts = '';
  for (const [k, v] of Object.entries(fields)) {
    if (!v) continue;
    bodyParts += `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`;
  }

  const bodyStart = Buffer.from(
    bodyParts +
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

/**
 * Scan for files.
 * Supports two modes:
 *   1. Flat mode: all files in WATCH_FOLDER → use DEFAULT_SURNAME / DEFAULT_CRAB_ID
 *   2. Subfolder mode: WATCH_FOLDER/SURNAME_First_Middle/file.pdf → parse from folder name
 */
async function poll() {
  let entries;
  try { entries = fs.readdirSync(WATCH_FOLDER); } catch (e) {
    console.error('Cannot read watch folder:', e.message); return;
  }

  for (const entry of entries) {
    const entryPath = path.join(WATCH_FOLDER, entry);
    const stat = fs.statSync(entryPath);

    if (stat.isDirectory()) {
      // Subfolder mode — folder name is a hint, AI will verify
      const crabInfo = { ...parseCrabFolder(entry), aiIdentify: true };
      if (!crabInfo.surname) continue;

      let subFiles;
      try { subFiles = fs.readdirSync(entryPath); } catch { continue; }

      for (const filename of subFiles) {
        if (isMacJunk(filename)) continue;
        const logKey = `${entry}/${filename}`;
        if (uploadedFiles.has(logKey)) continue;
        const ext = path.extname(filename).toLowerCase();
        if (!SUPPORTED.includes(ext)) { uploadedFiles.add(logKey); continue; }
        const filePath = path.join(entryPath, filename);
        if (!fs.statSync(filePath).isFile()) continue;

        uploadedFiles.add(logKey);
        console.log(`📄  [${entry}] Detected: ${filename}`);
        try {
          const result = await uploadFile(filePath, filename, crabInfo);
          saveLog(); // Only persist to log after confirmed success
          console.log(`✅  Uploaded: ${filename} → doc:${result.document_id} crab:${result.crab_id} ${result.is_new_crab ? '(new profile)' : ''}`);
          // Securely delete from unencrypted watch folder immediately after confirmed upload
          try {
            fs.unlinkSync(filePath);
            console.log(`🗑️   Deleted from watch folder: ${filePath}`);
          } catch (delErr) {
            console.error(`⚠️  SECURITY WARNING: Could not delete ${filePath} — delete it manually!`, delErr.message);
          }
        } catch (err) {
          console.error(`❌  Failed ${filename}:`, err.message);
          uploadedFiles.delete(logKey);
        }
      }

    } else if (stat.isFile()) {
      const filename = entry;
      if (isMacJunk(filename)) continue;
      if (uploadedFiles.has(filename)) continue;
      const ext = path.extname(filename).toLowerCase();
      if (!SUPPORTED.includes(ext)) { uploadedFiles.add(filename); continue; }

      // Resolve crab identity hint: default env vars → filename parsing → AI
      let crabInfo = { surname: '', firstName: '', middleName: '', aiIdentify: true };
      if (DEFAULT_CRAB_ID) {
        crabInfo = { surname: DEFAULT_SURNAME, firstName: DEFAULT_FIRST_NAME, middleName: DEFAULT_MIDDLE, crabId: DEFAULT_CRAB_ID, aiIdentify: true };
      } else if (DEFAULT_SURNAME) {
        crabInfo = { surname: DEFAULT_SURNAME, firstName: DEFAULT_FIRST_NAME, middleName: DEFAULT_MIDDLE, aiIdentify: true };
      } else {
        // Try to parse crab name from filename as a hint for AI
        const parsed = parseCrabFromFilename(filename);
        if (parsed && parsed.surname) {
          console.log(`🔍  Filename hint: ${parsed.firstName} ${parsed.surname} — AI will verify`);
          crabInfo = { ...parsed, aiIdentify: true };
        } else {
          console.log(`🤖  No filename hint for "${filename}" — AI will identify from document`);
        }
      }

      const filePath = entryPath;
      uploadedFiles.add(filename);
      console.log(`📄  Detected: ${filename}`);
      try {
        const result = await uploadFile(filePath, filename, crabInfo);
        saveLog(); // Only persist to log after confirmed success
        console.log(`✅  Uploaded: ${filename} → doc:${result.document_id} crab:${result.crab_id} ${result.is_new_crab ? '(new profile)' : ''}`);
        // Securely delete from unencrypted watch folder immediately after confirmed upload
        try {
          fs.unlinkSync(filePath);
          console.log(`🗑️   Deleted from watch folder: ${filePath}`);
        } catch (delErr) {
          console.error(`⚠️  SECURITY WARNING: Could not delete ${filePath} — delete it manually!`, delErr.message);
        }
      } catch (err) {
        console.error(`❌  Failed ${filename}:`, err.message);
        uploadedFiles.delete(filename);
      }
    }
  }
}

console.log(`🦀  CrabVault Watcher started`);
console.log(`👀  Watching: ${WATCH_FOLDER}`);
console.log(`📤  Ingesting to: ${INGEST_URL}`);
if (DEFAULT_CRAB_ID) console.log(`👤  Default crab ID: ${DEFAULT_CRAB_ID}`);
else if (DEFAULT_SURNAME) console.log(`👤  Default crab: ${DEFAULT_FIRST_NAME} ${DEFAULT_SURNAME}`);
else console.log(`📁  Auto-detect mode: use subfolders ("John SMITH/") or filenames ("John SMITH - document.pdf"`);
console.log();

async function sendHeartbeat() {
  if (!HEARTBEAT_URL) return;
  const url = new URL(HEARTBEAT_URL);
  const transport = url.protocol === 'https:' ? https : http;
  const body = JSON.stringify({
    watcher_type: 'ingest_crab',
    version: '1.0.0',
    details: {
      folder: WATCH_FOLDER,
      files_processed: uploadedFiles.size,
    },
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
        'x-api-key': API_KEY,
      },
    }, res => {
      res.on('data', () => {});
      res.on('end', () => {
        if (res.statusCode === 200) console.log('💓  Heartbeat sent');
        else console.warn(`⚠️  Heartbeat failed: HTTP ${res.statusCode}`);
        resolve();
      });
    });
    req.on('error', (err) => { console.warn('⚠️  Heartbeat error:', err.message); resolve(); });
    req.write(body);
    req.end();
  });
}

if (SCAN_MODE) {
  console.log('🔍  --scan: uploading any files not yet in the log, then exiting');
  poll().then(() => {
    console.log('✅  Scan complete');
    process.exit(0);
  });
} else {
  setInterval(poll, POLL_INTERVAL);
  poll();

  if (HEARTBEAT_URL) {
    sendHeartbeat();
    setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
  }
}