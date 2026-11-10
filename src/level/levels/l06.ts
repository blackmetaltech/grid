// L06 Exam Bridge: The Town Line (DESIGN 2.6, chapter 2, kind 'bench', textbook mode): NCERT's classic. 800 kW over a 15 km two-wire line at 0.5 ohm/km per wire (15 ohm loop),
// one phase, unity power factor, ideal transformers. Predict the loss at the generator's 4000 V (600 kW, oracle AC-15), then pick the step-up ratio that keeps it at 2 % or less
// (40 kV loses 6 kW, AC-16). A bench rather than a grid solve: the textbook answers are closed form and the NR load flow would give non-ideal numbers (src/level/ch2/town.ts).
import type { Action } from '@core/kit';
import { freshTownBench } from '../ch2/bench';
import { TOWN, predict4kvKw, townNumbers } from '../ch2/town';
import type { GridLevelSpec } from '../spec';
import type { GridState } from '../../types';

const run = (s: Readonly<GridState>): boolean => s.tick > s.levelStart;
const ratio = (r: number): Action[] => (r === 1 ? [] : [{ name: 'setLineRatio', args: [r] }]);

export const L06: GridLevelSpec = {
  id: 'L06', kind: 'bench', chapter: 2, titleKey: 'level.L06.title', briefKey: 'level.L06.brief', concepts: ['transmission-loss', 'transformer-ratio', 'textbook-mode'],
  startBlock: 72, horizonBlocks: 8, maxTicks: 12,
  allowed: { actions: ['setLineRatio', 'setTransformerKva'], parts: {} },
  sites: [
    { id: 'ratio', options: [1, 2, 5, 6, 7, 8, 10, 15, 20].map((r) => ({ id: `r${r}`, actions: ratio(r) })) },
    { id: 'kva', options: [630, 1000, 1250, 1600].map((k) => ({ id: `kva${k}`, actions: [{ name: 'setTransformerKva', args: [k] }] })) },
  ],
  thresholds: { lossMaxPct: TOWN.lossMaxPct, predTolPct: 2 },
  decisive: { key: 'lossPct', limit: 'lossMaxPct', dir: 'max' },
  star3: [{ key: 'predErrPct', max: 'predTolPct' }],
  story: { placeKey: 'level.L06.place', lineKeys: ['level.L06.story1', 'level.L06.story2'], lessonKey: 'level.L06.lesson' },
  brownoutLoses: true, blackoutLoses: false, stars: true, histogram: 'capex',
  naive: { actions: [], failKind: 'brownout' },
  lesson: [...ratio(10), { name: 'setTransformerKva', args: [1000] }],
  // the cheapest pair that passes: 7:1 (28 kV, loss 1.53 %) on 1000 kVA units (800 kW is 80 % loaded), and the step 1 prediction of 600 kW
  reference: [...ratio(7), { name: 'setTransformerKva', args: [1000] }, { name: 'predict', args: [TOWN.predictId, predict4kvKw(), 'kW'] }],
  frozen: { global: { budget: 84000, starA: 72250.62, starB: 65800.76 }, in: { budget: 8500000, starA: 7306343.76, starB: 6654101.93 } },
  coach: [
    { id: 'predict', textKey: 'coach.L06.predict', whyKey: 'coach.L06.predict.why', done: (s) => s.metrics.predictions.some((p) => p.id === TOWN.predictId) },
    { id: 'ratio', textKey: 'coach.L06.ratio', whyKey: 'coach.L06.ratio.why', done: (s) => (s.bench?.town?.ratio ?? 1) > 1 },
    { id: 'loss', textKey: 'coach.L06.loss', whyKey: 'coach.L06.loss.why', done: (s) => (s.bench?.town ? townNumbers(s.bench.town).ok : false) },
    { id: 'run', textKey: 'coach.L06.run', whyKey: 'coach.L06.run.why', done: run },
  ],
  place: (s, sc) => {
    const dt = sc.cat.transformer('dt-400')!;
    s.bench = freshTownBench(dt.price / (dt.mva * 1000));   // pack currency per kVA of distribution transformer
  },
};
