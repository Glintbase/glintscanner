#!/usr/bin/env node
/**
 * glintscan CLI wrapper — runs scripts/glintscan.ts via tsx.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(__dirname, '..', 'scripts', 'glintscan.ts');
const args = process.argv.slice(2);

const child = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['tsx', script, ...args],
  {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..'),
    shell: process.platform === 'win32',
    env: process.env,
  }
);

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});

child.on('error', (err) => {
  console.error('Failed to start glintscan:', err.message);
  console.error('Ensure dependencies are installed: npm install');
  process.exit(1);
});
