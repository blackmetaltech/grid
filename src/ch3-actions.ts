// Chapter 3 actions (L08, L09), kept apart from the shared action file:
//   placeBank(bus, catalogId, steps, detunePct)  a capacitor bank with a series reactor of p % of its reactance (0 = plain bank; 7 and 14 = detuned banks; 4.53 = a filter tuned at h = 4.7).
//   placeSeriesCap(branchId, pct)                a series capacitor of pct % of the line's reactance (25, 40, 55, 70, 100): the branch's working reactance becomes x (1 - pct/100).
// Both are the same records the generic parts use (a Shunt with detunePct; a Branch with seriesCap), so the load flow, demolish and the world query need nothing new.
import type { ActionFn, ActionResult } from '@core/kit';
import { t } from './i18n';
import type { GridState } from './types';
import { makeShunt, type CatalogueView } from './sim/build';
import { xWorking } from './sim/ch3/series';

/** Price multipliers of the bank by reactor share: the catalogue's detuned banks cost x1.8 (compensation.ts `cap-detuned-7/14`); the tuned filter (game) x2.6. */
export const DETUNE_COST: Record<string, number> = { '0': 1, '4.53': 2.6, '7': 1.8, '14': 1.8 };
/** Reactor share of a filter tuned at h = 4.7: p = 1 / h^2. */
export const FILTER_PCT = 4.53;
/** Series capacitors cost this multiple of a shunt bank per kVAr of rating (platform, bypass switch, MOV protection: game). */
export const SERIES_COST_FACTOR = 1.6;
/** The fixed part of a series capacitor installation (platform on insulators, bypass switch, MOV and spark-gap protection, controls): priced as this many kVAr of shunt bank, so it scales with the region's capacitor price (game). */
export const SERIES_FIXED_KVAR = 20000;

export interface Ch3ActionDeps { cat: (s: GridState) => CatalogueView; money: (s: GridState, amount: number) => string }
type Params = Record<string, string | number>;
const accept = (s: GridState, name: string, key: string, params: Params): ActionResult => { s.actionLog.push({ tick: s.tick, name, key }); return { ok: true, message: t(key, params), key, params }; };
const reject = (key: string, params: Params = {}): ActionResult => ({ ok: false, message: t(key, params), key, params });
const isStr = (x: unknown): x is string => typeof x === 'string' && x.length > 0;
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const bad = (name: string, expectedKey: string): ActionResult => reject('act.arg', { name, expected: t(expectedKey) });
const nextId = (ids: string[], prefix: string): string => { const used = new Set(ids); for (let n = ids.length + 1; ; n++) if (!used.has(`${prefix}${n}`)) return `${prefix}${n}`; };

export function buildCh3Actions(d: Ch3ActionDeps): Record<string, ActionFn<GridState>> {
  return {
    placeBank: (s, bus: unknown, catalogId: unknown, steps: unknown, detunePct: unknown) => {
      if (!isStr(bus)) return bad('bus', 'exp.a_bus_id');
      if (!isStr(catalogId)) return bad('catalogId', 'exp.a_catalogue_id');
      const p = detunePct === undefined || detunePct === null ? 0 : detunePct;
      if (!isNum(p) || !(String(p) in DETUNE_COST)) return reject('ch3.bank.detune', { p: String(p) });
      if (!s.buses.some((b) => b.id === bus)) return reject('act.unknownId', { what: t('what.bus'), id: bus });
      const spec = d.cat(s).shunt(catalogId);
      if (!spec || spec.kind !== 'cap') return reject('act.unknownCatalog', { what: t('what.compensation'), id: catalogId });
      const n = isNum(steps) && Number.isInteger(steps) && steps >= 1 ? Math.min(steps, spec.maxSteps) : spec.maxSteps;
      const id = nextId(s.shunts.map((x) => x.id), 'C');
      const sh = makeShunt(spec, id, bus, n);
      if (p > 0) sh.detunePct = p;
      s.shunts.push(sh);
      const kvar = Math.abs(spec.mvarStep) * 1000 * n, cost = spec.pricePerKvar * kvar * DETUNE_COST[String(p)]!;
      s.budget.spent += cost;
      const h = p > 0 ? Math.round(100 / Math.sqrt(p / 100)) / 100 : 0;
      return accept(s, 'placeBank', p > 0 ? 'ch3.bank.ok.detuned' : 'ch3.bank.ok', { id, bus, kvar: Math.round(kvar), p, h, qeff: Math.round(kvar / (1 - p / 100)) });
    },
    placeSeriesCap: (s, branchId: unknown, pct: unknown) => {
      if (!isStr(branchId)) return bad('branchId', 'exp.a_branch_id');
      if (!isNum(pct) || pct <= 0 || pct > 100) return reject('ch3.series.range', { pct: String(pct) });
      const b = s.branches.find((x) => x.id === branchId);
      if (!b) return reject('act.unknownId', { what: t('what.branch'), id: branchId });
      if (b.kind !== 'line') return reject('ch3.series.notLine', { id: branchId });
      if (b.seriesCap) return reject('ch3.series.twice', { id: branchId, pct: b.seriesCap.pct });
      const xg = b.x;
      b.seriesCap = { pct, xGross: xg }; b.x = xWorking(xg, pct);
      // rating of the capacitor: the line's thermal current through X_C, three phases: 3 I^2 X_C (kVAr); price per kVAr = the region's shunt-bank price x SERIES_COST_FACTOR
      const bb = s.buses.find((q) => q.id === b.from), kv = bb?.kvNom ?? 1;
      const iA = b.ratingMVA * 1000 / (Math.sqrt(3) * kv), xcOhm = xg * (kv * kv / 100) * pct / 100, kvar = 3 * iA * iA * xcOhm / 1000;
      const perKvar = d.cat(s).shunt('cap-11-300')?.pricePerKvar ?? 0, cost = perKvar * (kvar + SERIES_FIXED_KVAR) * SERIES_COST_FACTOR;
      s.budget.spent += cost;
      return accept(s, 'placeSeriesCap', 'ch3.series.ok', { id: branchId, pct, xc: Math.round(xcOhm * 100) / 100, kvar: Math.round(kvar), xl: Math.round(xg * (kv * kv / 100) * 100) / 100 });
    },
  };
}
