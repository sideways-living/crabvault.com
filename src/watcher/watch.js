#!/usr/bin/env node
/**
 * DocVault Local Folder Watcher
 * Watches a folder for new files and uploads them to DocVault automatically.
 *
 * Setup:
 *   1. cd watcher
 *   2. npm install
 *   3. Copy .env.example to .env and fill in your values
 *   4. node watch.js
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

const WATCH_FOLDER = process.env.WATCH_FOLDER;
const INGEST_URL   = process.env.INGEST_URL;   // e.g. https://your-app.base44.app/api/functions/ingestDocument
const API_KEY      = process.env.INGEST_API_KEY;
const MOVE_TO      = process.env.MOVE_AFTER_UPLOAD || ''; // optional: move file here after upload
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL_MS || '5000', 10);

const SUPPORTED = ['.pdf', '.docx', '.xlsx', '.pptx', '.txt', '.jpg', '.jpeg', '.png'];

if (!WATCH_FOLDER || !INGEST_URL || !API_KEY) {
  console.error('❌  Missing required env vars: WATCH_FOLDER, INGEST_URL, INGEST_API_KEY');
  process.exit(1);
}

const seen = new Set();

// Seed seen with files already in the folder on startup (don't re-upload existing files)
fs.readdirSync(WATCH_FOLDER).forEach(f => seen.add(f));
console.log(`👀  Watching: ${WATCH_FOLDER}`);
console.log(`📤  Uploading to: ${INGEST_URL}`);
console.log(`⏱️   Poll interval: ${POLL_INTERVAL}ms\n`);

async function uploadFile(filePath, filename) {
  const fileBuffer = fs.readFileSync(filePath);
  const boundary = '----DocVaultBoundary' + Date.now();

  const bodyParts = [
    `--${boundary}\r\nContent-Disposition: form-data; name="filename"\r\n\r\n${filename}`,
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
  ];

  const bodyStart = Buffer.from(bodyParts.join('\r\n') + '\r\n', 'utf8');
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

    seen.add(filename); // mark early to avoid double-upload on slow systems
    console.log(`📄  New file detected: ${filename}`);

    try {
      const result = await uploadFile(filePath, filename);
      console.log(`✅  Uploaded: ${filename} → document_id: ${result.document_id}`);

      if (MOVE_TO) {
        const dest = path.join(MOVE_TO, filename);
        fs.mkdirSync(MOVE_TO, { recursive: true });
        fs.renameSync(filePath, dest);
        console.log(`📦  Moved to: ${dest}`);
      }
    } catch (err) {
      console.error(`❌  Failed to upload ${filename}:`, err.message);
      seen.delete(filename); // allow retry on next poll
    }
  }
}

setInterval(poll, POLL_INTERVAL);
poll(); // run immediately on start