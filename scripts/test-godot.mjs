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
const tests = readdirSync(join(root, 'godot/tests')).filter((f) => f.endsWith('_truth.gd') || f === 'tray_flow.gd' || f === 'route_flow.gd' || f === 'salt_flow.gd' || f === 'ch2_flow.gd' || f === 'ch5_flow.gd' || f === 'island_flow.gd' || f === 'grid_tray_flow.gd' || f === 'ch3_flow.gd' || f === 'ch4_flow.gd' || f === 'ch6_flow.gd' || f === 'ch7_flow.gd' || f === 'ch8_flow.gd' || f === 'chf_flow.gd' || f === 'hud_flow.gd' || f === 'ticker_flow.gd').map((f) => f.replace(/\.gd$/, '')).filter((n) => want.length === 0 || want.includes(n));
let bad = 0;
for (const t of tests) {
  const r = sh('godot', ['--headless', '--path', 'godot', '--script', `res://tests/${t}.gd`], { timeout: 180000 });
  const out = `${r.stdout}\n${r.stderr}`;
  const lines = out.split('\n').filter((l) => /^FAIL|OK$|FAILED|SCRIPT ERROR|checks=/.test(l));
  const ok = /^[A-Z0-9-]+ OK$/m.test(out) && !/SCRIPT ERROR/.test(out);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${t}\n  ${lines.join('\n  ')}`);
  if (!ok) bad++;
}
// the full-app smoke: CB_SMOKE=1 runs main.gd's game_smoke, which ends with the paper screens flow (tests/paper_flow.gd: title, work order, loss, Retry, win, chapter card)
if (want.length === 0 || want.includes('paper_flow') || want.includes('career_flow')) {
  const r = sh('godot', ['--headless', '--path', 'godot'], { timeout: 300000, env: { ...process.env, CB_SMOKE: '1' } });
  const out = `${r.stdout}\n${r.stderr}`;
  const ok = /^SMOKE OK/m.test(out) && /^CAREER-FLOW OK/m.test(out) && !/SCRIPT ERROR/.test(out);
  console.log(`${ok ? 'PASS' : 'FAIL'} smoke+paper_flow+career_flow\n  ${out.split('\n').filter((l) => /SMOKE|FAIL|CAREER-FLOW|SCRIPT ERROR/.test(l)).join('\n  ')}`);
  if (!ok) bad++;
}
process.exit(bad ? 1 : 0);
