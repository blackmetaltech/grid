#!/usr/bin/env node
// Runs the headless Godot world-truth tests (godot/tests/*_truth.gd): rebuilds the engine sidecar, imports the project, then runs each
// script through core/qa/run-flow.sh, which fails a run on a script error in its log (SCRIPT ERROR, Parse Error, Error calling ...), a missing OK
// line, a timeout, or a check count under the minimum in flow-min.txt. Usage: node scripts/test-godot.mjs [name ...]   (RAISE=1 raises the minimums after a green run)
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { cwd: root, encoding: 'utf8', ...opts });
const build = sh('npx', ['vite', 'build', '-c', 'vite.bridge.config.ts']);
if (build.status !== 0) { console.error(build.stdout, build.stderr); process.exit(1); }
sh('godot', ['--headless', '--path', 'godot', '--import']);
const want = process.argv.slice(2);
const tests = readdirSync(join(root, 'godot/tests')).filter((f) => f.endsWith('_truth.gd') || f === 'tray_flow.gd' || f === 'route_flow.gd' || f === 'salt_flow.gd' || f === 'ch2_flow.gd' || f === 'ch5_flow.gd' || f === 'island_flow.gd' || f === 'grid_tray_flow.gd' || f === 'ch3_flow.gd' || f === 'ch4_flow.gd' || f === 'ch6_flow.gd' || f === 'ch7_flow.gd' || f === 'ch8_flow.gd' || f === 'chf_flow.gd' || f === 'hud_flow.gd' || f === 'ticker_flow.gd').map((f) => f.replace(/\.gd$/, '')).filter((n) => want.length === 0 || want.includes(n));
const logDir = process.env.CB_FLOW_LOGS || join(tmpdir(), 'grid-flows');
mkdirSync(logDir, { recursive: true });
const runner = join(root, 'core/qa/run-flow.sh');
const raise = process.env.RAISE ? ['--raise'] : [];
// one flow through the shared runner; `env` is passed to Godot (the main-scene flows are env-driven). Returns the verdict line and the log text.
const flow = (key, secs, tail, env = {}) => {
  const r = sh(runner, ['-o', logDir, '-T', String(secs), ...raise, ...tail], { env: { ...process.env, ...env } });
  return { ok: r.status === 0, line: (r.stdout || r.stderr).trim().split('\n').pop() };
};
let bad = 0;
for (const t of tests) {
  const r = flow(t, 180, [t]);
  console.log(r.line);
  if (!r.ok) bad++;
}
// the full-app smoke: CB_SMOKE=1 runs main.gd's game_smoke, which ends with the paper screens flow (tests/paper_flow.gd: title, work order, loss, Retry, win, chapter card)
if (want.length === 0 || want.includes('paper_flow') || want.includes('career_flow')) {
  const r = flow('smoke', 300, ['-k', 'smoke', '--'], { CB_SMOKE: '1' });
  const log = readFileSync(join(logDir, 'smoke.log'), 'utf8');
  const ok = r.ok && /^SMOKE OK/m.test(log) && /^CAREER-FLOW OK/m.test(log);
  console.log(ok ? r.line : `FAIL ${r.line} (SMOKE OK and CAREER-FLOW OK are both required)`);
  if (!ok) bad++;
}
// 1.9 text audit: CB_TEXTAUDIT=1 walks every screen at 1920x1080 and 1280x800 (tests/text_flow.gd): no visible text under 16 px, no hand-drawn
// string wider than its control, the pad strip inside the window and clear of every other piece of text
if (want.length === 0 || want.includes('text_flow')) {
  const r = flow('text_flow', 900, ['-k', 'text_flow', '--'], { CB_TEXTAUDIT: '1', CB_NOAUDIO: '1', CB_NOAUTOSAVE: '1' });
  const log = readFileSync(join(logDir, 'text_flow.log'), 'utf8');
  const ok = r.ok && /^TEXT-FLOW OK/m.test(log);
  console.log(ok ? r.line : `FAIL ${r.line} (TEXT-FLOW OK required)`);
  if (!ok) bad++;
}
process.exit(bad ? 1 : 0);
