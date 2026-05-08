#!/usr/bin/env node
/* eslint-disable no-undef */
/**
 * Launches both watch-crab.js and sync-to-vault.js in the same terminal.
 * Run with: npm run start:all  or  node start-all.js
 *
 * Ctrl+C stops both processes.
 */

const { spawn } = require('child_process');
const path = require('path');

const NODE = process.execPath; // full path to the node binary that's running this script

function launch(script, prefix) {
  const child = spawn(NODE, [path.join(__dirname, script)], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });

  child.stdout.on('data', d => process.stdout.write(`[${prefix}] ${d}`));
  child.stderr.on('data', d => process.stderr.write(`[${prefix}] ${d}`));

  child.on('exit', (code) => {
    console.log(`[${prefix}] exited with code ${code}`);
    process.exit(code || 0);
  });

  return child;
}

console.log('🦀  CrabVault — starting watcher + vault sync\n');

const watcher = launch('watch-crab.js', 'WATCH');
const syncer  = launch('sync-to-vault.js', 'SYNC ');

process.on('SIGINT', () => {
  console.log('\n🛑  Stopping...');
  watcher.kill('SIGINT');
  syncer.kill('SIGINT');
  setTimeout(() => process.exit(0), 500);
});

process.on('SIGTERM', () => {
  watcher.kill('SIGTERM');
  syncer.kill('SIGTERM');
  process.exit(0);
});