// Read-only queries for the GRID front-end drawers (M2.4): the build palette of the running level, the phasor of a bus or branch,
// the frequency dial's numbers and the result card's histogram. The Godot side draws what these return and nothing else, so the
// phasor-truth and dial-truth tests compare the drawn geometry with these values.
import type { QueryFn } from '@core/kit';
import type { GridState } from './types';
import { solvedOf, toMW } from './sim/solved';
import type { SimParams } from './sim/params';
import { fin } from './sim/finite';
import { t } from './i18n';
import type { GridLevelSpec } from './level/spec';
import { botPopulation, resultHistogram, type BotPopulation } from './level/population';

const r3 = (x: number): number => Math.round(fin(x) * 1000) / 1000;
const DEG = 180 / Math.PI;
const NONE = { error: true as const };

export interface UiDeps { specOf: (id: string) => GridLevelSpec | undefined; getParams: (s: GridState) => SimParams }

/** Bot populations are exhaustive engine runs (seconds): memoised per level and region, outside any state. */
const BOT_CACHE = new Map<string, BotPopulation>();
export function cachedBot(spec: GridLevelSpec, region: string): BotPopulation {
  const k = `${spec.id}/${region}`;
  let b = BOT_CACHE.get(k);
  if (!b) { b = botPopulation(spec, region); BOT_CACHE.set(k, b); }
  return b;
}

/** Phasor of a complex power: current lags voltage by phi = atan2(Q, P) (Q > 0 = inductive load = lagging), so I sits at theta_V - phi. */
export function phasorOf(vPu: number, vKV: number, thetaVDeg: number, pMW: number, qMVAr: number, iKA: number, iRefKA: number): Record<string, number | string> {
  const sMVA = Math.hypot(pMW, qMVAr);
  const phiDeg = sMVA > 1e-9 ? Math.atan2(qMVAr, pMW) * DEG : 0;
  const pf = sMVA > 1e-9 ? pMW / sMVA : 1;
  return {
    vPu: r3(vPu), vKV: r3(vKV), vAngDeg: r3(thetaVDeg), iKA: r3(iKA), iRefKA: r3(iRefKA), iAngDeg: r3(thetaVDeg - phiDeg), phiDeg: r3(phiDeg),
    pMW: r3(pMW), qMVAr: r3(qMVAr), sMVA: r3(sMVA), pf: r3(pf), lead: Math.abs(phiDeg) < 0.5 ? 'unity' : phiDeg > 0 ? 'lagging' : 'leading',
  };
}

export function buildUiQueries(d: UiDeps): Record<string, QueryFn<GridState>> {
  const solved = (s: Readonly<GridState>) => solvedOf(s as GridState);
  return {
    /** What the Build drawer offers: the running level's allowed actions and, per action, the catalogue ids / sizes it accepts. Free play: every action, no part limit. */
    palette: (s) => {
      const spec = s.level ? d.specOf(s.level) : undefined;
      if (!spec) return { active: false, actions: [] };
      return { active: true, level: spec.id, actions: spec.allowed.actions.filter((a) => a !== 'setSpeed' && a !== 'predict').map((a) => ({ action: a, parts: [...(spec.allowed.parts[a] ?? [])] })) };
    },
    /** Phasor diagram of a bus (its load current) or a branch (the from-end current): V, I, S = P + jQ, pf and the lagging/leading word. */
    phasor: (s, kind: unknown, id: unknown) => {
      const sv = solved(s); if (!sv) return NONE;
      if (kind === 'branch') {
        const b = s.branches.find((x) => x.id === id), f = sv.flows.branch[String(id)];
        if (!b || !f) return NONE;
        const from = s.buses.find((x) => x.id === b.from), sol = s.solution?.buses.find((x) => x.id === b.from);
        if (!from || !sol) return NONE;
        const iRef = f.loading > 1e-9 ? f.iKA / f.loading : 0;
        return { kind, id, ...phasorOf(sol.vPu, sol.vPu * from.kvNom, (sol.thetaRad * 180) / Math.PI, toMW(f.pFrom), toMW(f.qFrom), f.iKA, iRef) };
      }
      if (kind === 'bus') {
        const b = s.buses.find((x) => x.id === id), bal = sv.flows.bus[String(id)], sol = s.solution?.buses.find((x) => x.id === id);
        if (!b || !bal || !sol) return NONE;
        const pMW = toMW(bal.pLoad), qMVAr = toMW(bal.qLoad), sMVA = Math.hypot(pMW, qMVAr);
        const iKA = sol.vPu > 1e-9 ? sMVA / (Math.sqrt(3) * sol.vPu * b.kvNom) : 0;
        // a bus has no rating: its reference current is the peak demand of its loads at pf 0.9 and nominal voltage
        const peak = s.loads.filter((l) => l.bus === b.id).reduce((a, l) => a + l.Ppeak, 0);
        const iRef = peak > 0 ? peak / 0.9 / (Math.sqrt(3) * b.kvNom) : 0;
        return { kind, id, ...phasorOf(sol.vPu, sol.vPu * b.kvNom, (sol.thetaRad * 180) / Math.PI, pMW, qMVAr, iKA, iRef) };
      }
      return NONE;
    },
    /** The frequency dial's inputs: f, RoCoF, the pack's centre and standard range, the UFLS stage frequencies and the generator trip limits. */
    dial: (s) => {
      const p = d.getParams(s), g = p.gridcode;
      return { fHz: r3(s.freq.fHz), rocof: r3(s.freq.rocof), f0: p.f0, stdLo: g.standardRangeHz[0], stdHi: g.standardRangeHz[1], uflsHz: g.ufls.map((u) => u.hz), genUfHz: g.genUf.hz, genOfHz: g.genOf.hz, blackout: s.block.blackout };
    },
    /** The result card: where this design sits in the histogram. Source is 'bot' (labelKey hist.bot, "Bot population (offline estimate)") until 20 verified players exist; no player data is offline. */
    resultCard: (s) => {
      const spec = s.level ? d.specOf(s.level) : undefined;
      if (!spec || !spec.histogram) return { active: false };
      const bot = cachedBot(spec, s.region);
      const mine = spec.histogram === 'lossPct' ? (s.metrics.track.lossPct ?? null) : s.budget.spent;
      const h = resultHistogram(bot, [], mine, 10);
      const fz = spec.frozen ? spec.frozen[s.region] ?? null : null;
      return { active: true, level: spec.id, source: h.source, labelKey: h.labelKey, label: h.labelKey ? t(h.labelKey) : '', metricKey: h.metricKey, metric: t(h.metricKey), histogram: spec.histogram, bins: h.bins.map((b) => ({ from: r3(b.from), to: r3(b.to), count: b.count })), n: h.n, percentile: h.percentile === null ? null : r3(h.percentile), mine: mine === null ? null : r3(mine), starA: fz ? fz.starA : null, starB: fz ? fz.starB : null, stars: s.stars, status: s.status };
    },
  };
}
