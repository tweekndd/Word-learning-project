#!/usr/bin/env node
/**
 * Scan the production build output for leaked secrets (taskbook §5.4, §14).
 *
 * - If COLLINS_API_KEY is set (env or .env), fail when its literal value
 *   appears in dist/.
 * - Also fail on obvious key-like literals in the bundle.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

if (!existsSync(dist)) {
  console.error('dist/ 不存在，请先运行 npm run build');
  process.exit(2);
}

function loadEnvKey() {
  if (process.env.COLLINS_API_KEY) return process.env.COLLINS_API_KEY;
  const envPath = join(root, '.env');
  if (!existsSync(envPath)) return '';
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*COLLINS_API_KEY\s*=\s*(.+)\s*$/);
    if (m) return m[1].trim();
  }
  return '';
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}

const secret = loadEnvKey();
const genericPatterns = [/accessKey["'\s:=]{1,4}[A-Za-z0-9]{32,}/, /AKIA[0-9A-Z]{16}/];
let failures = 0;

for (const file of walk(dist)) {
  const content = readFileSync(file, 'utf8');
  if (secret && secret.length >= 8 && content.includes(secret)) {
    console.error(`✖ 发现真实密钥泄漏于 ${file}`);
    failures += 1;
  }
  for (const pattern of genericPatterns) {
    if (pattern.test(content)) {
      console.error(`✖ 发现疑似密钥模式 ${pattern} 于 ${file}`);
      failures += 1;
    }
  }
}

if (failures > 0) {
  console.error(`扫描完成：发现 ${failures} 处问题。`);
  process.exit(1);
}
console.log(secret ? '扫描完成：未在构建产物中发现密钥。' : '扫描完成：未配置密钥，仅做通用模式检查，通过。');
