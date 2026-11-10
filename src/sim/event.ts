// The event clock (DESIGN 8.3 step 10) and the level verdict. `runEventWindow` is pure: it returns a NEW state and never mutates
// its input. It runs the cascade (trips, islands, load flow, overload and voltage timers), then the frequency window (governors,
// UFLS, generator trips) for what the cascade left, and folds the result back into a state: element status, shed loads, frequency
// extremes, the replay log, the event log.
import { runCascade, emptyCascadeState } from './thermal';
import { runFrequencyWindow, type FreqUnit, type FreqBess } from './dynamics';
import type { GovKind } from './dynamics';
import { S_BASE_MVA } from './network';
import { remember, toResult } from './solved';
import { SYNC_KINDS, toNet } from './netbuild';
import type { SimParams } from './params';
import { fin } from './finite';
import type { GridState, ReplayLog, Rules, Unit } from '../types';

export interface EventTrigger {
  /** Branch and unit ids opened at t = 0. */
  trips: string[];
  /** Locale key of the cause shown for each initial trip (default 'cascade.initial-trip'). */
  causeKey?: string;
}
export interface EventWindowResult {
  state: GridState;
  outcome: 'stable' | 'dark' | 'horizon' | 'event-limit';
  /** Generation lost and load lost in the window, MW. */
  lostGenMW: number; lostLoadMW: number;
  /** True when a frequency window ran. */
  frequencyRan: boolean;
}

const govKind = (u: Unit): GovKind => (u.kind === 'coal' || u.kind === 'biomass' || u.kind === 'nuclear' ? 'steam' : u.kind === 'gas' ? 'gas' : u.kind === 'hydro' ? 'hydro' : 'none');
const MAX_TRACE_SAMPLES = 1500;
/** Replay cause key per frequency-window event kind. */
const FREQ_CAUSE: Record<string, string> = {
  ufls_pickup: 'freq.ufls_pickup', ufls_shed: 'freq.ufls_shed', psp_disconnect: 'freq.psp_disconnect', bess_charge_disconnect: 'freq.bess_charge_disconnect',
  gen_uf_trip: 'freq.gen_uf_trip', gen_of_trip: 'freq.gen_of_trip', der_rocof_trip: 'freq.der_rocof_trip', blackout: 'freq.blackout',
};

export function runEventWindow(input: Readonly<GridState>, params: SimParams, trigger: EventTrigger): EventWindowResult {
  const s: GridState = structuredClone(input) as GridState;
  const net0 = toNet(s);
  const eff0 = new Map(s.loads.map((l) => [l.id, l.P * (1 - l.shedFrac)]));
  const xfmr: Record<string, 'xfmr'> = {};
  for (const b of s.branches) if (b.kind === 'xfmr') xfmr[b.id] = 'xfmr';
  const casc = runCascade(net0, emptyCascadeState(), { trips: trigger.trips, kinds: xfmr, solve: { qLimits: true } });

  // ---- fold the cascade into the state
  const opened = new Set(casc.tripped);
  for (const b of s.branches) { const nb = casc.net.branches.find((x) => x.id === b.id); if (nb && b.inService && !nb.inService) { b.inService = false; b.timer = null; } }
  const energised = casc.solution.energised;
  let lostGenMW = 0;
  const lostUnit = (u: Unit, why: 'trip' | 'island'): void => {
    if (!u.online) return;
    lostGenMW += u.P; u.online = false; u.P = 0; u.Q = 0; u.Pset = 0; u.headroom = 0;
    if (SYNC_KINDS.has(u.kind)) { u.commit.minDownLeft = why === 'trip' ? u.minDownBlocks : 0; u.commit.startLeft = 0; }
  };
  for (const u of s.units) { if (opened.has(u.id)) lostUnit(u, 'trip'); else if (u.online && energised[u.bus] === false) lostUnit(u, 'island'); }
  for (const b of s.storage) if (energised[b.bus] === false) b.P = 0;
  // loads: the cascade's own scaling (under-voltage trips, collapse sheds) and dark islands
  let lostLoadMW = 0;
  for (const l of s.loads) {
    const before = eff0.get(l.id) ?? 0;
    const nl = casc.net.loads.find((x) => x.id === l.id);
    const after = energised[l.bus] === false ? 0 : (nl ? nl.p * S_BASE_MVA : before);
    if (before > 1e-12 && after < before - 1e-12) {
      lostLoadMW += before - after;
      if (energised[l.bus] !== false) l.shedFrac = Math.min(1, 1 - (1 - l.shedFrac) * (after / before));
    }
  }
  s.solution = toResult(casc.solution);
  remember(s.solution, { net: casc.net, sol: casc.solution, flows: casc.flows });

  // ---- frequency window
  const imbalance = lostGenMW - lostLoadMW;
  const survivors = s.units.filter((u) => u.online && SYNC_KINDS.has(u.kind));
  const fu: FreqUnit[] = survivors.map((u) => ({ id: u.id, kind: govKind(u), S: u.mva, H: u.H, ...(u.droopPct > 0 ? { R: u.droopPct / 100 } : {}), P0: u.P, Pmin: u.pMin, Pmax: u.pMax }));
  const fb: FreqBess[] = s.storage.filter((b) => b.mw > 0 && energised[b.bus] !== false).map((b) => ({ id: b.id, ratedMW: b.mw, mode: 'following', energyMWh: Math.max(0, (b.soc - 0.1) * b.mwh) }));
  const loadMW = s.loads.reduce((a, l) => a + (energised[l.bus] === false ? 0 : l.P * (1 - l.shedFrac)), 0) + lostLoadMW;
  let frequencyRan = false;
  const marks: ReplayLog['marks'] = casc.replay.map((r) => ({ tS: r.tS, element: r.element, causeKey: r.cause.key }));
  let fMilli: number[] = [], deltaDeci: number[] = [], dtS = 0.02;
  if (Math.abs(imbalance) > 1e-6 * Math.max(1, loadMW) && fu.length > 0) {
    const fr = runFrequencyWindow({
      f0: params.f0, units: fu, bess: fb, loadMW: Math.max(loadMW, 1e-3), disturbanceMW: imbalance,
      gridCode: { deadbandHz: params.gridcode.deadbandHz, ufls: params.gridcode.ufls, genUf: params.gridcode.genUf, genOf: params.gridcode.genOf },
    });
    frequencyRan = true;
    if (fr.ok) {
      for (const tr of fr.unitTrips) { const u = s.units.find((x) => x.id === tr.id); if (u) lostUnit(u, 'trip'); }
      for (const ev of fr.events) {
        marks.push({ tS: ev.t, element: ev.element, causeKey: FREQ_CAUSE[ev.kind] ?? 'freq.blackout' });
        if (ev.kind === 'ufls_shed') { const i = Number(ev.element.replace('ufls', '')) - 1; if (s.protection.ufls[i]) s.protection.ufls[i]!.operated = true; }
      }
      if (fr.shedMW > 0) {
        const eligible = s.loads.filter((l) => l.priority === null && l.class !== 'critical' && energised[l.bus] !== false);
        const pool = eligible.length > 0 ? eligible : s.loads.filter((l) => energised[l.bus] !== false);
        const tot = pool.reduce((a, l) => a + l.P * (1 - l.shedFrac), 0);
        if (tot > 0) for (const l of pool) l.shedFrac = Math.min(1, l.shedFrac + ((fr.shedMW / tot) * (1 - l.shedFrac)));
      }
      s.freq = { fHz: fin(fr.fEndHz, params.f0), rocof: fin(fr.rocof0) };
      s.metrics.nadirHz = Math.min(s.metrics.nadirHz, fin(fr.nadirHz, params.f0));
      s.metrics.maxRocof = Math.max(s.metrics.maxRocof, fin(fr.maxRocof500));
      // trace: decimated to fit; angle = integral of 360 deg x df
      const stride = Math.max(1, Math.ceil(fr.trace.fHz.length / MAX_TRACE_SAMPLES));
      const t = fr.trace.t;
      dtS = t.length > 1 ? Math.round((t[1]! - t[0]!) * stride * 1000) / 1000 : 0.02;
      let ang = 0;
      for (let i = 0; i < fr.trace.fHz.length; i++) {
        if (i > 0) ang += 360 * (fr.trace.fHz[i]! - params.f0) * (t[i]! - t[i - 1]!);
        if (i % stride === 0) { fMilli.push(Math.round((fr.trace.fHz[i]! - params.f0) * 1000)); deltaDeci.push(Math.round(ang * 10)); }
      }
    } else {
      s.freq = { fHz: 0, rocof: 0 }; s.metrics.nadirHz = 0;
      marks.push({ tS: 0, element: 'system', causeKey: 'freq.blackout' });
    }
  }
  marks.sort((a, b) => a.tS - b.tS);
  s.replay = { startDay: s.clock.day, startBlock: s.clock.block, dtS, fMilliHz: fMilli, deltaDeciDeg: deltaDeci, marks };
  for (const m of marks) s.events.log.push({ day: s.clock.day, block: s.clock.block, tS: m.tS, element: m.element, causeKey: m.causeKey });
  if (s.events.log.length > 200) s.events.log.splice(0, s.events.log.length - 200);
  return { state: s, outcome: casc.outcome, lostGenMW, lostLoadMW, frequencyRan };
}

// ------------------------------------------------------------------------------------------------------------------------------

export interface LevelResult { status: 'playing' | 'won' | 'lost'; /** locale key of the reason, null while playing */ key: string | null; params: Record<string, string | number>; stars: 0 | 1 | 2 | 3 }

/** The verdict of the running level against its rules after `ticksUsed` blocks; pure. Free play (no level, or rules all null) never ends. */
export function levelResult(s: Readonly<GridState>, rules: Readonly<Rules>, ticksUsed: number): LevelResult {
  const lost = (key: string, params: Record<string, string | number> = {}): LevelResult => ({ status: 'lost', key, params, stars: 0 });
  const m = s.metrics;
  if (s.budget.capexLimit > 0 && s.budget.spent > s.budget.capexLimit + 1e-9) return lost('level.lost.budget', { spent: Math.round(s.budget.spent), max: Math.round(s.budget.capexLimit) });
  if (rules.blackoutLoses && s.block.blackout) return lost('level.lost.blackout');
  if (rules.maxEnsMWh !== null && m.ensMWh > rules.maxEnsMWh) return lost('level.lost.ens', { ens: Math.round(m.ensMWh * 10) / 10, max: rules.maxEnsMWh });
  if (rules.maxCost !== null && m.cost > rules.maxCost) return lost('level.lost.cost', { cost: Math.round(m.cost), max: rules.maxCost });
  if (rules.minNadirHz !== null && m.nadirHz < rules.minNadirHz) return lost('level.lost.nadir', { nadir: Math.round(m.nadirHz * 100) / 100, min: rules.minNadirHz });
  if (rules.maxPoorSupplyMin !== null && m.poorSupplyMin > rules.maxPoorSupplyMin) return lost('level.lost.poorSupply', { min: m.poorSupplyMin, max: rules.maxPoorSupplyMin });
  if (rules.horizonBlocks !== null && ticksUsed >= rules.horizonBlocks) {
    let stars: 1 | 2 | 3 = 1;
    if (rules.starCost) {
      const c = rules.starBasis === 'capex' ? s.budget.spent : m.cost;
      const extra = rules.star3.every((r) => { const v = m.track[r.key]; return v !== undefined && (r.min === null || v >= r.min - 1e-12) && (r.max === null || v <= r.max + 1e-12); });
      if (c <= rules.starCost[0] + 1e-6) stars = 2;
      if (c <= rules.starCost[1] + 1e-6 && m.ensMWh === 0 && extra) stars = 3;
    }
    return { status: 'won', key: 'level.won', params: { stars }, stars };
  }
  return { status: 'playing', key: null, params: {}, stars: 0 };
}
