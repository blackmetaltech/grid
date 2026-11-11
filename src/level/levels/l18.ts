// L18 Exam Bridge: Gauss-Seidel (DESIGN 2.6, chapter 5, Bench on the map). The textbook 3-bus system of oracles PS-14/15/16 stands on the state ring: slack 1.05 at B1, a PQ load at B2,
// a 200 MW generator at B3 held at 1.05 pu. The bridge predictions (V2 after GS iteration 1, the converged |V2|, the slack's P) are checked against the engine's own GS and Newton
// runs of the textbook data (examTruth). The task: tonight 100 MW + j50 Mvar joins B2. Keep |V2| >= 1.00 and every line within its rating at the least cost, using the B3 set-point
// (it runs out of reactive range: Qmax 90 Mvar), a capacitor at B2, or a re-dispatch of B3 (a design deviation from the printed 60 + j30: that load does not sag V2 below 1.00).
import type { Action } from '@core/kit';
import { l18Lesson, l18Try } from '../ch5lessons';
import type { GridLevelSpec } from '../spec';
import { place } from '../spec';
import { EXAM_IDS } from '../../sim/ch5';
import { BLOCKS_PER_DAY } from '../../types';
import { t } from '../../i18n';

export const BASE = { p: 256.6, q: 110.2 }, EXTRA = { p: 100, q: 50 };
export const RATINGS = [180, 100, 230];   // MVA of 1-2, 1-3, 2-3
export const QMAX3 = 90;
const total = BASE.p + EXTRA.p;
const dispatch = (p3: number): Action[] => [{ name: 'setDispatch', args: ['U2', p3, BLOCKS_PER_DAY] }, { name: 'setDispatch', args: ['U1', Math.round(total + 9 - p3), BLOCKS_PER_DAY] }];
const cap = (mvar: number): Action[] => (mvar === 0 ? [] : [{ name: 'placeShunt', args: ['B2', 'cap-220-50', mvar / 50] }, { name: 'setShuntSteps', args: ['C1', mvar / 50] }]);
const vset = (v: number): Action[] => (v === 1.05 ? [] : [{ name: 'setVSet', args: ['B3', v] }]);
/** What a student hands in: the three bridge answers, rounded the way the textbook prints them. */
const PREDICT: Action[] = [{ name: 'predict', args: [EXAM_IDS.gs1, 1.0138, 'pu'] }, { name: 'predict', args: [EXAM_IDS.v2, 1.01334, 'pu'] }, { name: 'predict', args: [EXAM_IDS.pslack, 62.57, 'MW'] }];

export const L18: GridLevelSpec = {
  id: 'L18', kind: 'grid', chapter: 5, titleKey: 'level.L18.title', briefKey: 'level.L18.brief', concepts: ['gauss-seidel', 'newton-raphson', 'pv-bus', 'q-limit'],
  startBlock: 80, horizonBlocks: 8, maxTicks: 12,
  allowed: { actions: ['placeShunt', 'setShuntSteps', 'setVSet', 'setDispatch', 'predict'], parts: { placeShunt: ['cap-220-50'], 'placeShunt.maxSteps': [3] } },
  sites: [
    { id: 'capacitor', options: [0, 50, 100, 150].map((m) => ({ id: m === 0 ? 'none' : `cap${m}`, actions: cap(m) })) },
    { id: 'setpoint', options: [1.05, 1.08].map((v) => ({ id: `v${v}`, actions: vset(v) })) },
    { id: 'redispatch', options: [200, 170, 230].map((p) => ({ id: `p${p}`, actions: p === 200 ? [] : dispatch(p) })) },
    { id: 'predictions', options: [{ id: 'skip', actions: [] }, { id: 'predict', actions: PREDICT }] },
  ],
  // gate: the sag of |V2| below 1.00 pu in percent, asked to stay under half a percent so the 2 % margin rule has room (a margin of 2 % of 1.00 pu would be a 2 % sag)
  thresholds: { v2Min: 1.0, loadingMax: 1, predHitsMin: 2, sagGatePct: 0.5 },
  decisive: { key: 'v2SagPct', limit: 'sagGatePct', dir: 'max' },
  star3: [{ key: 'predHits', min: 'predHitsMin' }],
  extraRules: (th) => ({ vWatch: { lo: th.v2Min!, hi: 1.2, kv: [132], buses: ['B2'], graceBlocks: 0 }, maxLoading: th.loadingMax!, exam: true }),
  lessonText: (s) => l18Lesson(s), tryText: (s) => l18Try(s),
  story: { placeKey: 'level.L18.place', lineKeys: ['level.L18.story1', 'level.L18.story2', 'level.L18.story3'], lessonKey: 'level.L18.lesson' },
  brownoutLoses: false, blackoutLoses: true, stars: true, histogram: 'capex',
  naive: { actions: vset(1.08), failKind: 'brownout' },
  lesson: cap(100), reference: [...cap(50), ...dispatch(170), ...PREDICT],
  frozen: { global: {budget: 1400000, starA: 1187300, starB: 593650}, in: {budget: 77000000, starA: 70000000, starB: 35000000} },
  coach: [
    { id: 'predict', textKey: 'coach.L18.predict', whyKey: 'coach.L18.predict.why', done: (s) => s.metrics.predictions.length > 0 || s.tick > s.levelStart },
    { id: 'setpoint', textKey: 'coach.L18.setpoint', whyKey: 'coach.L18.setpoint.why', done: (s) => (s.buses.find((b) => b.id === 'B3')?.vSet ?? 1.05) > 1.05 || s.tick > s.levelStart },
    { id: 'cap', textKey: 'coach.L18.cap', whyKey: 'coach.L18.cap.why', done: (s) => s.shunts.length > 0 },
    { id: 'run', textKey: 'coach.L18.run', whyKey: 'coach.L18.run.why', done: (s) => s.status !== 'playing' },
  ],
  place: (s, sc) => {
    const A = (name: string, ...a: unknown[]): void => place(sc, s, name, ...a);
    A('placeBus', 4, 4, 132, 'gen', 1.05); A('placeBus', 12, 12, 132, 'load'); A('placeBus', 4, 20, 132, 'gen', 1.05);
    A('placeUnit', 'ccgt-418', 'B1', 600); A('placeUnit', 'ccgt-418', 'B3', 260);
    for (const [f, t] of [['B1', 'B2'], ['B1', 'B3'], ['B2', 'B3']]) A('stringLine', f, t, 'l132-panther', 1, 10);
    // the textbook per-unit impedances (100 MVA), no line charging, and the line ratings of the task
    const pu: [number, number][] = [[0.02, 0.04], [0.01, 0.03], [0.0125, 0.025]];
    s.branches.forEach((b, i) => { b.r = pu[i]![0]; b.x = pu[i]![1]; b.bc = 0; b.ratingMVA = RATINGS[i]!; });
    s.buses[0]!.name = t('place.L18.slack'); s.buses[1]!.name = t('place.L18.load'); s.buses[2]!.name = t('place.L18.pv');
    A('placeLoad', 'B2', 'industrial', BASE.p + EXTRA.p, 0.9);
    const l = s.loads[0]!, tan = (BASE.q + EXTRA.q) / (BASE.p + EXTRA.p);
    l.zip = [0, 0, 1]; l.shape = { p: new Array<number>(BLOCKS_PER_DAY).fill(1), q: new Array<number>(BLOCKS_PER_DAY).fill(tan) };
    const [u1, u2] = [s.units[0]!, s.units[1]!];
    u1.online = true; u1.pMin = 0; u1.qMax = 1e4; u1.qMin = -1e4;
    u2.online = true; u2.pMin = 150; u2.pMax = 260; u2.qMax = QMAX3; u2.qMin = -QMAX3;
    for (const a of dispatch(200)) A(a.name, ...(a.args as unknown[]));
  },
};
