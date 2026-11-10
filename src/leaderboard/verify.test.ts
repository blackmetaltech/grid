// M1.11: GRID1 codes, the pure verifier, the esbuild bundle. Round trip, tamper, garbage fuzz, bridge parity, bit-exact 10-bus result.
import { describe, expect, it, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { Engine, Env, Rng, crc32, decodeSolution, encodeSolution } from '@core/kit';
import { createProtocol } from '@core/kit/protocol';
import { GAME } from '../game';
import { TEST_GAME } from '../testgrid';
import { makeGridVerifier, parseGridCode } from './verify';
import type { GridState } from '../types';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const V = makeGridVerifier(GAME);
const TV = makeGridVerifier(TEST_GAME);
const hex8 = (n: number): string => n.toString(16).padStart(8, '0');
const reseal = (body: string): string => body + '.' + hex8(crc32(body));

function t00Run(): Engine<any> {
  const env = new Env(GAME); env.reset({ seed: 1, level: 'T00' });
  const agent = GAME.levels!.find((l) => l.id === 'T00')!.solver!(1);
  for (let i = 0; i < 60 && env.state.status === 'playing'; i++) { for (const a of agent(env.state, env.ctx({} as any))) env.step(a); if (env.state.status === 'playing') env.step({ name: 'tick' }); }
  return env.engine;
}
function tgRun(level: 'TG1' | 'TG2'): Engine<GridState> {
  const e = new Engine(TEST_GAME); e.autosave = false;
  expect(e.act('startLevel', [level, 1]).ok).toBe(true);
  for (let i = 0; i < 100 && e.state.status === 'playing'; i++) e.act('tick');
  return e as Engine<GridState>;
}
const t00Code = (): string => V.wrap('T00', t00Run().q('solutionCode') as string)!;

describe('GRID1 code: round trip', () => {
  it('wrap -> parse -> verify returns the metrics, stars, ruleset id, level hash and ticks', () => {
    const code = t00Code();
    expect(code).toMatch(/^GRID1\.T00\.[0-9a-f]{8}\.CB1\./);
    const p = parseGridCode(code); expect('error' in p).toBe(false);
    const r = V('T00', code);
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.rulesetId).toBe('grid:global@6.1'); expect(r.levelHash).toBe(V.levelHash('T00')); expect(r.ticks).toBe(8);
    expect(r.metrics).toMatchObject({ ticks: 8, cost: 0, ensMWh: 0 });
    expect(V('T00', code)).toEqual(r);   // pure: same in, same out
  });
  it('the level hash is stable across verifiers and differs per level', () => {
    expect(makeGridVerifier(GAME).levelHash('T00')).toBe(V.levelHash('T00'));
    expect(TV.levelHash('TG1')).not.toBe(TV.levelHash('TG2'));
    expect(V.levelHash('nope')).toBeNull(); expect(V.wrap('nope', 'CB1.x.y')).toBeNull();
  });
  it('a code of one level is rejected for another, and an unknown level is unknown-level', () => {
    const code = t00Code();
    expect(V('nope', code)).toMatchObject({ ok: false, error: 'unknown-level' });
    expect(TV('TG1', TV.wrap('T00', t00Run().q('solutionCode') as string)!)).toMatchObject({ ok: false, error: 'malformed' });
  });
});

describe('GRID1 code: tamper', () => {
  const code = t00Code(); const parts = code.split('.');
  it('any single-character edit is rejected (crc or malformed), never ok', () => {
    for (let i = 0; i < code.length; i++) {
      const ch = code[i] === 'A' ? 'B' : 'A'; const r = V('T00', code.slice(0, i) + ch + code.slice(i + 1));
      expect(r.ok, `pos ${i}`).toBe(false);
    }
  });
  it('a bad checksum is crc; truncated is malformed', () => {
    expect(V('T00', code.slice(0, -1) + (code.endsWith('0') ? '1' : '0'))).toMatchObject({ ok: false, error: 'crc' });
    expect(V('T00', code.slice(0, 30))).toMatchObject({ ok: false, error: 'malformed' });
  });
  it('a re-sealed code with another level hash is stale-level', () => {
    const body = ['GRID1', 'T00', '00000000', ...parts.slice(3, -1)].join('.');
    expect(V('T00', reseal(body))).toMatchObject({ ok: false, error: 'stale-level' });
  });
  it('a re-sealed edit of the action list is replayed: dropping the move is did-not-finish; an illegal move is illegal-action', () => {
    const cb = t00Run().q('solutionCode') as string; const d = decodeSolution(cb) as any; const h = V.levelHash('T00')!;
    const seal = (c: string): string => reseal(`GRID1.T00.${h}.${c}`);
    expect(V('T00', seal(encodeSolution({ ...d, actions: d.actions.slice(1) })))).toMatchObject({ ok: false, error: 'did-not-finish' });
    expect(V('T00', seal(encodeSolution({ ...d, actions: [['setSpeed', [3]], ...d.actions] })))).toMatchObject({ ok: false, error: 'illegal-action' });
    expect(V('T00', seal(encodeSolution({ ...d, actions: [['noSuchAction', []], ...d.actions] })))).toMatchObject({ ok: false, error: 'illegal-action' });
  });
  it('a re-sealed code from another ruleset or region is ruleset-mismatch', () => {
    const d = decodeSolution(t00Run().q('solutionCode') as string) as any; const h = V.levelHash('T00')!;
    for (const ruleset of ['grid:global@1.0', 'grid:global@2.0', 'junk', 'grid:zz@6.1']) {
      const r = V('T00', reseal(`GRID1.T00.${h}.${encodeSolution({ ...d, ruleset })}`));
      expect(r.ok, ruleset).toBe(false);
      if (!r.ok) expect(['ruleset-mismatch', 'malformed']).toContain(r.error);
    }
    expect(V('T00', reseal(`GRID1.T00.${h}.${encodeSolution({ ...d, ruleset: 'grid:global@1.0' })}`))).toMatchObject({ error: 'ruleset-mismatch' });
    expect(V('T00', code, { region: 'in' })).toMatchObject({ ok: false });
  });
  it('the tick cap is a budget error, and a throwing budget hook propagates', () => {
    expect(V('T00', code, { maxTicks: 2 })).toMatchObject({ ok: false });
    expect(() => V('T00', code, { budget: () => { throw new Error('over'); } })).toThrow('over');
  });
});

describe('garbage fuzz: verify never throws, always ok:false', () => {
  it('random strings, mutated valid codes, odd types', () => {
    const rng = new Rng(7); const valid = t00Code();
    const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.{}[]"\' \né☃\ud83d';
    let n = 0;
    for (let k = 0; k < 3000; k++) {
      let s: string;
      const mode = k % 4;
      if (mode === 0) s = Array.from({ length: rng.int(0, 120) }, () => alpha[rng.int(0, alpha.length - 1)]).join('');
      else if (mode === 1) { const a = rng.int(0, valid.length - 1); s = valid.slice(0, a) + alpha[rng.int(0, alpha.length - 1)] + valid.slice(a + rng.int(0, 3)); }
      else if (mode === 2) s = valid.split('.').map((p) => (rng.next() < 0.3 ? p.slice(rng.int(0, p.length)) : p)).join(rng.next() < 0.1 ? ',' : '.');
      else s = 'GRID1.' + Array.from({ length: rng.int(0, 5) }, () => Array.from({ length: rng.int(0, 12) }, () => alpha[rng.int(0, 63)]).join('')).join('.');
      const r = V('T00', s);
      if (s !== valid) expect(r.ok, JSON.stringify(s)).toBe(false);
      n++;
    }
    for (const x of [undefined, null, 5, {}, [], NaN, 'GRID1', 'GRID1...', '\0', 'x'.repeat(400_000)] as any[]) expect(V('T00', x).ok).toBe(false);
    for (const lv of [undefined, null, 5, '', '__proto__', 'constructor'] as any[]) expect(V(lv, valid).ok).toBe(false);
    expect(n).toBe(3000);
  });
  it('a CB1 payload that is valid JSON of the wrong shape is rejected cleanly', () => {
    const h = V.levelHash('T00')!;
    for (const bad of [[], 'x', [1, 2], [GAME.id, 'T00', 'grid:global@6.1', 1, 'engineer', 'nope']]) {
      const b64 = Buffer.from(JSON.stringify(bad)).toString('base64url'); const head = 'CB1.' + b64; const cb = head + '.' + hex8(crc32(head));
      expect(V('T00', reseal(`GRID1.T00.${h}.${cb}`)).ok).toBe(false);
    }
  });
});

describe('bridge parity', () => {
  it('the protocol (stdio bridge handler) and the in-process engine produce the same code, state hash and verdict', () => {
    const inProc = t00Run();
    const bridge = createProtocol(new Engine(GAME)); const call = (fn: string, name?: string, args?: unknown[]) => bridge({ fn, name, args } as any);
    call('env', 'autosave', [false]);
    expect((call('act', 'startLevel', ['T00', 1]).result as any).ok).toBe(true);
    for (const [name, args] of (inProc.state as any).levelActions) expect((call('act', name, args).result as any).ok, name).toBe(true);
    const code = call('q', 'solutionCode').result as string;
    expect(code).toBe(inProc.q('solutionCode'));
    expect(call('env', 'hash').result).toBe(new Env(inProc).hash());
    expect(V('T00', V.wrap('T00', code)!).ok).toBe(true);
  });
  it('the 10-bus day through the protocol equals the in-process day (state hash per block)', () => {
    const bridge = createProtocol(new Engine(TEST_GAME)); const call = (fn: string, name?: string, args?: unknown[]) => bridge({ fn, name, args } as any);
    call('env', 'autosave', [false]); call('act', 'startLevel', ['TG1', 1]);
    const e = new Engine(TEST_GAME); e.autosave = false; e.act('startLevel', ['TG1', 1]);
    for (let i = 0; i < 40; i++) { call('act', 'tick'); e.act('tick'); expect(call('env', 'hash').result).toBe(new Env(e).hash()); }
  });
});

describe('verify on the synthetic 10-bus level equals the in-process result bit-exactly', () => {
  for (const level of ['TG1', 'TG2'] as const) {
    it(`${level}: metrics, ticks, stars`, () => {
      const e = tgRun(level);
      const code = TV.wrap(level, e.q('solutionCode') as string)!;
      const r = TV(level, code);
      const s = e.state;
      expect(s.status).toBe('won');
      expect(r.ok).toBe(true); if (!r.ok) return;
      const want = { ticks: s.tick - s.levelStart, cost: s.metrics.cost, capex: s.metrics.capex, opex: s.metrics.opex, ensMWh: s.metrics.ensMWh, lossesMWh: s.metrics.lossesMWh, stars: s.stars };
      for (const k of Object.keys(want) as (keyof typeof want)[]) expect(Object.is(r.metrics[k], want[k]), `${k}: ${r.metrics[k]} vs ${want[k]}`).toBe(true);
      expect(r.ticks).toBe(96); expect(r.metrics.cost).toBeGreaterThan(0); if (level === 'TG2') expect(s.metrics.ensMWh).toBeGreaterThan(0); expect(r.stars).toBe(s.stars);
    });
  }
});

describe('dist/verify.mjs', () => {
  let dir = ''; let mod: any; let tmod: any;
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'grid-verify-'));
    execFileSync('node', ['scripts/build-verify.mjs', '--out', join(dir, 'verify.mjs')], { cwd: ROOT, stdio: 'pipe' });
    execFileSync('node', ['scripts/build-verify.mjs', '--entry', 'src/leaderboard/entry-testgrid.ts', '--out', join(dir, 'testgrid.mjs')], { cwd: ROOT, stdio: 'pipe' });
    mod = await import(/* @vite-ignore */ pathToFileURL(join(dir, 'verify.mjs')).href);
    tmod = await import(/* @vite-ignore */ pathToFileURL(join(dir, 'testgrid.mjs')).href);
  }, 120000);
  it('is a script of at most 1.5 MB with no Node built-ins or imports', () => {
    const src = readFileSync(join(dir, 'verify.mjs'), 'utf8');
    expect(statSync(join(dir, 'verify.mjs')).size).toBeLessThanOrEqual(1.5 * 1024 * 1024);
    expect(src).not.toMatch(/\bfrom\s*["'](node:|fs|path|os|crypto|child_process)/); expect(src).not.toMatch(/\brequire\(|node:|process\./);
    expect(/(^|[;}])import[\s{"']/.test(src.replace(/import\(/g, ''))).toBe(false);
  });
  it('gives the in-process answer for T00, errors included', () => {
    const code = t00Code();
    expect(mod.verify('T00', code)).toEqual(V('T00', code));
    expect(mod.levelHash('T00')).toBe(V.levelHash('T00')); expect(mod.levelIds()).toEqual(GAME.levels!.map((l: any) => l.id));
    expect(mod.wrapSolution('T00', t00Run().q('solutionCode'))).toBe(code);
    for (const bad of ['', 'GRID1.T00.x', code.slice(0, -1) + 'z', reseal(code.split('.').slice(0, -1).join('.').replace(/T00\.[0-9a-f]{8}/, 'T00.00000000'))]) expect(mod.verify('T00', bad)).toEqual(V('T00', bad));
  });
  it('the bundled 10-bus verifier equals the in-process one bit-exactly', () => {
    const e = tgRun('TG1'); const code = TV.wrap('TG1', e.q('solutionCode') as string)!;
    expect(tmod.wrapSolution('TG1', e.q('solutionCode'))).toBe(code);
    const a = tmod.verify('TG1', code), b = TV('TG1', code);
    expect(a.ok).toBe(true); expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
