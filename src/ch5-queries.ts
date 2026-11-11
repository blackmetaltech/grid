// Chapter 5 read-only query for the Godot control card (godot/ui/ch5/ch5_panel.gd): what each level's instrument draws, as plain numbers. Godot only formats them.
//   L14/L15/L17/L18  the watched buses in pu and kV against the band, the day's extremes and the tap/switching counts
//   L16              every line's loading now and the worst loading after the outage of each line (the N-1 table)
//   L17              the P-V curve of the city bus (upper branch up to the nose), the operating point, the nose and the margin
//   L18              the textbook 3-bus case solved by Gauss-Seidel sweep by sweep next to Newton (the iteration table of the Codex lab)
import { dmath } from '@core/numerics';
import type { QueryFn } from '@core/kit';
import type { GridState } from './types';
import { resolveThresholds } from './level/spec';
import { specOf } from './level';
import { buildCases, solveGS, solveCase, tryLambda } from './sim/loadflow';
import { threeBusSaadat } from './sim/loadflow/fixtures';
import { examTruth, loadability, n1Table } from './sim/ch5';
import { l15NoLoad } from './level/ch5lessons';
import { BASE, EXTRA } from './level/levels/l18';
import { toNet } from './sim/netbuild';
import { solvedOf } from './sim/solved';
import type { SimParams } from './sim/params';

const LEVELS = ['L14', 'L15', 'L16', 'L17', 'L18'];
const WATCH: Record<string, string[]> = { L14: ['B2', 'B3', 'B4', 'B5', 'B6'], L15: ['B1', 'B2'], L17: ['B1', 'B2', 'B3'], L18: ['B1', 'B2', 'B3'] };
const r4 = (x: number): number => Math.round(x * 1e4) / 1e4;

/** The upper branch of the P-V curve of the load bus `busId` (loads scaled, generation held), 28 points up to just under the nose. */
export function pvCurve(s: GridState, busId: string): { points: { pMW: number; v: number }[]; noseMW: number; noseV: number; loadMW: number; marginPct: number } | null {
  const net = toNet({ ...s, loads: s.loads.map((l) => ({ ...l, shedFrac: 0 })) });
  const cases = buildCases(net).cases.filter((x) => x.c.indexOf.has(busId));
  const c = cases[0]?.c;
  if (!c) return null;
  const i = c.indexOf.get(busId)!, p0 = (c.base.lp[i]![0] + c.base.lp[i]![1] + c.base.lp[i]![2]) * 100;
  const lam = loadability(net);
  const points: { pMW: number; v: number }[] = [];
  let warm: { V: number[]; th: number[] } | null = null;
  const N = 28;
  for (let k = 0; k <= N; k++) {
    const x = lam * (1 - dmath.pow(1 - k / N, 2.2)) * 0.9995;   // denser near the nose, where the curve bends
    const r = tryLambda(c, x, warm, true, undefined, 1);
    if (!r.converged) continue;
    warm = { V: r.V, th: r.th }; points.push({ pMW: r4(x * p0), v: r4(r.V[i]!) });
  }
  const last = points[points.length - 1];
  return { points, noseMW: r4(lam * p0), noseV: last?.v ?? 0, loadMW: r4(p0), marginPct: r4(100 * (lam - 1)) };
}

/** Gauss-Seidel against Newton on the textbook 3-bus data (PS-14/15/16): |V2| and the largest power mismatch after each GS sweep, and the counts. */
export function gsLab(): { sweeps: { k: number; v2: number; mismatch: number }[]; gsIterations: number; nrIterations: number; truth: Record<string, number> } {
  const c = buildCases(threeBusSaadat()).cases[0]!.c;
  const sweeps: { k: number; v2: number; mismatch: number }[] = [];
  for (let k = 0; k <= 16; k++) { const r = solveGS(c, { maxIter: k, tol: 0 }); sweeps.push({ k, v2: r.V[1]!, mismatch: r.mismatch }); }
  const g = solveGS(c, { tol: 1e-6 }), n = solveCase(c, {});
  return { sweeps, gsIterations: g.iterations, nrIterations: n.iterations, truth: examTruth() };
}

export function buildCh5Queries(d: { getParams: (s: GridState) => SimParams }): Record<string, QueryFn<GridState>> {
  return {
    ch5Panel: (s) => {
      const lv = s.level ?? '';
      if (!LEVELS.includes(lv)) return { active: false };
      const spec = specOf(lv), th = spec ? resolveThresholds(spec, d.getParams(s), s.mode) : {};
      const sol = new Map((s.solution?.buses ?? []).map((b) => [b.id, b.vPu]));
      const buses = (WATCH[lv] ?? []).flatMap((id) => { const b = s.buses.find((x) => x.id === id); let v = sol.get(id); let given = false; if (v === undefined && lv === 'L18' && b?.kind === 'gen' && b.vSet !== null) { v = b.vSet; given = true; } return b ? [{ id, name: b.name, kv: b.kvNom, pu: v === undefined ? null : r4(v), kV: v === undefined ? null : r4(v * b.kvNom), given }] : []; });
      const tr = s.metrics.track;
      const out: Record<string, unknown> = { active: true, level: lv, buses, lo: th.vLo ?? th.v2Min ?? null, hi: th.vHi ?? null, track: { ...tr }, tick: s.tick - s.levelStart };
      if (lv === 'L16') {
        const solved = solvedOf(s), tab = s.tick > s.levelStart ? n1Table(s) : {};
        out.lines = s.branches.map((b) => ({ id: b.id, from: b.from, to: b.to, inService: b.inService, ratingMVA: b.ratingMVA, loadingPct: Math.round(100 * (solved?.flows.branch[b.id]?.loading ?? 0)), n1Pct: tab[b.id] === undefined ? null : Math.round(100 * Math.min(tab[b.id]!, 9.99)) }));
      }
      if (lv === 'L15') out.noLoad = l15NoLoad(s);
      if (lv === 'L17' && s.solution) out.pv = pvCurve(s, 'B3');
      if (lv === 'L18') { out.givens = { lines: s.branches.map((b) => ({ id: b.id, from: b.from, to: b.to, r: r4(b.r), x: r4(b.x) })), slackV: s.buses[0]?.vSet ?? null, pvV: s.buses[2]?.vSet ?? null, pvP: 200, qMax: s.units[1] ? Math.round(s.units[1].qMax) : 0, loadP: BASE.p / 100, loadQ: BASE.q / 100, extraP: EXTRA.p / 100, extraQ: EXTRA.q / 100 }; out.gs = gsLab(); const u = s.units[1]; out.pv3 = u ? { q: r4(u.Q), qMax: r4(u.qMax), vSet: s.buses.find((b) => b.id === 'B3')?.vSet ?? null } : null; }
      return out;
    },
  };
}
