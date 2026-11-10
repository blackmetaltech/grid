// Chapter 4 actions (L10-L13). Each acts on `state.ch4`, refuses with a teaching key when the level or the argument is wrong, re-prices the build, and logs
// the action. The running level's part list is applied here (the generic gate only knows the argument positions of the older actions).
import type { ActionFn, ActionResult } from '@core/kit';
import { t } from '../../i18n';
import type { GridState } from '../../types';
import type { GridLevelSpec } from '../spec';
import { CAN_RATINGS_V, CAP_UNITS_UF, MAX_CANS, NEUTRAL, NIGHT, PHASES, REDUCE_STEPS_MW, SERIES_PCT, STARTERS, VREF_STEPS, HOUSES, type Phase, type Starter } from '../../sim/ch4/data';
import { ch4Cost } from '../../sim/ch4/systems';
import type { Conn } from '../../sim/ch4/pfc';
import type { Ch4Scenario } from '../../sim/ch4/state';

type Params = Record<string, string | number>;
const accept = (s: GridState, name: string, key: string, params: Params = {}): ActionResult => {
  s.actionLog.push({ tick: s.tick, name, key });
  if (s.actionLog.length > 200) s.actionLog.splice(0, s.actionLog.length - 200);
  return { ok: true, message: t(key, params), key, params };
};
const reject = (key: string, params: Params = {}): ActionResult => ({ ok: false, message: t(key, params), key, params });
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

export interface Ch4Deps { money: (s: GridState, amount: number) => string; specOf: (id: string) => GridLevelSpec | undefined }

/** Build the chapter's actions. */
export function buildCh4Actions(d: Ch4Deps): Record<string, ActionFn<GridState>> {
  const here = (s: GridState, want: Ch4Scenario): ActionResult | null => {
    if (!s.ch4) return reject('ch4.none');
    if (s.ch4.scenario !== want) return reject('ch4.otherLevel', { level: s.level ?? '' });
    return null;
  };
  /** The level's list of values an argument may take (null = any). */
  const listed = (s: GridState, action: string, value: unknown): ActionResult | null => {
    const spec = s.level ? d.specOf(s.level) : undefined, list = spec?.allowed.parts[action];
    if (spec && list && !list.map(String).includes(String(value))) return reject('level.part.notAllowed', { part: String(value), level: spec.id });
    return null;
  };
  const price = (s: GridState): string => { s.budget.spent = ch4Cost(s); return d.money(s, s.budget.spent); };
  const frozen = (s: GridState): ActionResult | null => (s.ch4?.l12?.fired ? reject('ch4.afterEvent') : null);

  return {
    /** L10: hang house `houseId` ('H1'..'H18') on phase 'a', 'b' or 'c'. */
    assignPhase: (s, houseId: unknown, phase: unknown) => {
      const w = here(s, 'l10'); if (w) return w;
      const m = typeof houseId === 'string' ? /^H(\d+)$/.exec(houseId) : null, i = m ? Number(m[1]) - 1 : -1;
      if (i < 0 || i >= HOUSES.length) return reject('ch4.house', { id: String(houseId), n: HOUSES.length });
      if (typeof phase !== 'string' || !(PHASES as readonly string[]).includes(phase)) return reject('ch4.phase', { phase: String(phase) });
      s.ch4!.l10!.phase[i] = phase as Phase;
      const h = HOUSES[i]!;
      return accept(s, 'assignPhase', 'ch4.phaseOk', { id: houseId as string, phase, kw: h.kw, total: price(s) });
    },
    /** L10: replace the street's neutral (messenger) conductor by `mm2` (54.6 is what it was built with). */
    setNeutral: (s, mm2: unknown) => {
      const w = here(s, 'l10'); if (w) return w;
      if (!isNum(mm2) || !NEUTRAL[mm2]) return reject('ch4.neutralSize', { size: String(mm2), sizes: Object.keys(NEUTRAL).join(', ') });
      const g = listed(s, 'setNeutral', mm2); if (g) return g;
      s.ch4!.l10!.neutralMm2 = mm2;
      return accept(s, 'setNeutral', 'ch4.neutralOk', { mm2, amps: NEUTRAL[mm2]!.ampacityA, ohm: NEUTRAL[mm2]!.rOhmKm, total: price(s) });
    },
    /** L11: the capacitor bank: `count` cans of `unitUF` microfarad per phase, rated `ratedV` volts, wired 'Y' or 'D'. count 0 removes it. */
    setBank: (s, unitUF: unknown, count: unknown, conn: unknown, ratedV: unknown) => {
      const w = here(s, 'l11'); if (w) return w;
      if (!isNum(unitUF) || !CAP_UNITS_UF.includes(unitUF)) return reject('ch4.unit', { uf: String(unitUF), sizes: CAP_UNITS_UF.join(', ') });
      if (!isNum(count) || !Number.isInteger(count) || count < 0 || count > MAX_CANS) return reject('ch4.count', { n: String(count), max: MAX_CANS });
      if (conn !== 'Y' && conn !== 'D') return reject('ch4.conn', { conn: String(conn) });
      if (!isNum(ratedV) || !CAN_RATINGS_V.includes(ratedV)) return reject('ch4.rated', { v: String(ratedV), ratings: CAN_RATINGS_V.join(', ') });
      const g = listed(s, 'setBank', unitUF); if (g) return g;
      s.ch4!.l11!.bank = count === 0 ? null : { unitUF, count, conn: conn as Conn, ratedV };
      return accept(s, 'setBank', count === 0 ? 'ch4.bankOff' : 'ch4.bankOk', { uf: unitUF, n: count, total_uf: unitUF * count, conn: conn === 'Y' ? 'Y' : 'delta', rated: ratedV, total: price(s) });
    },
    /** L11: the pump's starter: 'dol', 'yd' (star-delta) or 'soft'. */
    setStarter: (s, kind: unknown) => {
      const w = here(s, 'l11'); if (w) return w;
      if (typeof kind !== 'string' || !(kind in STARTERS)) return reject('ch4.starter', { kind: String(kind), kinds: Object.keys(STARTERS).join(', ') });
      const g = listed(s, 'setStarter', kind); if (g) return g;
      s.ch4!.l11!.starter = kind as Starter;
      return accept(s, 'setStarter', 'ch4.starterOk', { kind, mult: STARTERS[kind as Starter].mult, total: price(s) });
    },
    /** L12: the AVR's terminal-voltage set-point of the Kestrel Falls units, pu. */
    setAvrRef: (s, vref: unknown) => {
      const w = here(s, 'l12'); if (w) return w;
      const f = frozen(s); if (f) return f;
      if (!isNum(vref) || !VREF_STEPS.some((v) => Math.abs(v - vref) < 1e-9)) return reject('ch4.vref', { v: String(vref), steps: VREF_STEPS.join(', ') });
      s.ch4!.l12!.vref = vref;
      return accept(s, 'setAvrRef', 'ch4.vrefOk', { v: vref });
    },
    /** L12: series capacitors on every circuit, 0, 30 or 50 % of the line's reactance. */
    setSeriesComp: (s, pct: unknown) => {
      const w = here(s, 'l12'); if (w) return w;
      const f = frozen(s); if (f) return f;
      if (!isNum(pct) || !SERIES_PCT.includes(pct)) return reject('ch4.series', { pct: String(pct), steps: SERIES_PCT.join(', ') });
      s.ch4!.l12!.seriesPct = pct;
      return accept(s, 'setSeriesComp', 'ch4.seriesOk', { pct, total: price(s) });
    },
    /** L12: build (true) or remove (false) a third 220 kV circuit. */
    addCircuit: (s, on: unknown) => {
      const w = here(s, 'l12'); if (w) return w;
      const f = frozen(s); if (f) return f;
      if (typeof on !== 'boolean') return reject('ch4.circuitArg');
      s.ch4!.l12!.third = on;
      return accept(s, 'addCircuit', on ? 'ch4.circuitOn' : 'ch4.circuitOff', { total: price(s) });
    },
    /** L12: re-dispatch: hire `mw` MW of peaking plant in the city so the hydro sends that much less at the peak. */
    setRedispatch: (s, mw: unknown) => {
      const w = here(s, 'l12'); if (w) return w;
      const f = frozen(s); if (f) return f;
      if (!isNum(mw) || !REDUCE_STEPS_MW.includes(mw)) return reject('ch4.redispatch', { mw: String(mw), steps: REDUCE_STEPS_MW.join(', ') });
      s.ch4!.l12!.reduceMW = mw;
      return accept(s, 'setRedispatch', 'ch4.redispatchOk', { mw, total: price(s) });
    },
    /** L13: the field excitation of the generator at night, as the emf E it makes (pu). */
    setExcitation: (s, e: unknown) => {
      const w = here(s, 'l13'); if (w) return w;
      if (!isNum(e) || e < 0.3 || e > 3) return reject('ch4.excitation', { e: String(e) });
      s.ch4!.l13!.excitation = Math.round(e * 1000) / 1000;
      return accept(s, 'setExcitation', 'ch4.excitationOk', { e: Math.round(e * 1000) / 1000, p: NIGHT.p });
    },
  };
}
