// L20 Sun Goes Down (DESIGN 2.6 chapter 6, a grid level): the duck curve. A desert region with 3 GW of single-axis solar and an twelve-unit coal fleet, one whole day (00:00-24:00).
// Noon: the sun covers most of the demand and the coal units that must stay on (technical minimum) force the plant to be curtailed. Dusk: the sun leaves in two hours while
// the evening peak climbs, the net load ramps at about 30 MW/min, and the coal fleet (1.5 %/min) cannot follow: the shortfall is a frequency excursion. The player adds peakers,
// stores (pumped hydro and batteries run on an operator clock: charge in the sun, discharge at dusk) and shifts the irrigation pumps to noon.
import type { Action } from '@core/kit';
import type { GridLevelSpec } from '../spec';
import { place } from '../spec';
import { BLOCKS_PER_DAY } from '../../types';
import { freqLesson, freqTry } from '../ch6-text';
import { pumpShape } from '../../freq-actions';

/** Block at which the plan orders units 7-9 (13:45; a coal unit is on the grid 2 h 30 min later). */
export const B2 = 55;
export const COAL_N = 9, PV_MW = 3000, PUMPS_MW = 600;
/** Evening-peaking demand of the towns (MW, before the irrigation pumps) by hour: night trough, morning, hot afternoon, the 19:00 peak. */
const HOURS = [0, 5, 7, 10, 14, 17, 19, 22, 24], MW = [3000, 2600, 3000, 3500, 3800, 4200, 4800, 4300, 3000];
export const townsMW = (h: number): number => {
  for (let i = 1; i < HOURS.length; i++) if (h <= HOURS[i]!) return MW[i - 1]! + ((MW[i]! - MW[i - 1]!) * (h - HOURS[i - 1]!)) / (HOURS[i]! - HOURS[i - 1]!);
  return MW[MW.length - 1]!;
};
const townsShape = (): { p: number[]; q: number[] } => {
  const peak = Math.max(...MW);
  const p = Array.from({ length: BLOCKS_PER_DAY }, (_, b) => townsMW(b / 4) / peak);
  return { p, q: p.map((x) => x * 0.33) };
};

const clockDefault = { charge: [10, 14], discharge: [15, 21] } as const;
/** `n` peakers, each ordered on at 14:00 (a gas turbine is on the grid a block later; coal needs two and a half hours). Unit ids U11.. */
export const peakers = (n: number): Action[] => Array.from({ length: n }, (_, i) => [{ name: 'placeUnit', args: ['ocgt-105', 'B1', 105] }, { name: 'commit', args: [`U${11 + i}`, true, 56] }]).flat();
/** `n` stores of one catalogue row, each on the operator clock of the sun (S1.. in the order they are placed). */
export const stores = (row: string, n: number, first: number): Action[] => Array.from({ length: n }, (_, i) => [{ name: 'placeStorage', args: ['B1', row] }, { name: 'setStoreClock', args: [`S${first + i}`, ...clockDefault.charge, ...clockDefault.discharge] }]).flat();
export const shift: Action[] = [{ name: 'shiftLoad', args: ['L2', 'noon'] }];

export const L20: GridLevelSpec = {
  id: 'L20', kind: 'grid', chapter: 6, titleKey: 'level.L20.title', briefKey: 'level.L20.brief', concepts: ['duck-curve', 'ramp-rate', 'minimum-stable-load', 'storage-arbitrage', 'curtailment'],
  startBlock: 0, horizonBlocks: 96, maxTicks: 100,
  allowed: {
    actions: ['placeUnit', 'spinUnit', 'commit', 'placeStorage', 'setStoreClock', 'shiftLoad', 'demolish'],
    parts: { placeUnit: ['ocgt-105'], placeStorage: ['psp-250', 'bess-4h-50', 'bess-2h-50'] },
  },
  sites: [
    { id: 'peakers', options: [0, 2, 4].map((n) => ({ id: n === 0 ? 'no-peakers' : `ocgt-${n}`, actions: peakers(n) })) },
    { id: 'storage', options: ([[0, 0], [1, 0], [2, 0], [0, 2], [0, 4], [1, 2], [2, 4]] as const).map(([p, b]) => ({ id: p + b === 0 ? 'no-storage' : `psp-${p}+bess-${b}`, actions: [...stores('psp-250', p, 1), ...stores('bess-4h-50', b, 1 + p)] })) },
    { id: 'pumps', options: [{ id: 'night-pumps', actions: [] }, { id: 'noon-pumps', actions: shift }] },
  ],
  // tuned per pack on the coal technical minimum (40 % `global`, 55 % `in`): curtailment <= 5 % / 10 %, blocks in the standard range >= 95 % / 90 % (at its minimum a coal unit cannot hold the frequency, so the `in` fleet sits outside the band for longer)
  thresholds: { inRangeMinPct: { symbol: 'coalMinPct', scale: -1 / 3, add: 95 + 40 / 3 }, maxDevHz: 0.2, curtailMaxPct: { symbol: 'coalMinPct', scale: 1 / 3, add: 5 - 40 / 3 } },
  decisive: null,
  star3: [{ key: 'curtailPct', max: 'curtailMaxPct' }],
  brownoutLoses: false, blackoutLoses: true, stars: true, histogram: 'capex',
  extraRules: (th) => ({ freqTrack: true, minInRangePct: th.inRangeMinPct, maxDevHz: th.maxDevHz }),
  lessonText: (s, p, th) => freqLesson(s, p, th, 'L20'),
  tryText: (s, p, th) => freqTry(s, p, th, 'L20'),
  story: { placeKey: 'level.L20.place', lineKeys: ['level.L20.story1', 'level.L20.story2', 'level.L20.story3'], lessonKey: 'level.L20.lesson' },
  naive: { actions: [], failKind: 'freqBand' },
  // lesson: the pumps move to noon (free), two peakers and one pumped-hydro unit; reference: the same pumps and four peakers, the cheapest design that passes in both packs
  lesson: [...peakers(2), ...stores('psp-250', 1, 1), ...shift],
  reference: [...peakers(4), ...shift],
  // frozen from the bot population (42 designs per region, capex only: the day's fuel is the same for every design that passes; budget = 1.1 x the dearer of lesson and reference, rounded up to 2 significant figures)
  frozen: { global: { budget: 1100000000, starA: 802860000, starB: 660690000 }, in: { budget: 30000000000, starA: 23875000000, starB: 21862500000 } },
  coach: [
    // 1.8: build first (a tester followed the old "press Run and watch" step and got an hour of flat night at 50 Hz, then never built)
    { id: 'add-flex', textKey: 'coach.L20.flex', whyKey: 'coach.L20.flex.why', done: (s) => s.actionLog.some((a) => a.name === 'placeUnit' || a.name === 'placeStorage' || a.name === 'shiftLoad') },
    { id: 'clock', textKey: 'coach.L20.clock', whyKey: 'coach.L20.clock.why', done: (s) => s.actionLog.some((a) => a.name === 'setStoreClock' || a.name === 'shiftLoad') },
    { id: 'run', textKey: 'coach.L20.run', whyKey: 'coach.L20.run.why', done: (s) => s.status !== 'playing' },
  ],
  place: (s, sc) => {
    const A = (name: string, ...a: unknown[]): void => place(sc, s, name, ...a);
    A('placeBus', 4, 4, 400, 'gen', 1.0);
    for (let i = 0; i < COAL_N; i++) A('placeUnit', 'coal-sub-500', 'B1', 500);
    A('placeUnit', 'pv-100', 'B1', PV_MW);
    A('placeLoad', 'B1', 'residential', Math.max(...MW), 0.95);
    A('placeLoad', 'B1', 'agricultural', 1, 0.9);
    s.loads[0]!.shape = townsShape();
    s.loads[1]!.Ppeak = PUMPS_MW; s.loads[1]!.shape = pumpShape('night');
    for (const l of s.loads) l.zip = [0, 0, 1];
    // the day-ahead plan of the control room: six units all day, U7 for the first two night hours, then U7-U9 ordered at 13:45 (on the grid at 16:15). Nine units are in service
    // (three are in overhaul): the plan is sized for the noon trough, and the evening peak with the sun gone is beyond the nine. A coal start takes ten blocks.
    const ON = (a: number, b: number): number[] => Array.from({ length: BLOCKS_PER_DAY }, (_, k) => (k >= a && k < b ? 1 : 0));
    // six units are always on: they cover the night load and their technical minimum (40 % of 500 MW in `global`, 55 % in `in`) is what the sun has to share the noon with
    const n0 = 6;
    const plan = (id: number): number[] => (id <= n0 ? ON(0, BLOCKS_PER_DAY) : id <= 8 ? ON(0, BLOCKS_PER_DAY).map((_, k) => (k < 8 || k >= B2 ? 1 : 0)) : ON(B2, BLOCKS_PER_DAY));
    s.units.filter((u) => u.kind === 'coal').forEach((u, i) => { u.commit.schedule = plan(i + 1); const on = plan(i + 1)[0] === 1; u.online = on; u.P = on ? (townsMW(0) + PUMPS_MW) / Math.max(1, s.units.filter((x, j) => x.kind === 'coal' && plan(j + 1)[0] === 1).length) : 0; });
    s.dispatch.auto = false;
    s.weather.clouds = [{ x: 0, y: 0, radiusTiles: 0.1, opacity: 0, vx: 0, vy: 0 }];   // the desert sky is clear all day
  },
};
