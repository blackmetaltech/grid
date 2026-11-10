// L12 Over the Hill (DESIGN 2.6, chapter 4, event): Kestrel Falls hydro (2 x 100 MW, H = 3 s) sends 200 MW over two 300 km 220 kV Zebra circuits; at 19:30 one
// circuit is lost. The player sets the AVR (E' follows), series capacitors, a third circuit or a re-dispatch; the engine runs the swing (classical SMIB, RK4).
// Oracle numbers: tools/oracles/ch4_oracles.py (X'd + GSU + line = 0.349 pu pre, 0.478 post at V_ref 1.05: P_max 3.40 -> 2.48 pu, post angle 53.6 deg).
import type { Action } from '@core/kit';
import type { GridLevelSpec } from '../spec';
import { freshL12 } from '../ch4/state';
import { REDUCE_STEPS_MW, SERIES_PCT, VREF_STEPS } from '../../sim/ch4/data';
import { hydroNumbers } from '../../sim/ch4/hydro';
import { hydroBuildOf } from '../../sim/ch4/systems';
import type { GridState } from '../../types';

export const EVENT_BLOCK = 78;   // 19:30
const A = (name: string, ...args: unknown[]): Action => ({ name, args });
const set = (v: number, series: number, third: boolean, red: number): Action[] => [
  ...(v !== 0.9 ? [A('setAvrRef', v)] : []), ...(series ? [A('setSeriesComp', series)] : []), ...(third ? [A('addCircuit', true)] : []), ...(red ? [A('setRedispatch', red)] : []),
];
const l = (s: Readonly<GridState>) => s.ch4?.l12;

export const L12: GridLevelSpec = {
  id: 'L12', kind: 'event', chapter: 4, titleKey: 'level.L12.title', briefKey: 'level.L12.brief', concepts: ['power-angle', 'excitation', 'synchronism', 'series-compensation'],
  startBlock: 72, horizonBlocks: 10, maxTicks: 14,
  allowed: { actions: ['setAvrRef', 'setSeriesComp', 'addCircuit', 'setRedispatch'], parts: { setAvrRef: [...VREF_STEPS], setSeriesComp: [...SERIES_PCT], setRedispatch: [...REDUCE_STEPS_MW] } },
  sites: [
    { id: 'excitation', options: VREF_STEPS.map((v) => ({ id: `v${v.toFixed(2)}`, actions: v !== 0.9 ? [A('setAvrRef', v)] : [] })) },
    { id: 'series', options: SERIES_PCT.map((p) => ({ id: `s${p}`, actions: p ? [A('setSeriesComp', p)] : [] })) },
    { id: 'circuit', options: [{ id: 'two', actions: [] }, { id: 'three', actions: [A('addCircuit', true)] }] },
    { id: 'redispatch', options: REDUCE_STEPS_MW.map((m) => ({ id: `r${m}`, actions: m ? [A('setRedispatch', m)] : [] })) },
  ],
  thresholds: { oosMax: 0, peakDeltaMaxDeg: 70 },
  decisive: { key: 'outOfStep', limit: 'oosMax', dir: 'max' },
  star3: [{ key: 'peakDeltaDeg', max: 'peakDeltaMaxDeg' }],
  story: { placeKey: 'level.L12.place', lineKeys: ['level.L12.story1', 'level.L12.story2'], lessonKey: 'level.L12.lesson' },
  brownoutLoses: false, blackoutLoses: false, stars: true, histogram: 'capex',
  // naive: nothing touched: the AVR is on its night set-point (0.90 pu), E' is too low and the first swing passes the unstable point
  naive: { actions: [], failKind: 'machine' },
  // lesson: raise the excitation to 1.05 pu and put 30 % series capacitors on both circuits
  lesson: set(1.05, 30, false, 0),
  // reference: the cheapest design of the population that keeps the first swing under 70 degrees
  reference: set(1.05, 0, false, 20),
  // frozen from the bot population (src/level/population.ts); tools/oracles/ch4_oracles.py replays the circuit independently; level.test.ts fails on drift > 2 %
  frozen: { global: { budget: 1200000, starA: 480000, starB: 480000 }, in: { budget: 11000000, starA: 4320000, starB: 4320000 } },
  coach: [
    { id: 'excite', textKey: 'coach.L12.excite', whyKey: 'coach.L12.excite.why', done: (s) => (l(s)?.vref ?? 0.9) > 0.9 },
    { id: 'margin', textKey: 'coach.L12.margin', whyKey: 'coach.L12.margin.why', done: (s) => hydroNumbers(hydroBuildOf(s)).pmaxPost > 2.2 },
    { id: 'run', textKey: 'coach.L12.run', whyKey: 'coach.L12.run.why', done: (s) => s.tick > s.levelStart },
    { id: 'swing', textKey: 'coach.L12.swing', whyKey: 'coach.L12.swing.why', done: (s) => s.status !== 'playing' },
  ],
  place: (s, sc) => { s.ch4 = freshL12(sc, EVENT_BLOCK); },
};
