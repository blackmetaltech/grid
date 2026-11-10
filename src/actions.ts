// Player actions (DESIGN 8.4). Each takes a CLONE of the state and returns {ok, message, key, params}: the message is the teaching
// text (every string lives in src/locales), `key` + `params` let the front-end re-render it in another language. A rejected action
// changes nothing. Successful ones are appended to `state.actionLog`. Catalogue data and money formatting are injected, so this file
// never touches a region.
import type { ActionFn, ActionResult } from '@core/kit';
import { t } from './i18n';
import { BLOCKS_PER_DAY, SPEEDS, type ClockSpeed, type GridState, type LoadClass, type BusKind } from './types';
import { makeLine, makeShunt, makeStorage, makeTransformer, makeUnit, type CatalogueView } from './sim/build';
import type { SimParams } from './sim/params';

const BLOCK_REAL_MS_AT_1X = 750;
const LOG_CAP = 200;
type Params = Record<string, string | number>;

export interface ActionDeps {
  /** The catalogue of the state's region. */
  cat: (s: GridState) => CatalogueView;
  getParams: (s: GridState) => SimParams;
  /** Formats an amount in the state's region currency. */
  money: (s: GridState, amount: number) => string;
}

/** Names of things in teaching messages (keys, so another locale can say them). */
const WHAT = { bus: 'what.bus', unit: 'what.unit', load: 'what.load', branch: 'what.branch', shunt: 'what.shunt', element: 'what.element', generator: 'what.generator', line: 'what.line', transformer: 'what.transformer', compensation: 'what.compensation', storage: 'what.storage', cable: 'what.cable' } as const;

const accept = (s: GridState, name: string, key: string, params: Params = {}): ActionResult => {
  s.actionLog.push({ tick: s.tick, name, key });
  if (s.actionLog.length > LOG_CAP) s.actionLog.splice(0, s.actionLog.length - LOG_CAP);
  return { ok: true, message: t(key, params), key, params };
};
const reject = (key: string, params: Params = {}): ActionResult => ({ ok: false, message: t(key, params), key, params });
const isStr = (x: unknown): x is string => typeof x === 'string' && x.length > 0;
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const bad = (name: string, expectedKey: string): ActionResult => reject('act.arg', { name, expected: t(expectedKey) });
const r1 = (x: number): number => Math.round(x * 10) / 10;
const r3 = (x: number): number => Math.round(x * 1000) / 1000;

function nextId(ids: string[], prefix: string): string {
  const used = new Set(ids);
  for (let n = ids.length + 1; ; n++) if (!used.has(`${prefix}${n}`)) return `${prefix}${n}`;
}
const allIds = (s: GridState): Set<string> => new Set([...s.buses, ...s.branches, ...s.units, ...s.loads, ...s.shunts, ...s.storage].map((x) => x.id));
const busOf = (s: GridState, id: string) => s.buses.find((b) => b.id === id);

export function buildActions(d: ActionDeps): Record<string, ActionFn<GridState>> {
  const unknown = (what: keyof typeof WHAT, id: string): ActionResult => reject('act.unknownId', { what: t(WHAT[what]), id });
  return {
    /** Set the clock speed: 0 pauses, otherwise a multiple of real time. */
    setSpeed: (s, speed: unknown) => {
      if (!isNum(speed)) return reject('speed.notNumber');
      if (!(SPEEDS as readonly number[]).includes(speed)) return reject('speed.invalid', { speed });
      s.clock.speed = speed as ClockSpeed;
      return speed === 0 ? accept(s, 'setSpeed', 'speed.paused') : accept(s, 'setSpeed', 'speed.ok', { speed, sec: Math.round(BLOCK_REAL_MS_AT_1X / speed) / 1000 });
    },

    // ---- build ----
    placeBus: (s, x: unknown, y: unknown, kvNom: unknown, kind: unknown, vSet: unknown) => {
      if (!isNum(x) || !isNum(y)) return bad('x, y', 'exp.tile_coordinates');
      if (!isNum(kvNom) || kvNom <= 0) return reject('act.bus.kv', { kv: String(kvNom) });
      const k: BusKind = kind === 'gen' || kind === 'load' || kind === 'sub' || kind === 'junction' ? kind : 'junction';
      const id = nextId(s.buses.map((b) => b.id), 'B');
      s.buses.push({ id, name: id, x, y, kvNom, kind: k, vSet: isNum(vSet) && vSet > 0 ? vSet : k === 'gen' ? 1 : null, zone: 'Z1' });
      return accept(s, 'placeBus', 'act.bus.ok', { id, x, y, kv: kvNom });
    },
    placeUnit: (s, catalogId: unknown, bus: unknown, mw: unknown) => {
      if (!isStr(catalogId)) return bad('catalogId', 'exp.a_catalogue_id');
      if (!isStr(bus)) return bad('bus', 'exp.a_bus_id');
      if (!isNum(mw) || mw <= 0) return reject('act.unit.size', { mw: String(mw) });
      const spec = d.cat(s).generator(catalogId);
      if (!spec) return reject('act.unknownCatalog', { what: t(WHAT.generator), id: catalogId });
      if (!busOf(s, bus)) return unknown('bus', bus);
      const id = nextId(s.units.map((u) => u.id), 'U');
      const unit = makeUnit(spec, id, bus, mw);
      s.units.push(unit);
      const capex = (spec.capexPerKw ?? 0) * mw * 1000;
      s.budget.spent += capex;
      return accept(s, 'placeUnit', 'act.unit.ok', { id, catalog: catalogId, mw, bus, capex: d.money(s, capex) });
    },
    placeLoad: (s, bus: unknown, cls: unknown, peakMW: unknown, pf: unknown) => {
      if (s.mode !== 'sandbox') return reject('act.sandboxOnly');
      if (!isStr(bus)) return bad('bus', 'exp.a_bus_id');
      if (!busOf(s, bus)) return unknown('bus', bus);
      if (!isStr(cls) || !['residential', 'commercial', 'industrial', 'agricultural', 'critical'].includes(cls)) return bad('class', 'exp.residential_commercial_indus');
      if (!isNum(peakMW) || peakMW <= 0) return bad('peakMW', 'exp.a_positive_number_of_mw');
      const id = nextId(s.loads.map((l) => l.id), 'L');
      s.loads.push({ id, bus, class: cls as LoadClass, Ppeak: peakMW, P: 0, Q: 0, pf: isNum(pf) && pf > 0 && pf <= 1 ? pf : 0.95, zip: [0.3, 0.2, 0.5], shedFrac: 0, uflsStage: null, priority: null, shape: null });
      return accept(s, 'placeLoad', 'act.load.ok', { id, cls, mw: peakMW, bus });
    },
    stringLine: (s, from: unknown, to: unknown, catalogId: unknown, circuits: unknown, lengthKm: unknown) => {
      if (!isStr(from) || !isStr(to)) return bad('from, to', 'exp.bus_ids');
      if (!isStr(catalogId)) return bad('catalogId', 'exp.a_catalogue_id');
      const n = circuits === undefined ? 1 : circuits;
      if (!isNum(n) || !Number.isInteger(n) || n < 1 || n > 4) return reject('act.line.circuits', { circuits: String(circuits) });
      if (from === to) return reject('act.line.same', { bus: from });
      const a = busOf(s, from), b = busOf(s, to);
      if (!a) return unknown('bus', from);
      if (!b) return unknown('bus', to);
      const spec = d.cat(s).line(catalogId);
      if (!spec) return reject('act.unknownCatalog', { what: t(WHAT.line), id: catalogId });
      for (const bb of [a, b]) if (Math.abs(bb.kvNom - spec.kv) > 1e-9) return reject('act.line.kv', { lineKv: spec.kv, bus: bb.id, busKv: bb.kvNom });
      const len = isNum(lengthKm) && lengthKm > 0 ? lengthKm : Math.max(0.1, Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y)) * s.map.tileM / 1000);
      const id = nextId(s.branches.map((x) => x.id), 'T');
      const br = makeLine(spec, id, from, to, len, n, []);
      s.branches.push(br);
      s.budget.spent += spec.costPerKm * len * n;
      return accept(s, 'stringLine', 'act.line.ok', { id, len: r1(len), circuits: n, x: r3(br.x), mva: Math.round(br.ratingMVA) });
    },
    /** Lay a submarine cable between two buses of its voltage (L30): no supports, no waypoints; its length is the sea distance the level gives (`rules.seaCableKm`), else the straight distance. */
    layCableRoute: (s, from: unknown, to: unknown, cableId: unknown) => {
      if (!isStr(from) || !isStr(to)) return bad('fromBus, toBus', 'exp.bus_ids');
      if (!isStr(cableId)) return bad('cableId', 'exp.a_catalogue_id');
      if (from === to) return reject('act.line.same', { bus: from });
      const a = busOf(s, from), b = busOf(s, to);
      if (!a) return unknown('bus', from);
      if (!b) return unknown('bus', to);
      const spec = d.cat(s).line(cableId);
      if (!spec) return reject('act.unknownCatalog', { what: t(WHAT.cable), id: cableId });
      if (spec.kind !== 'cable') return reject('act.cable.notSubmarine', { id: cableId });
      for (const bb of [a, b]) if (Math.abs(bb.kvNom - spec.kv) > 1e-9) return reject('act.line.kv', { lineKv: spec.kv, bus: bb.id, busKv: bb.kvNom });
      const sea = s.rules.seaCableKm;
      const len = isNum(sea) && sea > 0 ? sea : Math.max(0.1, Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y)) * s.map.tileM / 1000);
      const id = nextId(s.branches.map((x) => x.id), 'T');
      s.branches.push(makeLine(spec, id, from, to, len, 1, []));
      const cost = spec.costPerKm * len, kvar = spec.bUsKm * 1e-6 * (spec.kv * 1000) * (spec.kv * 1000) * len / 1000;   // Q = V^2 w C l = V^2 B l
      s.budget.spent += cost;
      s.cables = [...(s.cables ?? []), { branchId: id, cableId, lengthKm: len, cost, chargingKvar: kvar }];
      s.solution = null;
      return accept(s, 'layCableRoute', 'act.cable.ok', { id, km: r1(len), kvar: r1(kvar), cost: d.money(s, cost), amps: Math.round(spec.thermalMva * 1000 / (Math.sqrt(3) * spec.kv)) });
    },
    placeTransformer: (s, hv: unknown, lv: unknown, catalogId: unknown) => {
      if (!isStr(hv) || !isStr(lv)) return bad('busHV, busLV', 'exp.bus_ids');
      if (!isStr(catalogId)) return bad('catalogId', 'exp.a_catalogue_id');
      const a = busOf(s, hv), b = busOf(s, lv);
      if (!a) return unknown('bus', hv);
      if (!b) return unknown('bus', lv);
      if (hv === lv) return reject('act.line.same', { bus: hv });
      const spec = d.cat(s).transformer(catalogId);
      if (!spec) return reject('act.unknownCatalog', { what: t(WHAT.transformer), id: catalogId });
      if (Math.abs(a.kvNom - spec.kvHv) > 1e-9 || Math.abs(b.kvNom - spec.kvLv) > 1e-9) return reject('act.xfmr.kv', { kvHv: spec.kvHv, kvLv: spec.kvLv, hv, lv, busHv: a.kvNom, busLv: b.kvNom });
      const id = nextId(s.branches.map((x) => x.id), 'T');
      s.branches.push(makeTransformer(spec, id, hv, lv));
      s.budget.spent += spec.price;
      return accept(s, 'placeTransformer', 'act.xfmr.ok', { id, mva: spec.mva, zpct: spec.zPct, hv, lv });
    },
    placeShunt: (s, bus: unknown, catalogId: unknown, steps: unknown) => {
      if (!isStr(bus)) return bad('bus', 'exp.a_bus_id');
      if (!isStr(catalogId)) return bad('catalogId', 'exp.a_catalogue_id');
      if (!busOf(s, bus)) return unknown('bus', bus);
      const spec = d.cat(s).shunt(catalogId);
      if (!spec) return reject('act.unknownCatalog', { what: t(WHAT.compensation), id: catalogId });
      const n = isNum(steps) && Number.isInteger(steps) && steps >= 1 ? Math.min(steps, spec.maxSteps) : spec.maxSteps;
      const id = nextId(s.shunts.map((x) => x.id), 'C');
      s.shunts.push(makeShunt(spec, id, bus, n));
      s.budget.spent += spec.pricePerKvar * Math.abs(spec.mvarStep) * 1000 * n;
      return accept(s, 'placeShunt', 'act.shunt.ok', { id, kind: spec.kind, steps: n, mvar: Math.abs(spec.mvarStep), bus });
    },
    placeStorage: (s, bus: unknown, catalogId: unknown) => {
      if (!isStr(bus)) return bad('bus', 'exp.a_bus_id');
      if (!isStr(catalogId)) return bad('catalogId', 'exp.a_catalogue_id');
      if (!busOf(s, bus)) return unknown('bus', bus);
      const spec = d.cat(s).storage(catalogId);
      if (!spec) return reject('act.unknownCatalog', { what: t(WHAT.storage), id: catalogId });
      const id = nextId(s.storage.map((x) => x.id), 'S');
      s.storage.push(makeStorage(spec, id, bus));
      s.budget.spent += (spec.capexPerKw ?? 0) * spec.mw * 1000 + (spec.capexPerKwh ?? 0) * spec.mwh * 1000;
      return accept(s, 'placeStorage', 'act.storage.ok', { id, mw: spec.mw, mwh: spec.mwh, bus });
    },
    demolish: (s, id: unknown) => {
      if (!isStr(id)) return bad('id', 'exp.an_element_id');
      if (!allIds(s).has(id)) return unknown('element', id);
      const isBus = s.buses.some((b) => b.id === id);
      s.branches = s.branches.filter((b) => b.id !== id && !(isBus && (b.from === id || b.to === id)));
      s.units = s.units.filter((u) => u.id !== id && !(isBus && u.bus === id));
      s.loads = s.loads.filter((l) => l.id !== id && !(isBus && l.bus === id));
      s.shunts = s.shunts.filter((h) => h.id !== id && !(isBus && h.bus === id));
      s.storage = s.storage.filter((b) => b.id !== id && !(isBus && b.bus === id));
      s.buses = s.buses.filter((b) => b.id !== id);
      for (const r of s.routes) if (!s.branches.some((b) => b.id === r.branchId)) s.budget.spent -= r.cost;   // a surveyed line taken down is refunded: re-stringing with another kit costs the difference, not a second line
      s.routes = s.routes.filter((r) => s.branches.some((b) => b.id === r.branchId));   // a demolished line takes its route record with it
      if (s.cables) {   // a laid submarine cable taken up is refunded the same way
        for (const c of s.cables) if (!s.branches.some((b) => b.id === c.branchId)) s.budget.spent -= c.cost;
        s.cables = s.cables.filter((c) => s.branches.some((b) => b.id === c.branchId));
      }
      s.solution = null;
      return accept(s, 'demolish', 'act.demolish.ok', { id });
    },

    // ---- operate ----
    commit: (s, unitId: unknown, on: unknown, atBlock: unknown) => {
      if (!isStr(unitId)) return bad('unitId', 'exp.a_unit_id');
      if (typeof on !== 'boolean') return bad('on', 'exp.true_or_false');
      const u = s.units.find((x) => x.id === unitId);
      if (!u) return unknown('unit', unitId);
      if (u.kind === 'pv' || u.kind === 'wind') return reject('act.commit.nonThermal', { id: unitId, kind: u.kind });
      const from = isNum(atBlock) && Number.isInteger(atBlock) && atBlock >= 0 && atBlock < BLOCKS_PER_DAY ? atBlock : s.clock.block;
      if (u.commit.schedule.length < BLOCKS_PER_DAY) u.commit.schedule = new Array<number>(BLOCKS_PER_DAY).fill(-1);
      for (let b = from; b < BLOCKS_PER_DAY; b++) u.commit.schedule[b] = on ? 1 : 0;
      return accept(s, 'commit', 'act.commit.ok', { id: unitId, state: t(on ? 'act.commit.on' : 'act.commit.off'), block: from });
    },
    setDispatch: (s, unitId: unknown, mw: unknown, blocks: unknown) => {
      if (!isStr(unitId)) return bad('unitId', 'exp.a_unit_id');
      if (!isNum(mw)) return bad('MW', 'exp.a_number_of_mw');
      const idx = s.units.findIndex((x) => x.id === unitId);
      if (idx < 0) return unknown('unit', unitId);
      const u = s.units[idx]!;
      if (mw < u.pMin - 1e-9 || mw > u.pMax + 1e-9) return reject('act.setDispatch.range', { id: unitId, pmin: r1(u.pMin), pmax: r1(u.pMax), mw });
      const n = isNum(blocks) && Number.isInteger(blocks) && blocks >= 1 ? Math.min(blocks, BLOCKS_PER_DAY) : BLOCKS_PER_DAY;
      if (!s.dispatch.schedule) s.dispatch.schedule = s.units.map(() => []);
      s.dispatch.schedule = s.units.map((x, i) => { const row = s.dispatch.schedule![i] ?? []; return row.length >= BLOCKS_PER_DAY ? row : new Array<number>(BLOCKS_PER_DAY).fill(x.P); });
      for (let k = 0; k < n; k++) s.dispatch.schedule[idx]![(s.clock.block + k) % BLOCKS_PER_DAY] = mw;
      s.dispatch.auto = false;
      return accept(s, 'setDispatch', 'act.setDispatch.ok', { id: unitId, mw, block: s.clock.block, blocks: n });
    },
    setAutoDispatch: (s, on: unknown) => {
      if (typeof on !== 'boolean') return bad('on', 'exp.true_or_false');
      s.dispatch.auto = on;
      return accept(s, 'setAutoDispatch', 'act.autoDispatch.ok', { state: on ? 'on' : 'off' });
    },
    shedLoad: (s, loadId: unknown, frac: unknown) => {
      if (!isStr(loadId)) return bad('loadId', 'exp.a_load_id');
      if (!isNum(frac) || frac < 0 || frac > 1) return reject('act.shed.range', { frac: String(frac) });
      const l = s.loads.find((x) => x.id === loadId);
      if (!l) return unknown('load', loadId);
      l.shedFrac = frac;
      return accept(s, 'shedLoad', 'act.shed.ok', { id: loadId, pct: Math.round(frac * 100) });
    },
    switchBranch: (s, id: unknown, inService: unknown) => {
      if (!isStr(id)) return bad('id', 'exp.a_branch_id');
      if (typeof inService !== 'boolean') return bad('inService', 'exp.true_or_false');
      const b = s.branches.find((x) => x.id === id);
      if (!b) return unknown('branch', id);
      if (b.inService !== inService) { b.inService = inService; b.timer = null; s.metrics.switchOps += 1; }
      return accept(s, 'switchBranch', 'act.switch.ok', { id, state: t(inService ? 'act.switch.in' : 'act.switch.out') });
    },

    // ---- settings ----
    setTap: (s, id: unknown, pos: unknown) => {
      if (!isStr(id)) return bad('branchId', 'exp.a_transformer_id');
      if (!isNum(pos) || !Number.isInteger(pos)) return bad('pos', 'exp.a_whole_number_of_steps');
      const b = s.branches.find((x) => x.id === id);
      if (!b) return unknown('branch', id);
      if (!b.tap) return reject('act.tap.notXfmr', { id });
      if (pos < b.tapMin || pos > b.tapMax) return reject('act.tap.range', { id, min: b.tapMin, max: b.tapMax, pos });
      if (b.tap.pos !== pos) { b.tap.pos = pos; s.metrics.tapOps += 1; }
      return accept(s, 'setTap', 'act.tap.ok', { id, pos });
    },
    setTapAuto: (s, id: unknown, vSet: unknown, deadband: unknown, delay: unknown) => {
      if (!isStr(id)) return bad('branchId', 'exp.a_transformer_id');
      const b = s.branches.find((x) => x.id === id);
      if (!b) return unknown('branch', id);
      if (!b.tap) return reject('act.tap.notXfmr', { id });
      if (!isNum(vSet) || !isNum(deadband) || !isNum(delay) || vSet < 0.8 || vSet > 1.2 || deadband <= 0 || delay < 1) return reject('act.tapAuto.arg');
      b.tap.auto = { vSet, deadband, delayBlocks: Math.round(delay), counter: 0 };
      return accept(s, 'setTapAuto', 'act.tapAuto.ok', { id, v: vSet, db: deadband, delay: Math.round(delay) });
    },
    setShuntSteps: (s, id: unknown, n: unknown) => {
      if (!isStr(id)) return bad('id', 'exp.a_shunt_id');
      if (!isNum(n) || !Number.isInteger(n)) return bad('n', 'exp.a_whole_number_of_steps');
      const h = s.shunts.find((x) => x.id === id);
      if (!h) return unknown('shunt', id);
      if (n < 0 || n > h.steps) return reject('act.shuntSteps.range', { id, n, steps: h.steps });
      if (h.on !== n) { h.on = n; s.metrics.switchOps += 1; }
      return accept(s, 'setShuntSteps', 'act.shuntSteps.ok', { id, on: n, steps: h.steps });
    },
    setShuntAuto: (s, id: unknown, vLow: unknown, vHigh: unknown, delay: unknown) => {
      if (!isStr(id)) return bad('id', 'exp.a_shunt_id');
      const h = s.shunts.find((x) => x.id === id);
      if (!h) return unknown('shunt', id);
      if (!isNum(vLow) || !isNum(vHigh) || !isNum(delay) || delay < 1) return bad('vLow, vHigh, delay', 'exp.voltages_in_pu_and_a_delay_i');
      if (!(vLow < vHigh)) return reject('act.shuntAuto.band', { lo: vLow, hi: vHigh });
      if (!h.auto) {   // automatic switching is dearer than a fixed bank (catalogue factor on the bank's price)
        const spec = d.cat(s).shunt(h.catalogId);
        if (spec && spec.autoFactor > 1) s.budget.spent += (spec.autoFactor - 1) * spec.pricePerKvar * Math.abs(spec.mvarStep) * 1000 * h.steps;
      }
      h.auto = { vLowPu: vLow, vHighPu: vHigh, delayBlocks: Math.round(delay), counter: 0 };
      return accept(s, 'setShuntAuto', 'act.shuntAuto.ok', { id, lo: vLow, hi: vHigh, delay: Math.round(delay) });
    },
    setDroop: (s, id: unknown, pct: unknown) => {
      if (!isStr(id)) return bad('unitId', 'exp.a_unit_id');
      if (!isNum(pct)) return bad('pct', 'exp.a_percentage');
      const u = s.units.find((x) => x.id === id);
      if (!u) return unknown('unit', id);
      const [lo, hi] = d.getParams(s).gridcode.droopRangePct;
      if (pct < lo || pct > hi) return reject('act.droop.range', { lo, hi, pct });
      u.droopPct = pct;
      return accept(s, 'setDroop', 'act.droop.ok', { id, pct });
    },
    setUflsMap: (s, stage: unknown, loadIds: unknown) => {
      if (!isNum(stage) || !Number.isInteger(stage) || stage < 1 || stage > s.protection.ufls.length) return reject('act.ufls.stage', { stage: String(stage), n: s.protection.ufls.length });
      if (!Array.isArray(loadIds) || !loadIds.every(isStr)) return bad('loadIds', 'exp.a_list_of_load_ids');
      for (const id of loadIds) if (!s.loads.some((l) => l.id === id)) return unknown('load', id);
      for (const l of s.loads) { if (l.uflsStage === stage - 1) l.uflsStage = null; if (loadIds.includes(l.id)) l.uflsStage = stage - 1; }
      return accept(s, 'setUflsMap', 'act.ufls.ok', { stage, n: loadIds.length });
    },

    // ---- meta ----
    predict: (s, questionId: unknown, value: unknown, unit: unknown) => {
      if (!isStr(questionId)) return bad('questionId', 'exp.a_question_id');
      if (!isNum(value)) return bad('value', 'exp.a_number');
      const u = isStr(unit) ? unit : '';
      s.metrics.predictions = s.metrics.predictions.filter((p) => p.id !== questionId);
      s.metrics.predictions.push({ id: questionId, quantity: questionId, predicted: value, actual: null, unit: u });
      return accept(s, 'predict', 'act.predict.ok', { q: questionId, value, unit: u });
    },
  };
}
