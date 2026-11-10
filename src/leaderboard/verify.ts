// The pure leaderboard verifier (DESIGN 12.3). A GRID1 code wraps core's CB1 solution code (which carries game, level, ruleset,
// seed, mode and the action list) with the level id and a level hash, under one CRC:
//   GRID1.<levelId>.<levelHash8>.<CB1 code>.<crc8>      crc8 = first 8 hex of CRC-32 over everything before it (typos, not security)
// verify() never throws on bad input (always {ok:false}); only an error thrown by the caller's own `budget` hook propagates.
// Pure: no Node APIs, no clock, no I/O, so it runs in Workers and Node and reproduces the client bit-for-bit.
import { Engine, MemoryKV, crc32, hashOf, makeVerifier, type GameDef, type VerifyOpts } from '@core/kit';
import type { GridState } from '../types';

export const CODE_PREFIX = 'GRID1';
export const MAX_GRID_CODE_CHARS = 300 * 1024;
const hex8 = (n: number): string => n.toString(16).padStart(8, '0');

export type VerifyError = 'malformed' | 'crc' | 'unknown-level' | 'stale-level' | 'ruleset-mismatch' | 'illegal-action' | 'did-not-finish' | 'budget';
export interface VerifyOk { ok: true; metrics: Record<string, number>; stars: 0 | 1 | 2 | 3; rulesetId: string; levelHash: string; ticks: number }
export interface VerifyFail { ok: false; error: VerifyError; detail: string }
export type GridVerifyResult = VerifyOk | VerifyFail;
export interface GridVerifier {
  (levelId: string, solutionCode: string, opts?: VerifyOpts): GridVerifyResult;
  levelHash: (levelId: string, region?: string) => string | null;
  wrap: (levelId: string, cb1Code: string, region?: string) => string | null;
}

export interface ParsedGridCode { levelId: string; levelHash: string; cb1: string }

/** Parse and CRC-check a GRID1 code. Never throws. */
export function parseGridCode(code: unknown): ParsedGridCode | { error: 'malformed' | 'crc'; detail: string } {
  if (typeof code !== 'string') return { error: 'malformed', detail: 'The code must be text.' };
  const c = code.trim();
  if (c.length > MAX_GRID_CODE_CHARS) return { error: 'malformed', detail: 'The code is too long.' };
  const m = /^GRID1\.([A-Za-z0-9_-]{1,32})\.([0-9a-f]{8})\.(CB1\.[A-Za-z0-9_-]+\.[0-9a-f]{8})\.([0-9a-f]{8})$/.exec(c);
  if (!m) return { error: 'malformed', detail: 'Not a GRID1 solution code (expected GRID1.<level>.<hash>.<design>.<check>).' };
  const body = c.slice(0, c.length - 9);
  if (hex8(crc32(body)) !== m[4]) return { error: 'crc', detail: 'The code does not match its checksum: it was mistyped or altered.' };
  return { levelId: m[1]!, levelHash: m[2]!, cb1: m[3]! };
}

export function makeGridVerifier(def: GameDef<GridState>): GridVerifier {
  // The same game with richer level scores; the engine, rules and ruleset id are untouched.
  const scored: GameDef<GridState> = {
    ...def,
    metrics: (s) => ({ ticks: s.tick - s.levelStart, cost: s.metrics.cost, capex: s.metrics.capex, opex: s.metrics.opex, ensMWh: s.metrics.ensMWh, lossesMWh: s.metrics.lossesMWh, stars: s.stars }),
  };
  const core = makeVerifier(scored);
  const hashes = new Map<string, string | null>();

  /** Hash of a level's initial state (its setup, rules, budget, grid) plus the ruleset: any change makes old codes stale. */
  const levelHash = (levelId: string, region = 'global'): string | null => {
    const key = region + '|' + levelId;
    if (hashes.has(key)) return hashes.get(key)!;
    let h: string | null = null;
    try {
      if ((def.levels ?? []).some((l) => l.id === levelId)) {
        const e = new Engine(def, { storage: new MemoryKV() });
        e.autosave = false;
        if (e.regions.has(region)) {
          const r = e.act('startLevel', [levelId, 1, def.modes?.[0], region]);
          if (r.ok) h = hashOf([levelId, e.rulesetFor(region), def.rulesetVersion ?? 0, e.state]).slice(0, 8);
        }
      }
    } catch { h = null; }
    hashes.set(key, h);
    return h;
  };

  const wrap = (levelId: string, cb1Code: string, region?: string): string | null => {
    const h = levelHash(levelId, region); if (h === null || !/^[A-Za-z0-9_-]{1,32}$/.test(levelId)) return null;
    const body = `${CODE_PREFIX}.${levelId}.${h}.${cb1Code}`;
    return body + '.' + hex8(crc32(body));
  };

  const verify = (levelId: string, solutionCode: string, opts: VerifyOpts = {}): GridVerifyResult => {
    const fail = (error: VerifyError, detail: string): VerifyFail => ({ ok: false, error, detail });
    try {
      const p = parseGridCode(solutionCode);
      if ('error' in p) return fail(p.error, p.detail);
      if (typeof levelId !== 'string' || !(def.levels ?? []).some((l) => l.id === levelId)) return fail('unknown-level', `Unknown level '${String(levelId).slice(0, 40)}'.`);
      if (p.levelId !== levelId) return fail('malformed', `This code is for level '${p.levelId}', not '${levelId}'.`);
      const cur = levelHash(levelId, opts.region);
      if (cur === null) return fail('unknown-level', `Level '${levelId}' cannot be started in region '${opts.region ?? 'global'}'.`);
      if (p.levelHash !== cur) return fail('stale-level', `This design was made for an older version of ${levelId}.`);
      const r = core(levelId, p.cb1, opts);
      if (r.ok) {
        const stars = r.metrics.stars as 0 | 1 | 2 | 3;
        return { ok: true, metrics: r.metrics, stars, rulesetId: r.ruleset, levelHash: cur, ticks: r.ticks };
      }
      const why = r.reason;
      if (/Ruleset mismatch|Region mismatch|Unknown region|Unreadable ruleset/.test(why)) return fail('ruleset-mismatch', why);
      if (/Tick budget/.test(why)) return fail('budget', why);
      if (/not won/.test(why)) return fail('did-not-finish', why);
      if (/rejected|crashed|not allowed|Cannot start/.test(why)) return fail('illegal-action', why);
      if (/checksum/.test(why)) return fail('crc', why);
      return fail('malformed', why);
    } catch (e) {
      if (opts.budget) throw e;   // the server's own budget error must reach the server
      return fail('malformed', 'The code could not be read: ' + String((e as Error)?.message ?? e).slice(0, 120));
    }
  };
  return Object.assign(verify, { levelHash, wrap });
}
