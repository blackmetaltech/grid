// L04 Spin the Alternator (DESIGN 2.6, chapter 2, kind 'bench'): the waterfall's micro-hydro set turns at the 500 rpm its head gives it, and the AC village wants 230 V rms
// (peak 325 V) at 50 Hz. The player picks poles (f = p N / 120), turns, field and coil area (e0 = N B A w). Closed form (src/level/ch2/machine.ts); the oracle
// numbers are in tools/oracles/ch2_expected.json (ch2_oracles.py). The decisive quantity is the share of the tolerance band the machine uses (<= 1 passes).
import type { Action } from '@core/kit';
import { freshMachineBench, L04_PREDICT_ID } from '../ch2/bench';
import { machineNumbers, MACHINE } from '../ch2/machine';
import type { GridLevelSpec } from '../spec';
import type { GridState } from '../../types';

const run = (s: Readonly<GridState>): boolean => s.tick > s.levelStart;
const live = (s: Readonly<GridState>) => (s.bench?.machine ? machineNumbers(s.bench.machine) : null);

/** The bot population's winding site: for every field and coil area of a coarse grid, the whole number of turns that makes e0 right, and 0.8x / 1.25x of it (which miss). */
const NBA_TARGET = (MACHINE.voltageRms * Math.sqrt(2)) / (2 * Math.PI * 50);
const FIELDS = [0.5, 0.6, 0.7, 0.8, 0.9], AREAS = [0.03, 0.05, 0.08, 0.1, 0.12];
const winding = (n: number, b: number, a: number): { id: string; actions: Action[] } => ({ id: `N${n}-B${b}-A${a}`, actions: [{ name: 'setTurns', args: [n] }, { name: 'setField', args: [b] }, { name: 'setArea', args: [a] }] });
const WINDINGS = FIELDS.flatMap((b) => AREAS.flatMap((a) => { const n0 = NBA_TARGET / (b * a); return [...new Set([Math.max(10, Math.round(n0)), Math.max(10, Math.round(n0 * 0.8)), Math.max(10, Math.round(n0 * 1.25))])].sort((x, y) => x - y).map((n) => winding(n, b, a)); }));

export const L04: GridLevelSpec = {
  id: 'L04', kind: 'bench', chapter: 2, titleKey: 'level.L04.title', briefKey: 'level.L04.brief', concepts: ['emf', 'rms-peak', 'alternator-frequency'],
  startBlock: 72, horizonBlocks: 8, maxTicks: 12,
  allowed: { actions: ['setPoles', 'setTurns', 'setField', 'setArea'], parts: {} },
  sites: [
    { id: 'poles', options: [4, 8, 10, 12, 14, 20].map((p) => ({ id: `p${p}`, actions: [{ name: 'setPoles', args: [p] }] })) },
    { id: 'winding', options: WINDINGS },
  ],
  thresholds: { bandMax: 1, vTolPct: MACHINE.voltageTolPct, fTolPct: MACHINE.freqTolPct, predTolPct: 1 },   // the work order lists the two tolerances; bandMax (the share of them used) is the engine's decisive number
  decisive: { key: 'bandUsed', limit: 'bandMax', dir: 'max' },
  star3: [{ key: 'predErrPct', max: 'predTolPct' }],
  story: { placeKey: 'level.L04.place', lineKeys: ['level.L04.story1', 'level.L04.story2'], lessonKey: 'level.L04.lesson' },
  brownoutLoses: true, blackoutLoses: false, stars: true, histogram: 'capex',
  // naive: the right turns, field and area for 230 V at 50 Hz, on 4 poles: the shaft makes 16.7 Hz and the voltage falls with it (e0 = N B A w)
  naive: { actions: [{ name: 'setPoles', args: [4] }, { name: 'setTurns', args: [30] }, { name: 'setField', args: [0.7] }, { name: 'setArea', args: [0.05] }], failKind: 'brownout' },
  lesson: [{ name: 'setPoles', args: [12] }, { name: 'setTurns', args: [30] }, { name: 'setField', args: [0.7] }, { name: 'setArea', args: [0.05] }],
  // the cheapest design of the population that keeps a margin inside the band: fewer turns on a bigger coil in a stronger field, and a prediction within 1 %
  reference: [{ name: 'setPoles', args: [12] }, { name: 'setTurns', args: [13] }, { name: 'setField', args: [0.8] }, { name: 'setArea', args: [0.1] }, { name: 'predict', args: [L04_PREDICT_ID, 327, 'V'] }],
  // frozen from the bot population (src/level/population.ts); tools/oracles/ch2_oracles.py replays the rule independently; level.test.ts fails on drift > 2 %
  frozen: { global: { budget: 1300, starA: 1018.14, starB: 783.83 }, in: { budget: 12000, starA: 9163.25, starB: 7054.45 } },
  coach: [
    { id: 'poles', textKey: 'coach.L04.poles', whyKey: 'coach.L04.poles.why', done: (s) => live(s)?.fOk === true },
    { id: 'volts', textKey: 'coach.L04.volts', whyKey: 'coach.L04.volts.why', done: (s) => live(s)?.vOk === true },
    { id: 'predict', textKey: 'coach.L04.predict', whyKey: 'coach.L04.predict.why', done: (s) => s.metrics.predictions.some((p) => p.id === L04_PREDICT_ID) },
    { id: 'run', textKey: 'coach.L04.run', whyKey: 'coach.L04.run.why', done: run },
  ],
  place: (s, sc) => { s.bench = freshMachineBench(sc.params.f0, sc.bench.cable.perMm2PerM); },
};
