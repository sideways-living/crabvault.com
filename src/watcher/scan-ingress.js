#!/usr/bin/env node
/* eslint-disable no-undef */
/**
 * DocVault Ingress Folder Scanner
 * Scans the ingress folder and compares against the app's document database.
 * Optionally re-uploads missing files automatically.
 *
 * Setup:
 *   Uses the same .env as watch.js (WATCH_FOLDER, INGEST_API_KEY, INGEST_URL)
 *   Add SCAN_URL to your .env:
 *     SCAN_URL=https://your-app.base44.app/api/functions/scanIngressFolder
 *
 * Run:
 *   node scan-ingress.js            # scan only
 *   node scan-ingress.js --upload   # scan + auto-upload missing files
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Load .env
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [key, ...vals] = line.split('=');
    if (key && vals.length) process.env[key.trim()] = vals.join('=').trim();
  });
}

const WATCH_FOLDER = process.env.WATCH_FOLDER;
const API_KEY      = process.env.INGEST_API_KEY;
const SCAN_URL     = process.env.SCAN_URL || process.env.INGEST_URL?.replace('ingestDocument', 'scanIngressFolder');
const INGEST_URL   = process.env.INGEST_URL;
const DO_UPLOAD    = process.argv.includes('--upload');

if (!WATCH_FOLDER || !API_KEY || !SCAN_URL) {
  console.error('❌  Missing required env vars: WATCH_FOLDER, INGEST_API_KEY, SCAN_URL');
  console.error('   Add SCAN_URL=https://your-app.base44.app/api/functions/scanIngressFolder to your .env');
  process.exit(1);
}

if (DO_UPLOAD && !INGEST_URL) {
  console.error('❌  --upload requires INGEST_URL to be set in your .env');
  process.exit(1);
}

console.log(`🔍  Scanning: ${WATCH_FOLDER}`);
console.log(`📡  Reporting to: ${SCAN_URL}`);
if (DO_UPLOAD) console.log('📤  Auto-upload mode enabled');
console.log('');

function statFile(filePath) {
  try { return fs.statSync(filePath); } catch { return null; }
}

// Collect all files recursively, indexed by filename for quick lookup
function collectFiles(dir, base = dir) {
  const results = [];
  let entries;
  try { entries = fs.readdirSync(dir); } catch { return results; }
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const stat = statFile(full);
    if (!stat) continue;
    if (stat.isDirectory()) {
      results.push(...collectFiles(full, base));
    } else {
      results.push({
        name: entry,
        full_path: full,
        relative_path: path.relative(base, full),
        size_bytes: stat.size,
        modified_iso: stat.mtime.toISOString(),
      });
    }
  }
  return results;
}

function postJson(urlStr, bodyObj) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const transport = url.protocol === 'https:' ? https : http;
    const body = JSON.stringify(bodyObj);
    const req = transport.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'x-api-key': API_KEY,
      },
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        resolve(JSON.parse(data));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function uploadFile(filePath, filename) {
  return new Promise((resolve, reject) => {
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

async function main() {
  const files = collectFiles(WATCH_FOLDER);
  console.log(`📂  Found ${files.length} total files in ingress folder`);

  // Build a map for quick full-path lookup by filename
  const fileMap = {};
  for (const f of files) fileMap[f.name] = f;

  // Run scan
  const result = await postJson(SCAN_URL, { files: files.map(({ full_path, ...rest }) => rest) });

  console.log('\n✅  Scan complete!\n');
  console.log(`  Total files in folder : ${result.total_ingress}`);
  console.log(`  Supported file types  : ${result.total_supported}`);
  console.log(`  Found in app          : ${result.total_found}`);
  console.log(`  ❌ Missing from app   : ${result.total_missing}`);
  console.log(`  ⚠️  Duplicates in app  : ${result.total_duplicates}`);
  console.log(`  ⛔ Unsupported types  : ${result.total_unsupported}`);

  const missing = result.missing_files || [];
  if (missing.length > 0) {
    console.log('\n📋  Missing files:');
    missing.forEach(f => {
      console.log(`  - ${f.name}  (${f.size_bytes ? (f.size_bytes / 1024).toFixed(0) + ' KB' : '?'})`);
    });
  }

  if (!DO_UPLOAD) {
    if (missing.length > 0) {
      console.log('\n💡  Run with --upload to automatically re-upload missing files:');
      console.log('   node scan-ingress.js --upload');
    }
    return;
  }

  if (missing.length === 0) {
    console.log('\n🎉  Nothing to upload — all files are accounted for.');
    return;
  }

  console.log(`\n📤  Uploading ${missing.length} missing file(s)...\n`);
  let succeeded = 0;
  let failed = 0;

  for (const f of missing) {
    const entry = fileMap[f.name];
    if (!entry) {
      console.log(`  ⚠️  Skipping ${f.name} — not found on disk`);
      failed++;
      continue;
    }
    process.stdout.write(`  Uploading ${f.name}... `);
    try {
      await uploadFile(entry.full_path, f.name);
      console.log('✅');
      succeeded++;
    } catch (err) {
      console.log(`❌ (${err.message})`);
      failed++;
    }
  }

  console.log(`\n🏁  Done: ${succeeded} uploaded, ${failed} failed`);
  if (succeeded > 0) {
    console.log('👀  Check the Review Queue in the app to process the uploaded files.');
  }
}

main().catch(err => {
  console.error('❌  Fatal error:', err.message);
  process.exit(1);
});