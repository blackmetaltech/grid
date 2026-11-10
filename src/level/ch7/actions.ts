// Chapter 7 actions (L23-L27). Each acts on `state.ch7` (the player's design), refuses with a teaching key when the level or the argument is wrong, re-prices the build
// and logs the action. The generic part gate only knows the older actions' argument positions, so the running level's part list is applied here too.
import type { ActionFn, ActionResult } from '@core/kit';
import { t } from '../../i18n';
import type { GridState } from '../../types';
import type { GridLevelSpec } from '../spec';
import { SC, r1, r2, r3 } from '../../sim/ch7/data';
import { ch7Step } from '../../sim/ch7/study';
import { PLANTS } from '../../sim/ch7/merit';
import type { Ch7Id, DispatchMode, RelaySetting, Window } from '../../sim/ch7/state';

type Params = Record<string, string | number>;
const accept = (s: GridState, name: string, key: string, params: Params = {}): ActionResult => {
  s.actionLog.push({ tick: s.tick, name, key });
  if (s.actionLog.length > 200) s.actionLog.splice(0, s.actionLog.length - 200);
  return { ok: true, message: t(key, params), key, params };
};
const reject = (key: string, params: Params = {}): ActionResult => ({ ok: false, message: t(key, params), key, params });
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

export interface Ch7Deps { money: (s: GridState, amount: number) => string; specOf: (id: string) => GridLevelSpec | undefined }

export function buildCh7Actions(d: Ch7Deps): Record<string, ActionFn<GridState>> {
  const here = (s: GridState, ...want: Ch7Id[]): ActionResult | null => {
    if (!s.ch7) return reject('ch7.none');
    if (!want.includes(s.ch7.id)) return reject('ch7.otherLevel', { level: s.level ?? '' });
    return null;
  };
  const listed = (s: GridState, action: string, value: unknown): ActionResult | null => {
    const spec = s.level ? d.specOf(s.level) : undefined, list = spec?.allowed.parts[action];
    if (spec && list && !list.map(String).includes(String(value))) return reject('level.part.notAllowed', { part: String(value), level: spec.id });
    return null;
  };
  /** Re-study the design and show what the build costs now. */
  const price = (s: GridState): string => { ch7Step(s); return d.money(s, s.budget.spent); };
  const relayIdx = (id: unknown): number[] | null => (id === 'all' ? [0, 1, 2, 3] : typeof id === 'string' && /^R[1-4]$/.test(id) ? [Number(id.slice(1)) - 1] : null);

  return {
    /** L23 / L27: the rated breaking current of the board's breakers (kA, the R10 series). */
    setBreakerRating: (s, kA: unknown) => {
      const e = here(s, 'L23', 'L27'); if (e) return e;
      const ratings = s.ch7!.id === 'L23' ? SC.l23.breakers.ratingsKA : SC.l27.breakerRatingsKA;
      if (!isNum(kA) || !ratings.includes(kA)) return reject('ch7.rating.notStandard', { kA: String(kA), list: ratings.join(', ') });
      const g = listed(s, 'setBreakerRating', kA); if (g) return g;
      if (s.ch7!.id === 'L23') s.ch7!.l23!.rating = kA; else s.ch7!.l27!.rating = kA;
      const each = (s.ch7!.id === 'L23' ? SC.l23.breakers.price : SC.l27.breakerPrice)[ratings.indexOf(kA)]! * s.ch7!.money;
      return accept(s, 'setBreakerRating', 'ch7.rating.ok', { kA, n: SC.l23.breakers.count, each: d.money(s, each), total: price(s) });
    },
    /** L23: open (true) or close (false) the bus coupler: an open coupler splits the board in two. */
    setBusCoupler: (s, open: unknown) => {
      const e = here(s, 'L23'); if (e) return e;
      if (typeof open !== 'boolean') return reject('act.arg', { name: 'open', expected: t('exp.true_or_false') });
      s.ch7!.l23!.coupler = open ? 'open' : 'closed';
      return accept(s, 'setBusCoupler', open ? 'ch7.coupler.open' : 'ch7.coupler.closed', { total: price(s) });
    },
    /** L23: a series reactor (pu on 100 MVA) in the bus-section: 0 removes it. It only matters with the coupler closed. */
    setSeriesReactor: (s, x: unknown) => {
      const e = here(s, 'L23'); if (e) return e;
      if (!isNum(x) || !SC.l23.reactorX.includes(x)) return reject('ch7.reactor.size', { x: String(x), list: SC.l23.reactorX.join(', ') });
      s.ch7!.l23!.reactor = x;
      return accept(s, 'setSeriesReactor', x === 0 ? 'ch7.reactor.none' : 'ch7.reactor.ok', { x, ohm: r2(x * SC.l23.kv * SC.l23.kv / SC.l23.baseMVA), total: price(s) });
    },
    /** L23: the two 132/33 kV transformers' impedance: 10 % (standard) or 14 % (a custom high-impedance pair). */
    setTransformerZ: (s, uk: unknown) => {
      const e = here(s, 'L23'); if (e) return e;
      if (!isNum(uk) || !SC.l23.xfmr.ukPct.includes(uk)) return reject('ch7.xfmr.size', { uk: String(uk), list: SC.l23.xfmr.ukPct.join(', ') });
      s.ch7!.l23!.uk = uk;
      return accept(s, 'setTransformerZ', 'ch7.xfmr.ok', { uk, x: r3(uk / 100 * SC.l23.baseMVA / SC.l23.xfmr.mva), total: price(s) });
    },

    /** L24: the IDMT curve of relay R1..R4 (or 'all'): SI, VI or EI (IEC 60255-151). */
    setRelayCurve: (s, relay: unknown, curve: unknown) => {
      const e = here(s, 'L24'); if (e) return e;
      const ix = relayIdx(relay); if (!ix) return reject('ch7.relay.unknown', { id: String(relay) });
      if (curve !== 'SI' && curve !== 'VI' && curve !== 'EI') return reject('ch7.relay.curve', { curve: String(curve) });
      const g = listed(s, 'setRelayCurve', curve); if (g) return g;
      for (const i of ix) s.ch7!.l24!.relays[i]!.curve = curve;
      return accept(s, 'setRelayCurve', 'ch7.relay.curveOk', { relay: String(relay), curve });
    },
    /** L24: the plug setting of a relay, percent of its CT rating (50-200 in steps of 5). */
    setRelayPickup: (s, relay: unknown, pct: unknown) => {
      const e = here(s, 'L24'); if (e) return e;
      const ix = relayIdx(relay); if (!ix) return reject('ch7.relay.unknown', { id: String(relay) });
      if (!isNum(pct) || pct < 50 || pct > 200 || Math.abs(pct / 5 - Math.round(pct / 5)) > 1e-9) return reject('ch7.relay.pickup', { pct: String(pct) });
      for (const i of ix) s.ch7!.l24!.relays[i]!.pct = pct;
      const is = ix.map((i) => Math.round(SC.l24.ctA[i]! * pct / 100));
      return accept(s, 'setRelayPickup', 'ch7.relay.pickupOk', { relay: String(relay), pct, is: is.join(' / ') });
    },
    /** L24: the time multiplier setting of one relay (0.025-1.2 in steps of 0.025). */
    setRelayTms: (s, relay: unknown, tms: unknown) => {
      const e = here(s, 'L24'); if (e) return e;
      const ix = relayIdx(relay); if (!ix) return reject('ch7.relay.unknown', { id: String(relay) });
      const [lo, hi] = SC.l24.tmsRange;
      if (!isNum(tms) || tms < lo - 1e-9 || tms > hi + 1e-9 || Math.abs(tms / 0.025 - Math.round(tms / 0.025)) > 1e-6) return reject('ch7.relay.tms', { tms: String(tms), lo, hi });
      const g = listed(s, 'setRelayTms', tms); if (g) return g;
      for (const i of ix) s.ch7!.l24!.relays[i]!.tms = tms;
      return accept(s, 'setRelayTms', 'ch7.relay.tmsOk', { relay: String(relay), tms });
    },

    /** L25: the protection relay at the plant end of the line (an IDMT overcurrent setting or a distance zone). */
    setRelayType: (s, id: unknown) => {
      const e = here(s, 'L25'); if (e) return e;
      if (typeof id !== 'string' || !SC.l25.relays[id]) return reject('ch7.relayType.unknown', { id: String(id), list: Object.keys(SC.l25.relays).join(', ') });
      const g = listed(s, 'setRelayType', id); if (g) return g;
      s.ch7!.l25!.relay = id;
      const r = SC.l25.relays[id]!;
      return accept(s, 'setRelayType', 'ch7.relayType.ok', { id, kind: t(r.kind === 'idmt' ? 'ch7.relayKind.idmt' : 'ch7.relayKind.distance'), total: price(s) });
    },
    /** L25: the breaker's interrupting time in cycles (2, 3 or 5). */
    setBreakerCycles: (s, n: unknown) => {
      const e = here(s, 'L25'); if (e) return e;
      if (!isNum(n) || !SC.l25.breakerCycles.includes(n)) return reject('ch7.cycles.bad', { n: String(n), list: SC.l25.breakerCycles.join(', ') });
      s.ch7!.l25!.cycles = n;
      return accept(s, 'setBreakerCycles', 'ch7.cycles.ok', { n, ms: Math.round(n / SC.l25.f0 * 1000), f0: SC.l25.f0, total: price(s) });
    },
    /** L25: auto-reclose on (true) or off (false). */
    setAutoReclose: (s, on: unknown) => {
      const e = here(s, 'L25'); if (e) return e;
      if (typeof on !== 'boolean') return reject('act.arg', { name: 'on', expected: t('exp.true_or_false') });
      s.ch7!.l25!.reclose = on;
      return accept(s, 'setAutoReclose', on ? 'ch7.reclose.on' : 'ch7.reclose.off', { dead: SC.l25.recloseDeadS, total: price(s) });
    },

    /** L26: commit a thermal plant from `startHour` to `endHour` (0-24); start = end switches it off for the day. */
    setCommitment: (s, plant: unknown, startHour: unknown, endHour: unknown) => {
      const e = here(s, 'L26'); if (e) return e;
      if (typeof plant !== 'string' || !PLANTS.includes(plant)) return reject('ch7.plant.unknown', { id: String(plant), list: PLANTS.join(', ') });
      if (!isNum(startHour) || !isNum(endHour) || startHour < 0 || endHour > 24 || startHour > endHour || !Number.isInteger(startHour) || !Number.isInteger(endHour)) return reject('ch7.window.bad', { s: String(startHour), e: String(endHour) });
      s.ch7!.l26!.windows[plant] = [startHour, endHour] as Window;
      const p = SC.l26.plants[plant]!;
      return accept(s, 'setCommitment', startHour === endHour ? 'ch7.window.off' : 'ch7.window.ok', { plant: t(`ch7.plant.${plant}`), s: startHour, e: endHour, warm: p.startH, cost: d.money(s, p.startCost * s.ch7!.money) });
    },
    /** L26: how the day's dispatch is computed: 'merit' (cheapest first), 'lambda' (equal incremental cost) or 'corridor' (equal lambda with the 220 kV corridor in the model). */
    setDispatchMode: (s, mode: unknown) => {
      const e = here(s, 'L26'); if (e) return e;
      if (mode !== 'merit' && mode !== 'lambda' && mode !== 'corridor') return reject('ch7.mode.bad', { mode: String(mode) });
      const g = listed(s, 'setDispatchMode', mode); if (g) return g;
      s.ch7!.l26!.mode = mode as DispatchMode;
      price(s);
      return accept(s, 'setDispatchMode', `ch7.mode.${mode}.ok`, {});
    },

    /** L27: tonight's dispatch of the three units, MW each (must add up to demand and stay inside each unit's limits to pass). */
    setDispatch3: (s, p1: unknown, p2: unknown, p3: unknown) => {
      const e = here(s, 'L27'); if (e) return e;
      if (![p1, p2, p3].every(isNum)) return reject('act.arg', { name: 'p1, p2, p3', expected: t('exp.a_number_of_mw') });
      const g = listed(s, 'setDispatch3', [p1, p2, p3].join('/')); if (g) return g;
      s.ch7!.l27!.dispatch = [p1 as number, p2 as number, p3 as number];
      price(s);
      const sum = (p1 as number) + (p2 as number) + (p3 as number);
      return accept(s, 'setDispatch3', 'ch7.dispatch.ok', { sum: r1(sum), need: SC.l27.ed.demandMW });
    },
  };
}

export type { RelaySetting };
