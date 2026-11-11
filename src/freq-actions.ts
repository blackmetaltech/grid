// Chapter 6 actions (frequency & renewables): keeping a unit spinning for reserve or inertia, putting a battery on frequency response, setting a store's operator clock
// (charge and discharge windows), shifting irrigation pumps to the sun, and the ride-through upgrade of legacy rooftop PV. Kept in their own file so the shared actions.ts stays
// untouched. Money is in the pack's currency: a spun unit costs what it burns (its start-up and the fuel at its minimum for the shift, for a year of such days), the upgrade a share of the pack's PV price.
import type { ActionFn, ActionResult } from '@core/kit';
import { t } from './i18n';
import { BLOCKS_PER_DAY, type GridState } from './types';
import type { CatalogueView } from './sim/build';
import { isDispatchable } from './sim/netbuild';
import { blockCost } from './sim/dispatch';

type Params = Record<string, string | number>;
export interface FreqActionDeps { cat: (s: GridState) => CatalogueView; money: (s: GridState, amount: number) => string }

/** A spun unit's bill is a year of such evenings: the start-up and the shift's fuel at minimum load, for every day of the year. */
export const YEAR_DAYS = 365;
const LOG_CAP = 200;
const accept = (s: GridState, name: string, key: string, params: Params = {}): ActionResult => {
  s.actionLog.push({ tick: s.tick, name, key });
  if (s.actionLog.length > LOG_CAP) s.actionLog.splice(0, s.actionLog.length - LOG_CAP);
  return { ok: true, message: t(key, params), key, params };
};
const reject = (key: string, params: Params = {}): ActionResult => ({ ok: false, message: t(key, params), key, params });
const isStr = (x: unknown): x is string => typeof x === 'string' && x.length > 0;
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** Irrigation pumps' daily shape as fractions of their peak: the farm feeder's supply blocks 00-02 and 17-21 (they run into the evening peak) or four hours in the sun, 10:00-14:00 (real practice on solar agricultural feeders). */
export function pumpShape(when: 'night' | 'noon'): { p: number[]; q: number[] } {
  const p: number[] = [], q: number[] = [];
  for (let b = 0; b < BLOCKS_PER_DAY; b++) {
    const h = b / 4;
    const on = when === 'night' ? (h < 2 || (h >= 17 && h < 21)) : h >= 10 && h < 14;
    p.push(on ? 1 : 0.05); q.push(on ? 0.484 : 0.024);   // tan(acos 0.9) = 0.484
  }
  return { p, q };
}

/** The fuel a unit burns at its minimum output for `hours`, in pack currency (the price of keeping it spinning). */
export function spinFuel(u: GridState['units'][number], hours: number): number {
  return blockCost(u.cost, u.pMin, u.vomPerMWh, 0, true) / 0.25 * hours;
}

export function buildFreqActions(d: FreqActionDeps): Record<string, ActionFn<GridState>> {
  return {
    /** Keep a unit spinning from now to the end of the shift: it commits (a cold one starts, which takes its start time) and its start-up plus the fuel at minimum load for the shift is the bill. */
    spinUnit: (s, unitId: unknown) => {
      if (!isStr(unitId)) return reject('act.arg', { name: 'unitId', expected: t('exp.a_unit_id') });
      const u = s.units.find((x) => x.id === unitId);
      if (!u) return reject('act.unknownId', { what: t('what.unit'), id: unitId });
      if (u.kind === 'synccon') {   // a condenser burns no fuel (1.5 % aux losses, ignored) and runs the whole shift: it is on the moment it is spun up
        u.online = true;
        return accept(s, 'spinUnit', 'act.spin.condenser', { id: unitId, mva: Math.round(u.mva) });
      }
      if (!isDispatchable(u)) return reject('act.commit.nonThermal', { id: unitId, kind: u.kind });
      if (u.commit.schedule.length < BLOCKS_PER_DAY) u.commit.schedule = new Array<number>(BLOCKS_PER_DAY).fill(-1);
      if (u.commit.schedule[s.clock.block] === 1 && u.commit.schedule[BLOCKS_PER_DAY - 1] === 1) return reject('act.spin.already', { id: unitId });
      for (let b = s.clock.block; b < BLOCKS_PER_DAY; b++) u.commit.schedule[b] = 1;
      const left = s.rules.horizonBlocks !== null ? Math.max(1, s.rules.horizonBlocks - (s.tick - s.levelStart)) : BLOCKS_PER_DAY - s.clock.block;
      const cost = ((s.rules as { finale?: unknown }).finale ? 1 : YEAR_DAYS) * ((u.online ? 0 : u.startCost) + spinFuel(u, left / 4));   // L28: the fuel burned at minimum load for the hours spun (the three-day run), not a year of such days
      s.budget.spent += cost;
      return accept(s, 'spinUnit', 'act.spin.ok', { id: unitId, mw: Math.round(u.pMax), min: Math.round(u.pMin), cost: d.money(s, cost) });
    },
    /** Put a battery on frequency response: it holds its charge (no arbitrage) and answers a frequency drop in 200 ms (grid-following) or 50 ms (grid-forming). */
    setFfr: (s, storageId: unknown) => {
      if (!isStr(storageId)) return reject('act.arg', { name: 'storageId', expected: t('exp.a_storage_id') });
      const b = s.storage.find((x) => x.id === storageId);
      if (!b) return reject('act.unknownId', { what: t('what.storage'), id: storageId });
      b.mode = 'ffr'; b.schedule = null;
      return accept(s, 'setFfr', 'act.ffr.ok', { id: storageId, mw: Math.round(b.mw) });
    },
    /** Operator clock of a store: charge between two hours, discharge between two (hours of the day, whole quarters); the rest of the day it rests. */
    setStoreClock: (s, storageId: unknown, chargeFrom: unknown, chargeTo: unknown, dischargeFrom: unknown, dischargeTo: unknown) => {
      if (!isStr(storageId)) return reject('act.arg', { name: 'storageId', expected: t('exp.a_storage_id') });
      const b = s.storage.find((x) => x.id === storageId);
      if (!b) return reject('act.unknownId', { what: t('what.storage'), id: storageId });
      const hs = [chargeFrom, chargeTo, dischargeFrom, dischargeTo];
      if (!hs.every((h) => isNum(h) && h >= 0 && h <= 24)) return reject('act.clock.hours', { v: hs.join(', ') });
      const [c0, c1, d0, d1] = hs as number[];
      if (c1! <= c0! && d1! <= d0!) return reject('act.clock.hours', { v: hs.join(', ') });
      const sched = new Array<number>(BLOCKS_PER_DAY).fill(0);
      for (let k = 0; k < BLOCKS_PER_DAY; k++) { const h = k / 4; if (h >= c0! && h < c1!) sched[k] = -b.mw; else if (h >= d0! && h < d1!) sched[k] = b.mw; }
      b.mode = 'schedule'; b.schedule = sched;
      return accept(s, 'setStoreClock', 'act.clock.ok', { id: storageId, c0: c0!, c1: c1!, d0: d0!, d1: d1! });
    },
    /** Move an irrigation pump load to the solar hours ('noon') or back to its night supply blocks ('night'): a tariff change, free. */
    shiftLoad: (s, loadId: unknown, when: unknown) => {
      if (!isStr(loadId)) return reject('act.arg', { name: 'loadId', expected: t('exp.a_load_id') });
      const l = s.loads.find((x) => x.id === loadId);
      if (!l) return reject('act.unknownId', { what: t('what.load'), id: loadId });
      if (l.class !== 'agricultural') return reject('act.shift.notPump', { id: loadId });
      if (when !== 'noon' && when !== 'night') return reject('act.arg', { name: 'when', expected: t('exp.noon_or_night') });
      l.shape = pumpShape(when);
      return accept(s, 'shiftLoad', 'act.shift.ok', { id: loadId, when: t(when === 'noon' ? 'act.shift.noon' : 'act.shift.night') });
    },
    /** Fit ride-through to the legacy rooftop inverters (firmware and contactors): they stop tripping on RoCoF. Costs a share of the pack's PV price per kW. */
    upgradeRideThrough: (s) => {
      const ids = s.rules.derLegacyIds ?? [];
      if (ids.length === 0) return reject('act.ride.none');
      const mw = s.units.filter((u) => ids.includes(u.id)).reduce((a, u) => a + u.pMax, 0);
      const pv = d.cat(s).generator('pv-100');
      const cost = 0.06 * (pv?.capexPerKw ?? 0) * mw * 1000;
      s.budget.spent += cost;
      s.rules.derLegacyIds = []; s.metrics.track.rideFitted = 1;
      return accept(s, 'upgradeRideThrough', 'act.ride.ok', { mw: Math.round(mw), cost: d.money(s, cost) });
    },
  };
}
