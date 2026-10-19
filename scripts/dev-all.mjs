#!/usr/bin/env node
/**
 * Run the dev proxy + Vite together. If no COLLINS_API_KEY is configured the
 * proxy still starts and reports `configured: false`; the app falls back to
 * Mock mode. Vite proxies /api/collins to the proxy.
 */
import { spawn } from 'node:child_process';

const children = [];

function run(command, args, name) {
  const child = spawn(command, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  child.on('exit', (code) => {
    console.log(`[dev-all] ${name} exited with code ${code}`);
    shutdown();
  });
  children.push(child);
}

function shutdown() {
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

run('node', ['server/index.mjs'], 'proxy');
run('npx', ['vite'], 'vite');
