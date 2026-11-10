#!/usr/bin/env node
// Runs the headless Godot world-truth tests (godot/tests/*_truth.gd): rebuilds the engine sidecar, imports the project, then runs each
// script under a timeout and requires its `<NAME> OK` line. Usage: node scripts/test-godot.mjs [name ...]
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { cwd: root, encoding: 'utf8', ...opts });
const build = sh('npx', ['vite', 'build', '-c', 'vite.bridge.config.ts']);
if (build.status !== 0) { console.error(build.stdout, build.stderr); process.exit(1); }
sh('godot', ['--headless', '--path', 'godot', '--import']);
const want = process.argv.slice(2);
const tests = readdirSync(join(root, 'godot/tests')).filter((f) => f.endsWith('_truth.gd') || f === 'tray_flow.gd').map((f) => f.replace(/\.gd$/, '')).filter((n) => want.length === 0 || want.includes(n));
let bad = 0;
for (const t of tests) {
  const r = sh('godot', ['--headless', '--path', 'godot', '--script', `res://tests/${t}.gd`], { timeout: 180000 });
  const out = `${r.stdout}\n${r.stderr}`;
  const lines = out.split('\n').filter((l) => /^FAIL|OK$|FAILED|SCRIPT ERROR|checks=/.test(l));
  const ok = /^[A-Z-]+ OK$/m.test(out) && !/SCRIPT ERROR/.test(out);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${t}\n  ${lines.join('\n  ')}`);
  if (!ok) bad++;
}
process.exit(bad ? 1 : 0);
