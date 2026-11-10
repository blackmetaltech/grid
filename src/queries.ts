// Read-only queries (DESIGN 8.5). They never mutate the state and return plain JSON with finite numbers. Derived data (flows,
// overlays) is recomputed here, memoised outside the state by `solvedOf`.
import type { QueryFn } from '@core/kit';
import { BLOCKS_PER_DAY, type GridState } from './types';
import { t } from './i18n';
import { solvedOf, toMW } from './sim/solved';
import { voltageBand, type SimParams } from './sim/params';
import { fin } from './sim/finite';

const COUNT_KEYS = ['buses', 'branches', 'units', 'loads', 'shunts', 'storage'] as const;
const NONE = { error: true as const };

export interface QueryDeps { getParams: (s: GridState) => SimParams }

const r3 = (x: number): number => Math.round(fin(x) * 1000) / 1000;
const text = (n: { key: string; params: Record<string, string | number> }): { key: string; params: Record<string, string | number>; message: string } => ({ ...n, message: t(n.key, n.params) });

export function buildQueries(d: QueryDeps): Record<string, QueryFn<GridState>> {
  const solved = (s: Readonly<GridState>) => solvedOf(s as GridState);
  return {
    /** The simulation clock; the HUD formats hh:mm from `block` (15 minutes each). */
    clock: (s) => ({ day: s.clock.day, block: s.clock.block, minuteOfDay: s.clock.block * 15, hour: Math.floor(s.clock.block / 4), minute: (s.clock.block % 4) * 15, phase: s.clock.phase, speed: s.clock.speed, blocksPerDay: BLOCKS_PER_DAY, tick: s.tick }),
    /** Counts of what has been built, the region id and the mode. */
    summary: (s) => ({ region: s.region, mode: s.mode, counts: Object.fromEntries(COUNT_KEYS.map((k) => [k, s[k].length])) as Record<(typeof COUNT_KEYS)[number], number> }),

    /** One-screen state of the last block: demand, generation, losses, frequency, worst voltage and loading, margin. */
    solutionSummary: (s) => {
      if (!s.solution) return { ready: false, message: t('q.noSolution') };
      const b = s.block;
      return {
        ready: true, converged: s.solution.converged, iterations: s.solution.iterations, lambdaStar: s.solution.lambdaStar === null ? null : r3(s.solution.lambdaStar),
        demandMW: r3(b.demandMW), genMW: r3(b.genMW), lossMW: r3(b.lossMW), ensMW: r3(b.ensMW), shortfallMW: r3(b.shortfallMW), curtailedMW: r3(b.curtailedMW),
        reserveMW: r3(b.reserveMW), marginPct: r3(b.marginPct), fHz: r3(s.freq.fHz), worstVPu: r3(b.worstVPu), worstLoading: r3(b.worstLoading), blackout: b.blackout, lambda: r3(s.dispatch.lambda),
      };
    },
    /** What needs the operator now, as teaching messages. */
    needsYouNow: (s) => s.block.needs.map(text),
    busInfo: (s, id: unknown) => {
      const b = s.buses.find((x) => x.id === id); if (!b) return NONE;
      const sol = s.solution?.buses.find((x) => x.id === b.id);
      const [lo, hi] = voltageBand(d.getParams(s as GridState), b.kvNom, s.mode);
      return { ...b, vPu: sol ? r3(sol.vPu) : null, thetaDeg: sol ? r3((sol.thetaRad * 180) / Math.PI) : null, energised: !!sol, bandLo: r3(lo), bandHi: r3(hi), loadMW: r3(s.loads.filter((l) => l.bus === b.id).reduce((a, l) => a + l.P * (1 - l.shedFrac), 0)), genMW: r3(s.units.filter((u) => u.bus === b.id).reduce((a, u) => a + u.P, 0)) };
    },
    branchInfo: (s, id: unknown) => {
      const b = s.branches.find((x) => x.id === id); if (!b) return NONE;
      const f = solved(s)?.flows.branch[b.id];
      return { ...b, loading: f ? r3(f.loading) : 0, pFromMW: f ? r3(toMW(f.pFrom)) : 0, qFromMVAr: f ? r3(toMW(f.qFrom)) : 0, lossMW: f ? r3(toMW(f.lossP)) : 0, currentKA: f ? r3(f.iKA) : 0 };
    },
    unitInfo: (s, id: unknown) => {
      const u = s.units.find((x) => x.id === id); if (!u) return NONE;
      return { ...u, loadingPct: u.pMax > 0 ? r3((u.P / u.pMax) * 100) : 0 };
    },
    /** Per-element colour values: kind 'voltage' (pu per bus) or 'loading' (fraction per branch). */
    overlay: (s, kind: unknown) => {
      if (kind === 'voltage') return { kind, values: Object.fromEntries((s.solution?.buses ?? []).map((b) => [b.id, r3(b.vPu)])) };
      if (kind === 'loading') { const fl = solved(s)?.flows.branch ?? {}; return { kind, values: Object.fromEntries(s.branches.map((b) => [b.id, r3(fl[b.id]?.loading ?? 0)])) }; }
      return NONE;
    },
    /** The history ring as columns (cheap for charts). */
    timeline: (s) => ({ day: s.history.entries.map((e) => e.day), block: s.history.entries.map((e) => e.block), demandMW: s.history.entries.map((e) => r3(e.demandMW)), fHz: s.history.entries.map((e) => r3(e.fHz)), worstVPu: s.history.entries.map((e) => r3(e.worstVPu)), cost: s.history.entries.map((e) => r3(e.cost)) }),
    /** The last event window: frequency and angle traces (decimated) and the discrete marks as messages. */
    replay: (s) => (s.replay ? { ...s.replay, marks: s.replay.marks.map((m) => ({ ...m, message: t(m.causeKey, { id: m.element, bus: m.element }) })) } : null),
    /** Why did it go wrong: the event log, newest first. */
    whyCard: (s) => {
      if (s.events.log.length === 0) return { empty: true, message: t('q.noWhy'), entries: [] };
      return { empty: false, message: '', entries: s.events.log.slice().reverse().slice(0, 20).map((e) => ({ day: e.day, block: e.block, tS: e.tS, element: e.element, key: e.causeKey, message: t(e.causeKey, { id: e.element, bus: e.element }) })) };
    },
    costBreakdown: (s) => ({ cost: r3(s.metrics.cost), opex: r3(s.metrics.opex), capex: r3(s.metrics.capex), ensMWh: r3(s.metrics.ensMWh), lossesMWh: r3(s.metrics.lossesMWh), co2t: r3(s.metrics.co2t), budgetSpent: r3(s.budget.spent), lastBlock: r3(s.block.costBlock) }),
    stars: (s) => ({ stars: s.stars, verdict: s.block.verdict }),
    codexStatus: (s) => ({ unlocked: [...s.codexUnlocked] }),
    actionLog: (s) => s.actionLog.map((a) => ({ tick: a.tick, name: a.name, key: a.key })),
  };
}
