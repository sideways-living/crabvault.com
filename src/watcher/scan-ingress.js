#!/usr/bin/env node
/* eslint-disable no-undef */
/**
 * DocVault Ingress Folder Scanner
 * Scans the ingress folder and compares against the app's document database.
 *
 * Setup:
 *   Uses the same .env as watch.js (WATCH_FOLDER, INGEST_API_KEY)
 *   Add SCAN_URL to your .env:
 *     SCAN_URL=https://your-app.base44.app/api/functions/scanIngressFolder
 *
 * Run:
 *   node scan-ingress.js
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
const API_KEY = process.env.INGEST_API_KEY;
const SCAN_URL = process.env.SCAN_URL || process.env.INGEST_URL?.replace('ingestDocument', 'scanIngressFolder');

if (!WATCH_FOLDER || !API_KEY || !SCAN_URL) {
  console.error('❌  Missing required env vars: WATCH_FOLDER, INGEST_API_KEY, SCAN_URL');
  console.error('   Add SCAN_URL=https://your-app.base44.app/api/functions/scanIngressFolder to your .env');
  process.exit(1);
}

console.log(`🔍  Scanning: ${WATCH_FOLDER}`);
console.log(`📡  Reporting to: ${SCAN_URL}\n`);

function statFile(filePath) {
  try { return fs.statSync(filePath); } catch { return null; }
}

// Collect all files recursively
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
        relative_path: path.relative(base, full),
        size_bytes: stat.size,
        modified_iso: stat.mtime.toISOString(),
      });
    }
  }
  return results;
}

const files = collectFiles(WATCH_FOLDER);
console.log(`📂  Found ${files.length} total files in ingress folder`);

// POST to backend
const url = new URL(SCAN_URL);
const transport = url.protocol === 'https:' ? https : http;
const body = JSON.stringify({ files });

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
    if (res.statusCode !== 200) {
      console.error(`❌  Server error ${res.statusCode}: ${data}`);
      process.exit(1);
    }
    const result = JSON.parse(data);
    console.log('\n✅  Scan complete!\n');
    console.log(`  Total files in folder : ${result.total_ingress}`);
    console.log(`  Supported file types  : ${result.total_supported}`);
    console.log(`  Found in app          : ${result.total_found}`);
    console.log(`  ❌ Missing from app   : ${result.total_missing}`);
    console.log(`  ⚠️  Duplicates in app  : ${result.total_duplicates}`);
    console.log(`  ⛔ Unsupported types  : ${result.total_unsupported}`);
    if (result.missing && result.missing.length > 0) {
      console.log('\n📋  Missing files:');
      result.missing.forEach(f => {
        console.log(`  - ${f.name}  (${(f.size_bytes / 1024).toFixed(0)} KB)`);
      });
    }
    console.log('\n👀  Open the Ingress Scanner page in your app to see full results and re-upload missing files.');
  });
});
req.on('error', err => {
  console.error('❌  Request failed:', err.message);
  process.exit(1);
});
req.write(body);
req.end();