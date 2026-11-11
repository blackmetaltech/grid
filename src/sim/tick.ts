// The systems pipeline (DESIGN 8.3), one operator block per core tick, in the design's order. Each system draws randomness from its
// OWN stream, `systemRng(seed, day, block, systemId)`, never from the shared core stream, so inserting a system or drawing one more
// number elsewhere never reshuffles another system. Region data arrives as plain `SimParams` through `getParams(state)`.
import { log, type System } from '@core/kit';
import { dmath } from '@core/numerics';
import { BLOCKS_PER_DAY, type BlockSummary, type CloudBlob, type GridState, type LoadClass, type Note, type Unit } from '../types';
import { t } from '../i18n';
import { S_BASE_MVA, cmpId } from './network';
import { type DemandClass, demandPQ, generateClouds, advectClouds, transmittance, windPower, pvPlantOutput } from './weather';
import { priorityList, neededSet, economicDispatch, storageStep, thresholdRequest, blockCost, type CommitUnit, type EdUnit, type StorageParams } from './dispatch';
import { blockFrequency, type BlockUnit } from './dynamics';
import { stepOverload, remainingS, type OverloadState } from './thermal';
import { isDispatchable, RENEWABLE_KINDS, toNet } from './netbuild';
import { solveState, remember, solvedOf, toResult } from './solved';
import { runEventWindow, levelResult } from './event';
import { voltageBand, type SimParams } from './params';
import { systemRng } from './rngs';
import { fin } from './finite';
import { stepBench, type BenchParams } from '../level/bench';
import { ch3Step } from './ch3/systems';
import { ch4Step } from './ch4/systems';
import { ch7Step } from './ch7/study';
import { flashoverStep, saltFlashoverStep, anchorCutStep } from './flashover';
import { freqBlockTrack } from './freqtrack';
import { ch5Track } from './ch5';
import { finaleWeather, finaleTrack, finaleScale } from './finale';
import { SOC_MAX, heldByStorage, settleIslandStorage, windowShare } from './islandStorage';

export const BLOCK_H = 0.25;
/** Blocks a reactor breaker rests after switching (45 minutes). */
export const REACTOR_DWELL = 3;
export const BLOCK_S = 900;
/** A scripted load surge lasts this many blocks. */
export const SURGE_BLOCKS = 4;
/** Day of the year of game day 0 (spring equinox: day length ~12 h at every latitude). */
export const START_DOY = 80;
/** Capex is amortised over 20 years of blocks for the cost metric. */
export const AMORT_BLOCKS = 20 * 365 * BLOCKS_PER_DAY;
const MEAN_WIND_MS = 7, WIND_SIGMA = 1.5, WIND_PHI = 0.97, STORM_WIND_MS = 26;

const DEMAND_CLASS: Record<LoadClass, DemandClass> = { residential: 'residential', commercial: 'commercial', industrial: 'industrial', agricultural: 'irrigation', critical: 'city' };

export function emptyBlock(prev?: Pick<BlockSummary, 'lossMW'>): BlockSummary {
  return {
    demandMW: 0, genMW: 0, lossMW: prev?.lossMW ?? 0, ensMW: 0, shortfallMW: 0, curtailedMW: 0, imbalanceMW: 0, reserveMW: 0, marginPct: 0,
    worstVPu: 1, worstLoading: 0, costBlock: 0, starts: 0, startCostBlock: 0, eventWindow: false, trips: [], blackout: false, verdict: 'playing', verdictKey: null, verdictParams: {}, needs: [],
  };
}

const note = (key: string, params: Note['params'] = {}): Note => ({ key, params });
const dayIndex = (s: GridState): number => s.clock.day * BLOCKS_PER_DAY + s.clock.block;
const eventStart = (e: { day: number; block: number }): number => e.day * BLOCKS_PER_DAY + e.block;
const worldSize = (s: GridState): [number, number] => [Math.max(s.map.w, 20, 1 + Math.max(0, ...s.buses.map((b) => b.x))), Math.max(s.map.h, 20, 1 + Math.max(0, ...s.buses.map((b) => b.y)))];
const effDemand = (s: GridState): number => s.loads.reduce((a, l) => a + l.P * (1 - l.shedFrac), 0);
/** Demand at a future block of the day at the present temperature (for commitment look-ahead). */
const forecastDemand = (s: GridState, block: number): number => s.loads.reduce((a, l) => a + demandPQ({ cls: DEMAND_CLASS[l.class], peakMW: l.Ppeak, block, tempC: s.weather.tempC }).pMW * (l.shape ? 1 : finaleScale(s, l.class, s.clock.day + (block < s.clock.block ? 1 : 0), block)) * (1 - l.shedFrac), 0);

export function buildPipeline(getParams: (s: GridState) => SimParams, getBench?: (s: GridState) => BenchParams): System<GridState>[] {
  return [
    // 1. clock: advance the block, roll the day over, open a fresh block summary.
    { id: 'clock', run: (s) => {
      s.clock.block += 1;
      if (s.clock.block >= BLOCKS_PER_DAY) { s.clock.block = 0; s.clock.day += 1; }
      if (s.clock.phase === 'event') s.clock.phase = 'run';
      s.block = emptyBlock(s.block);
    } },

    // 2. weather: temperature (diurnal + a seeded day offset), cloud drift, wind AR(1), scripted storms and cloud fronts.
    { id: 'weather', run: (s) => {
      const p = getParams(s);
      const rng = systemRng(s.seed, s.clock.day, s.clock.block, 'weather');
      const dayOff = systemRng(s.seed, s.clock.day, 0, 'weather.day').normal(0, 2);
      const hour = s.clock.block / 4;
      const tMean = 28 - 0.35 * Math.abs(p.latitudeDeg);
      s.weather.tempC = tMean + dayOff + 5 * dmath.sin((2 * Math.PI * (hour - 9)) / 24);
      const first = s.tick === 0;
      const sd = WIND_SIGMA * Math.sqrt(1 - WIND_PHI * WIND_PHI);
      const x = first ? rng.normal(0, WIND_SIGMA) : WIND_PHI * (s.weather.windMs - MEAN_WIND_MS) + rng.normal(0, sd);
      s.weather.windMs = Math.max(0, MEAN_WIND_MS + x);
      const [W, H] = worldSize(s);
      const toCloud = (c: CloudBlob) => ({ x: c.x, y: c.y, radius: c.radiusTiles, opacity: c.opacity, vx: c.vx, vy: c.vy });
      const fromCloud = (c: ReturnType<typeof toCloud>): CloudBlob => ({ x: c.x, y: c.y, radiusTiles: c.radius, opacity: c.opacity, vx: c.vx, vy: c.vy });
      if (first && s.weather.clouds.length === 0) s.weather.clouds = generateClouds(rng, { width: W, height: H, count: 3, maxSpeed: 0.01 }).map(fromCloud);
      else s.weather.clouds = advectClouds(s.weather.clouds.map(toCloud), 1, W, H).map(fromCloud);
      for (const e of s.events.queue) {
        if (eventStart(e) !== dayIndex(s)) continue;
        if (e.kind === 'storm') s.weather.stormLeft = Math.max(1, Math.round(e.magnitude) || 8);
        if (e.kind === 'cloud-front') s.weather.clouds.push({ x: rng.range(0, W), y: rng.range(0, H), radiusTiles: 0.6 * Math.max(W, H), opacity: 0.9, vx: 0.02 * W, vy: 0 });
      }
      s.weather.stormActive = s.weather.stormLeft > 0;
      if (s.weather.stormActive) { s.weather.windMs = Math.max(s.weather.windMs, STORM_WIND_MS); s.weather.stormLeft -= 1; }
    } },

    // 2b. finale (L28 only): the three days' pinned weather, repair crews and reserve batteries (src/sim/finale.ts).
    { id: 'finaleWeather', run: (s) => { finaleWeather(s); } },

    // 3. demand: class profile x temperature, plus scripted surges (MW added for SURGE_BLOCKS blocks).
    { id: 'demand', run: (s) => {
      const now = dayIndex(s);
      for (const l of s.loads) {
        if (l.shape) {   // a level-authored daily shape (e.g. the rice mill): P and Q per block as fractions of the peak
          const ps = l.shape.p[s.clock.block] ?? 0, qs = l.shape.q[s.clock.block] ?? 0;
          let pShape = ps * l.Ppeak;
          for (const e of s.events.queue) if (e.kind === 'load-surge' && e.target === l.id && now >= eventStart(e) && now < eventStart(e) + SURGE_BLOCKS) pShape += e.magnitude;
          l.P = fin(pShape); l.Q = fin(qs * l.Ppeak);
          continue;
        }
        let pMW = demandPQ({ cls: DEMAND_CLASS[l.class], peakMW: l.Ppeak, block: s.clock.block, tempC: s.weather.tempC }).pMW;
        for (const e of s.events.queue) if (e.kind === 'load-surge' && e.target === l.id && now >= eventStart(e) && now < eventStart(e) + SURGE_BLOCKS) pMW += e.magnitude;
        pMW *= finaleScale(s, l.class, s.clock.day, s.clock.block);   // 1 outside L28
        l.P = fin(pMW);
        l.Q = fin(pMW * (l.pf > 0 && l.pf < 1 ? Math.sqrt(1 - l.pf * l.pf) / l.pf : 0));
      }
    } },

    // 4. renewables: PV from sun geometry x clouds, wind from the power curve. Curtailment is decided in dispatch.
    { id: 'renewables', run: (s) => {
      const p = getParams(s);
      const doy = ((START_DOY - 1 + s.clock.day) % 365) + 1;
      const clouds = s.weather.clouds.map((c) => ({ x: c.x, y: c.y, radius: c.radiusTiles, opacity: c.opacity, vx: c.vx, vy: c.vy }));
      const pos = new Map(s.buses.map((b) => [b.id, b]));
      for (const u of s.units) {
        if (u.kind === 'pv') {
          const b = pos.get(u.bus);
          const tr = b ? transmittance(clouds, b.x, b.y) : 1;
          u.availMW = fin(pvPlantOutput({ pAcRatedMW: u.pMax, latDeg: p.latitudeDeg, dayOfYear: doy, block: s.clock.block, tAmbC: s.weather.tempC, transmittance: tr }).pAcMW);
        } else if (u.kind === 'wind') u.availMW = fin(windPower(u.pMax, s.weather.windMs));
      }
    } },

    // 5. commitment: start/stop timers, min up/down, auto priority list with reserve (or the player's schedule).
    { id: 'commitment', run: (s) => {
      const units = s.units.filter(isDispatchable);
      const auto = s.dispatch.auto;
      const renew = s.units.reduce((a, u) => a + (u.online && RENEWABLE_KINDS.has(u.kind) ? u.availMW : 0), 0);
      // look ahead as far as the slowest offline start, so a unit is committed early enough to be on when demand needs it
      const lead = units.reduce((m, u) => (u.online ? m : Math.max(m, u.startBlocks)), 0);
      let peak = effDemand(s);
      for (let k = 1; k <= lead; k++) peak = Math.max(peak, forecastDemand(s, (s.clock.block + k) % BLOCKS_PER_DAY));
      const target = Math.max(0, peak + s.block.lossMW - renew);
      const cu: CommitUnit[] = units.map((u) => ({
        id: u.id, pMin: u.pMin, pMax: u.pMax, fullLoadAvgCost: u.pMax > 0 ? (u.cost.a + u.cost.b * u.pMax + u.cost.c * u.pMax * u.pMax) / u.pMax + u.vomPerMWh : 0,
        minUpBlocks: u.minUpBlocks, minDownBlocks: u.minDownBlocks, startBlocks: u.startBlocks, initialOnline: u.online, blocksInState: 0,
      }));
      const order = priorityList(cu);
      const need = neededSet(cu, order, target);
      // minimum generation: while the committed units' minimum outputs exceed the demand and the rest still cover it, drop the dearest one
      let dropped = true;
      while (dropped) {
        dropped = false;
        const on = order.filter((i) => need[i]);
        const sumMin = on.reduce((a, i) => a + cu[i]!.pMin, 0), cap = on.reduce((a, i) => a + cu[i]!.pMax, 0);
        const last = on[on.length - 1];
        if (on.length > 1 && last !== undefined && sumMin > target && cap - cu[last]!.pMax >= target) { need[last] = false; dropped = true; }
      }
      units.forEach((u, i) => {
        const c = u.commit;
        if (u.online) c.minUpLeft = Math.max(0, c.minUpLeft - 1);
        else if (c.startLeft > 0) { c.startLeft -= 1; if (c.startLeft === 0) { u.online = true; c.minUpLeft = u.minUpBlocks; } }
        else c.minDownLeft = Math.max(0, c.minDownLeft - 1);
        const sch = c.schedule.length >= BLOCKS_PER_DAY ? c.schedule[s.clock.block]! : -1;   // 1 on, 0 off, -1 follow auto
        const wanted = sch === 1 || sch === 0 ? sch === 1 : auto ? need[i]! : u.online || c.startLeft > 0;
        if (wanted && !u.online && c.startLeft === 0 && c.minDownLeft === 0) {
          s.block.starts += 1; s.block.startCostBlock += u.startCost;
          if (u.startBlocks === 0) { u.online = true; c.minUpLeft = u.minUpBlocks; } else c.startLeft = u.startBlocks;
        } else if (!wanted && u.online && c.minUpLeft === 0) { u.online = false; u.P = 0; u.Q = 0; c.minDownLeft = u.minDownBlocks; }
      });
    } },

    // 6. dispatch: storage strategy, lambda economic dispatch with ramp windows, renewable curtailment on surplus.
    { id: 'dispatch', run: (s) => {
      const p = getParams(s);
      const price = p.economy.energyPricePerMWh;
      let storageMW = 0;
      const held = heldByStorage(toNet(s), s.storage), holding = held.forming;   // a battery that holds an island is run by the island's load (settled after the load flow), not by the price
      storageMW += held.loadMW;                                                // and what it carries is not the thermal fleet's to cover
      for (const b of s.storage) {
        if (s.rules.cableCutBlock != null || holding.has(b.id) || held.orphans.has(b.id)) { b.P = 0; continue; }   // L30's backup battery floats on the live grid
        const sp: StorageParams = { energyMWh: b.mwh, pChMaxMW: b.mw, pDisMaxMW: b.mw, etaRt: b.etaRt, socMin: 0.1, socMax: 0.9 };
        let ch = 0, dis = 0;
        if (b.mode === 'threshold') ({ pChMW: ch, pDisMW: dis } = thresholdRequest(sp, s.dispatch.lambda, 0.7 * price, 1.3 * price));
        else if (b.mode === 'schedule' && b.schedule && b.schedule.length >= BLOCKS_PER_DAY) { const v = b.schedule[s.clock.block]!; ch = Math.max(0, -v); dis = Math.max(0, v); }
        const st = storageStep(sp, b.soc, ch, dis);
        b.soc = fin(st.soc, b.soc); b.P = fin(st.pDisMW - st.pChMW);
        storageMW += b.P;
      }
      const renew = s.units.filter((u) => RENEWABLE_KINDS.has(u.kind));
      const rMW = renew.reduce((a, u) => a + (u.online ? u.availMW : 0), 0);
      const thermal = s.units.filter((u) => isDispatchable(u) && u.online);
      const demand = effDemand(s);
      const thermalDemand = Math.max(0, demand + s.block.lossMW - rMW - storageMW);
      let pOut: number[] = thermal.map(() => 0), lambda = 0, shortfall = 0, surplus = 0;
      if (thermal.length > 0) {
        if (!s.dispatch.auto && s.dispatch.schedule) {
          pOut = thermal.map((u) => { const row = s.dispatch.schedule![s.units.indexOf(u)]; return Math.min(u.pMax, Math.max(u.pMin, row && row.length >= BLOCKS_PER_DAY ? row[s.clock.block]! : u.P)); });
          const tot = pOut.reduce((a, x) => a + x, 0);
          shortfall = Math.max(0, thermalDemand - tot); surplus = Math.max(0, tot - thermalDemand);
        } else {
          const ed: EdUnit[] = thermal.map((u) => ({ a: u.cost.a, b: u.cost.b, c: u.cost.c, pMin: u.pMin, pMax: u.pMax, pPrev: u.P, rampMWperMin: u.rampMWperMin }));
          const r = economicDispatch(ed, thermalDemand);
          pOut = r.p; lambda = r.lambda; shortfall = r.shortfallMW; surplus = r.surplusMW;
        }
      } else shortfall = thermalDemand;
      const curtail = Math.min(surplus, rMW);
      const keep = rMW > 0 ? 1 - curtail / rMW : 1;
      thermal.forEach((u, i) => { u.P = fin(pOut[i]!); u.Pset = u.P; });
      for (const u of s.units) {
        if (RENEWABLE_KINDS.has(u.kind)) { u.P = u.online ? fin(u.availMW * keep) : 0; u.Pset = u.P; }
        else if (!u.online || !isDispatchable(u)) { u.P = 0; u.Pset = 0; }
        u.headroom = isDispatchable(u) && u.online ? Math.max(0, u.pMax - u.P) : 0;
      }
      s.dispatch.lambda = fin(lambda);
      s.block.curtailedMW = curtail; s.block.shortfallMW = shortfall;
      s.block.imbalanceMW = shortfall > 0 ? shortfall : 0 - Math.max(0, surplus - curtail);
      s.block.demandMW = demand;
      s.block.reserveMW = s.units.reduce((a, u) => a + u.headroom, 0) + s.storage.reduce((a, b) => a + Math.max(0, b.mw - Math.max(0, b.P)), 0);
    } },

    // 7. controls: automatic tap changers and capacitor banks (delay counters, one step per action), acting on the last solution.
    { id: 'controls', run: (s) => {
      if (!s.solution) return;
      const v = new Map(s.solution.buses.map((b) => [b.id, b.vPu]));
      for (const b of s.branches) {
        const tp = b.tap;
        if (!tp || !tp.auto || !b.inService) continue;
        const vm = v.get(b.to);
        if (vm === undefined) { tp.auto.counter = 0; continue; }
        const err = vm - tp.auto.vSet;
        if (Math.abs(err) <= tp.auto.deadband) { tp.auto.counter = 0; continue; }
        tp.auto.counter += 1;
        if (tp.auto.counter >= tp.auto.delayBlocks) {
          const next = Math.max(b.tapMin, Math.min(b.tapMax, tp.pos + (err < 0 ? 1 : -1)));
          if (next !== tp.pos) { tp.pos = next; s.metrics.tapOps += 1; }
          tp.auto.counter = 0;
        }
      }
      for (const h of s.shunts) {
        if (!h.auto || (h.kind !== 'cap' && h.kind !== 'reactor')) continue;
        if (h.kind === 'reactor' && h.auto.counter < 0) { h.auto.counter += 1; continue; }   // a reactor breaker rests REACTOR_DWELL blocks after an operation (chapter 5: a step wider than the band otherwise hunts)
        const vm = v.get(h.bus);
        if (vm === undefined) continue;
        const want = vm < h.auto.vLowPu ? 1 : vm > h.auto.vHighPu ? -1 : 0;
        if (want === 0) { h.auto.counter = 0; continue; }
        h.auto.counter += 1;
        if (h.auto.counter >= h.auto.delayBlocks) {
          const next = Math.max(0, Math.min(h.steps, h.on + (h.kind === 'cap' ? want : -want)));
          if (next !== h.on) { h.on = next; s.metrics.switchOps += 1; h.auto.counter = h.kind === 'reactor' ? -REACTOR_DWELL : 0; } else h.auto.counter = 0;
        }
      }
    } },

    // 7b. flashover: at the level's hot evening block, spans under their clearance rule flash over and trip their line (before the load flow sees it).
    { id: 'flashover', run: (s) => { flashoverStep(s); saltFlashoverStep(s); anchorCutStep(s); } },

    // 8. loadflow: islands, Newton-Raphson, Q-limits, collapse sheds -> `solution` (V and theta only; flows are memoised outside).
    { id: 'loadflow', run: (s) => {
      if (s.buses.length === 0) { s.solution = null; s.block.lossMW = 0; return; }
      const solved = solveState(s);
      const { sol, flows } = solved;
      for (const [id, f] of Object.entries(sol.shed)) { const l = s.loads.find((x) => x.id === id); if (l) l.shedFrac = Math.min(1, 1 - (1 - l.shedFrac) * (1 - f)); }
      s.solution = toResult(sol);
      remember(s.solution, solved);
      // storage that held an island this block discharged what the island drew; a backup battery on a live grid floats full (L30)
      const float = s.rules.cableCutBlock != null;
      for (const b of s.storage) {
        const isl = sol.islands.find((i) => i.slackUnit === b.id);
        if (isl) s.metrics.track.islandKWh = fin((s.metrics.track.islandKWh ?? 0) + settleIslandStorage(b, (flows.slack[b.bus]?.p ?? 0) * S_BASE_MVA));
        else if (float) { b.P = 0; if (sol.energised[b.bus]) b.soc = SOC_MAX; }
      }
      const regUnits = new Map<string, Unit[]>();
      for (const u of s.units) if (u.online) { const a = regUnits.get(u.bus) ?? []; a.push(u); regUnits.set(u.bus, a); }
      for (const [bus, us] of regUnits) {
        const q = (flows.qAtPv[bus] ?? 0) * S_BASE_MVA;
        for (const u of us) u.Q = fin(RENEWABLE_KINDS.has(u.kind) ? 0 : q / us.length);
      }
      // the slack picks up the imbalance and the losses: write its realised P back
      for (const isl of sol.islands) {
        if (!isl.slackUnit) continue;
        const su = s.units.find((u) => u.id === isl.slackUnit);
        if (!su) continue;
        const sp = flows.slack[su.bus];
        if (!sp) continue;
        const others = s.units.filter((u) => u.bus === su.bus && u.id !== su.id && u.online).reduce((a, u) => a + u.P, 0);
        su.P = fin(Math.max(0, sp.p * S_BASE_MVA - others), su.P);
      }
      s.block.lossMW = fin(flows.totalLossP * S_BASE_MVA);
    } },

    // 9. limits: thermal overload timers (inverse time), voltage bands and brownout accounting.
    { id: 'limits', run: (s) => {
      const p = getParams(s);
      const solved = solvedOf(s);
      if (!solved) return;
      const { flows, sol } = solved;
      const loads: Record<string, { loading: number; kind: 'line' | 'xfmr' }> = {};
      const st: OverloadState = {};
      for (const b of s.branches) {
        if (!b.inService) { b.timer = null; continue; }
        const kind = b.kind === 'xfmr' ? 'xfmr' : 'line';
        loads[b.id] = { loading: flows.branch[b.id]?.loading ?? 0, kind };
        if (b.timer) st[b.id] = { frac: b.timer.frac, belowS: b.timer.belowS };
        s.block.worstLoading = Math.max(s.block.worstLoading, loads[b.id]!.loading);
      }
      const r = stepOverload(st, loads, BLOCK_S);
      for (const b of s.branches) {
        if (!b.inService) continue;
        const ts = r.state[b.id];
        b.timer = ts && loads[b.id]!.loading > 1 ? { secLeft: fin(Math.min(1e6, remainingS(ts, loads[b.id]!.loading, loads[b.id]!.kind)), 1e6), frac: ts.frac, belowS: ts.belowS } : ts ? { secLeft: 1e6, frac: ts.frac, belowS: ts.belowS } : null;
      }
      for (const tr of r.trips) {
        const b = s.branches.find((x) => x.id === tr.id)!;
        b.inService = false; b.timer = null; s.block.trips.push(tr.id);
        s.metrics.track.overloadTrips = (s.metrics.track.overloadTrips ?? 0) + 1;
        log(s, t('log.overloadTrip', { id: tr.id, pct: Math.round(tr.loading * 100) }), 'bad');
      }
      // voltage bands
      const loadBuses = new Set(s.loads.filter((l) => l.P > 0).map((l) => l.bus));
      let low = false, high = false, worst = 1;
      for (const b of s.buses) {
        if (!sol.energised[b.id]) continue;
        const v = sol.V[b.id]!;
        if (Math.abs(v - 1) > Math.abs(worst - 1)) worst = v;
        const [lo, hi] = voltageBand(p, b.kvNom, s.mode);
        if (v < lo && loadBuses.has(b.id)) low = true;
        if (v > hi) high = true;
      }
      if (s.rules.darkLoadsLose) for (const id of loadBuses) if (!sol.energised[id]) low = true;
      s.block.worstVPu = worst;
      if (low) s.metrics.poorSupplyMin += 15;
      if (high) s.metrics.ovMin += 15;
    } },

    // 10. events: scripted contingencies and limit trips -> one event window (cascade + frequency + protection).
    { id: 'events', run: (s) => {
      const p = getParams(s);
      const now = dayIndex(s);
      const trips = [...s.block.trips];
      const keep: typeof s.events.queue = [];
      for (const e of s.events.queue) {
        const due = eventStart(e) === now;
        if ((e.kind === 'trip-unit' || e.kind === 'trip-branch' || e.kind === 'fault') && due) {
          if (e.kind === 'fault' && s.buses.some((b) => b.id === e.target)) trips.push(...s.branches.filter((b) => b.inService && (b.from === e.target || b.to === e.target)).map((b) => b.id).sort(cmpId));
          else trips.push(e.target);
          continue;
        }
        const expired = now - eventStart(e) >= BLOCKS_PER_DAY && (e.kind === 'load-surge' || e.kind === 'storm' || e.kind === 'cloud-front');
        if (!expired) keep.push(e);
      }
      s.events.queue = keep;
      const real = [...new Set(trips)].filter((id) => s.branches.some((b) => b.id === id && b.inService) || s.units.some((u) => u.id === id && u.online) || s.block.trips.includes(id));
      if (real.length === 0) return;
      // limit trips already opened the branch in `limits`: reopen it for the window so the cascade sees the trip
      for (const id of s.block.trips) { const b = s.branches.find((x) => x.id === id); if (b) b.inService = true; }
      const res = runEventWindow(s, p, { trips: real });
      for (const k of Object.keys(res.state) as (keyof GridState)[]) (s as unknown as Record<string, unknown>)[k] = res.state[k];
      s.block.eventWindow = true; s.block.trips = real;
      s.clock.phase = 'event';
      log(s, t('log.eventWindow', { n: real.length, ids: real.join(', ') }), 'bad');
    } },

    // 11. blockFrequency: quasi-steady frequency from the imbalance (when no event window ran), UFLS stages.
    { id: 'blockFrequency', run: (s) => {
      if (s.block.eventWindow) return;
      const p = getParams(s);
      const rng = systemRng(s.seed, s.clock.day, s.clock.block, 'blockFrequency');
      const demand = s.block.demandMW;
      const noise = rng.normal(0, 0.002 * demand) * (s.rules.finale ? 0 : 1);   // L28: only real imbalances move the frequency
      const units: BlockUnit[] = s.units.filter((u) => u.online && isDispatchable(u) && u.droopPct > 0).map((u) => ({ id: u.id, S: u.mva, R: u.droopPct / 100, upMW: Math.max(0, u.pMax - u.P), downMW: Math.max(0, u.P - u.pMin) }));
      const r = blockFrequency(units, s.block.imbalanceMW + noise, Math.max(demand, 1e-3), p.f0);
      s.freq = { fHz: fin(r.fHz, p.f0), rocof: 0 };
      s.protection.ufls.forEach((st, i) => {
        const hit = s.freq.fHz <= st.hz;
        if (hit && !st.operated) {
          st.operated = true;
          const pool = s.loads.filter((l) => l.priority === null && l.class !== 'critical' && l.uflsStage === i);
          const use = pool.length > 0 ? pool : s.loads.filter((l) => l.priority === null && l.class !== 'critical' && l.uflsStage === null);
          const tot = use.reduce((a, l) => a + l.P * (1 - l.shedFrac), 0);
          if (tot > 0) for (const l of use) l.shedFrac = Math.min(1, l.shedFrac + ((st.shedPct / 100) * demand / tot) * (1 - l.shedFrac));
          log(s, t('log.ufls', { stage: i + 1, hz: st.hz, pct: st.shedPct }), 'bad');
        } else if (!hit && s.freq.fHz >= p.gridcode.standardRangeHz[0]) st.operated = false;
      });
    } },

    // 12. economics: fuel + VOM + starts, ENS x VOLL, CO2, losses, capex amortisation.
    { id: 'economics', run: (s) => {
      const p = getParams(s);
      const solved = solvedOf(s);
      let opex = s.block.startCostBlock, co2 = 0, gen = 0;
      for (const u of s.units) {
        gen += u.P;
        if (u.online && isDispatchable(u)) opex += blockCost(u.cost, u.P, u.vomPerMWh, 0, true);
        else if (u.online) opex += u.vomPerMWh * u.P * BLOCK_H;
        co2 += u.co2tPerMWh * u.P * BLOCK_H;
      }
      // energy not served: persistent sheds plus load on de-energised buses
      let ens = 0;
      for (const l of s.loads) {
        const dark = solved && solved.sol.energised[l.bus] === false;
        ens += l.P * (l.shedFrac + (1 - l.shedFrac) * (dark ? 1 : 0));
      }
      s.block.ensMW = fin(ens); s.block.genMW = fin(gen);
      const ensCost = ens * BLOCK_H * p.economy.vollPerMWh;
      const amort = s.budget.spent / AMORT_BLOCKS;
      s.metrics.opex += fin(opex); s.metrics.capex = s.budget.spent;
      s.metrics.ensMWh += fin(ens * BLOCK_H); s.metrics.lossesMWh += fin(s.block.lossMW * BLOCK_H);
      s.metrics.co2t += fin(co2);
      s.block.costBlock = fin(opex + ensCost + amort);
      s.metrics.cost += s.block.costBlock;
    } },

    // 13. metrics: reserve margin, frequency extremes, blackout flag.
    { id: 'metrics', run: (s) => {
      const d = s.block.demandMW;
      s.block.marginPct = d > 1e-9 ? fin((s.block.reserveMW / d) * 100, 0) : 100;
      s.metrics.minMarginPct = s.tick === s.levelStart ? s.block.marginPct : Math.min(s.metrics.minMarginPct, s.block.marginPct);
      s.metrics.nadirHz = Math.min(s.metrics.nadirHz, s.freq.fHz);
      freqBlockTrack(s, getParams(s));   // chapter 6 levels only (rules.freqTrack): block-frequency statistics
      const solved = solvedOf(s);
      s.block.blackout = s.loads.length > 0 && !!solved && s.loads.every((l) => solved.sol.energised[l.bus] === false || l.shedFrac >= 1);
      // named level measurements for the star rules: billing power factor at the supply point (kWh over kVAh, |Q| counted in both
      // directions) and the loss share of the energy supplied
      const tr = s.metrics.track;
      const pg = s.units.reduce((a, u) => a + (u.online ? u.P : 0), 0), qg = s.units.reduce((a, u) => a + (u.online ? u.Q : 0), 0);
      tr.pMWh = fin((tr.pMWh ?? 0) + pg * BLOCK_H); tr.qMVArh = fin((tr.qMVArh ?? 0) + Math.abs(qg) * BLOCK_H);
      tr.pfDay = fin(tr.pMWh / (Math.sqrt(tr.pMWh * tr.pMWh + tr.qMVArh * tr.qMVArh) || 1), 1);
      tr.supplyMWh = fin((tr.supplyMWh ?? 0) + s.block.genMW * BLOCK_H);
      tr.peakLoading = Math.max(tr.peakLoading ?? 0, fin(s.block.worstLoading));
      tr.lossPct = tr.supplyMWh > 1e-9 ? fin((100 * s.metrics.lossesMWh) / tr.supplyMWh) : 0;
      if (s.rules.cableCutBlock != null && s.storage.length > 0) tr.batteryMargin = fin(Math.min(...s.storage.map((b) => windowShare(b.soc))));   // usable charge left in the window (L30 third star)
      if (s.routes.length > 0) {   // route levels: the thinnest clearance of any span (m) and the lowest voltage a loaded bus saw (pu; 0 when dark)
        tr.worstMarginM = fin(Math.min(...s.routes.map((r) => r.worstMarginM)));
        const coast = s.routes.flatMap((r) => (r.coastMinCreepageMm === undefined ? [] : [r.coastMinCreepageMm]));
        if (coast.length > 0) tr.coastMinCreepageMm = fin(Math.min(...coast));   // thinnest insulator creepage (mm) of any support within 6 tiles of the sea (L29 third star)
        const sol = solvedOf(s);
        const vs = s.loads.filter((l) => l.P > 0).map((l) => (sol && sol.sol.energised[l.bus] !== false ? sol.sol.V[l.bus] ?? 0 : 0));
        if (vs.length > 0) tr.loadVMinPu = Math.min(tr.loadVMinPu ?? Infinity, fin(Math.min(...vs)));
      }
      finaleTrack(s, getParams(s).gridcode.standardRangeHz);   // L28: island lights, frequency band, ENS share (only when rules.finale)
      ch5Track(s);   // chapter 5: voltage watch, loading cap, N-1 probe, loadability margin (each only when the level's rules ask)
    } },

    // 14. levelRules: the verdict (core turns it into won/lost through Level.goal / Level.fail, see src/rules.ts).
    // 13b. ch3: supply-point tracking, the L08 harmonic study and capacitor fuse, the L09 scripted fault (gated on rules.ch3).
    { id: 'ch3', run: (s) => { ch3Step(s, getParams(s).f0); } },
    // 13c. ch4: the L10-L13 circuits (gated on state.ch4).
    { id: 'ch4', run: (s) => { ch4Step(s, getParams(s)); } },

    { id: 'levelRules', run: (s) => {
      if (s.bench && getBench) stepBench(s, getBench(s));   // a bench level's circuit is solved here, once per block, before the verdict
      if (s.ch7) ch7Step(s);   // chapter 7: the study of the player's design (cost, tracked numbers, predictions' answers) before the verdict
      const r = levelResult(s, s.rules, s.tick + 1 - s.levelStart);
      s.block.verdict = r.status; s.block.verdictKey = r.key; s.block.verdictParams = r.params;
      if (r.status === 'won') s.stars = r.stars;
    } },

    // 15. explain: what needs the player now, and Codex unlocks.
    { id: 'explain', run: (s) => {
      const p = getParams(s);
      const needs: Note[] = [];
      if (s.block.blackout) needs.push(note('needs.blackout'));
      for (const b of s.branches) if (b.inService && b.timer && b.timer.secLeft < 1e6) needs.push(note('needs.overload', { id: b.id, sec: Math.round(b.timer.secLeft) }));
      if (s.solution) for (const sb of s.solution.buses) {
        const bus = s.buses.find((x) => x.id === sb.id); if (!bus) continue;
        const [lo, hi] = voltageBand(p, bus.kvNom, s.mode);
        if (sb.vPu < lo) needs.push(note('needs.lowVoltage', { bus: bus.id, v: Math.round(sb.vPu * 1000) / 1000 }));
        else if (sb.vPu > hi) needs.push(note('needs.highVoltage', { bus: bus.id, v: Math.round(sb.vPu * 1000) / 1000 }));
      }
      if (s.block.shortfallMW > 0) needs.push(note('needs.shortfall', { mw: Math.round(s.block.shortfallMW * 10) / 10 }));
      if (s.freq.fHz < p.gridcode.standardRangeHz[0] || s.freq.fHz > p.gridcode.standardRangeHz[1]) needs.push(note('needs.frequency', { hz: Math.round(s.freq.fHz * 1000) / 1000 }));
      s.block.needs = needs.slice(0, 12);
      const unlock = (id: string): void => { if (!s.codexUnlocked.includes(id)) s.codexUnlocked.push(id); };
      for (const n of needs) {
        if (n.key === 'needs.overload') unlock('thermal-limits');
        if (n.key === 'needs.lowVoltage' || n.key === 'needs.highVoltage') unlock('voltage-control');
        if (n.key === 'needs.frequency' || n.key === 'needs.shortfall') unlock('frequency-response');
        if (n.key === 'needs.blackout') unlock('cascading-failure');
      }
      if (s.block.eventWindow) unlock('cascading-failure');
    } },

    // 16. history: one entry per block in a fixed ring.
    { id: 'history', run: (s) => {
      const genMW: Record<string, number> = {};
      for (const u of s.units) genMW[u.kind] = fin((genMW[u.kind] ?? 0) + u.P);
      for (const b of s.storage) genMW.storage = fin((genMW.storage ?? 0) + b.P);
      s.history.entries.push({ day: s.clock.day, block: s.clock.block, demandMW: s.block.demandMW, genMW, fHz: s.freq.fHz, worstVPu: s.block.worstVPu, worstLoading: s.block.worstLoading, cost: s.block.costBlock });
      const over = s.history.entries.length - s.history.capacity;
      if (over > 0) s.history.entries.splice(0, over);
    } },
  ];
}
