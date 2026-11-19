// L34 Firm Capacity (DESIGN-1.1 B1, Event: distribution; chapter 8 job 4): Brightwater's primary substation, two 20 MVA 33/11 kV transformers, a 30 MVA peak on a 40 C day. Firm capacity = total minus the
// largest unit = 20 MVA. At 18:00 the worst transformer trips; the survivor carries up to 1.5 x its rating (protection), the rest is shed until a bus-section close, a tie transfer or demand response brings it
// back. Each survivor's hot-spot follows IEC 60076-7 (relative ageing rate 2^((theta_h - 98)/6)); over 140 C its own protection trips it and the substation goes dark. Pass: all load back within 3 h and
// the survivor under 140 C. Lamp 3: loss of life of that day at most 1. Engine: src/sim/distrib/thermal-tx.ts, oracle ch8_oracles.py.
import type { Action } from '@core/kit';
import type { GridLevelSpec } from '../spec';
import { placeSubstation, ch8Start } from '../ch8/place';
import { L34 as SC } from '../../sim/ch8/data';
import { ch8TryHint } from '../ch8/queries';

const size = (m: number): Action[] => [{ name: 'setTransformerSize', args: [m] }];
const third = (): Action[] => [{ name: 'addTransformer', args: [true] }];
const bus = (m: string): Action[] => [{ name: 'setBusSection', args: [m] }];
const tie = (k: string): Action[] => [{ name: 'setTransfer', args: [k] }];
const dr = (k: string): Action[] => [{ name: 'setDemandResponse', args: [k] }];
const used = (s: { actionLog: { name: string }[] }, ...names: string[]): boolean => s.actionLog.some((a) => names.includes(a.name));

export const L34: GridLevelSpec = {
  id: 'L34', kind: 'event', chapter: 8, titleKey: 'level.L34.title', briefKey: 'level.L34.brief', concepts: ['firm-capacity', 'n-1', 'hot-spot', 'ageing-rate', 'load-transfer'],
  startBlock: 72, horizonBlocks: null, maxTicks: 2,
  allowed: {
    actions: ['addTransformer', 'setTransformerSize', 'setBusSection', 'setTransfer', 'setDemandResponse'],
    parts: { setTransformerSize: SC.sizes.map(String), setTransfer: ['none', 'manual', 'remote'], setDemandResponse: ['none', 'small', 'large'] },
  },
  sites: [
    { id: 'size', options: SC.sizes.map((m) => ({ id: `${m}`, actions: m === SC.baseMva ? [] : size(m) })) },
    { id: 'third', options: [{ id: 'two', actions: [] }, { id: 'three', actions: third() }] },
    { id: 'bus', options: [{ id: 'manual', actions: [] }, { id: 'auto', actions: bus('auto') }] },
    { id: 'tie', options: [{ id: 'none', actions: [] }, { id: 'manual', actions: tie('manual') }, { id: 'remote', actions: tie('remote') }] },
    { id: 'dr', options: [{ id: 'none', actions: [] }, { id: 'small', actions: dr('small') }, { id: 'large', actions: dr('large') }] },
  ],
  thresholds: { hotMarginMin: 0, lolMax: SC.lolStarDays, lolMid: SC.lolStarDays * 2 },
  decisive: { key: 'hotMarginC', limit: 'hotMarginMin', dir: 'min' },
  // the cheapest single action that passes (a manual tie, 3.4 days of life lost) earns the pass lamp only (DESIGN-1.1 A1)
  star2: [{ key: 'lolDays', max: 'lolMid' }],
  star3: [{ key: 'lolDays', max: 'lolMax' }],
  brownoutLoses: false, blackoutLoses: false, stars: true, histogram: 'capex',
  story: { placeKey: 'level.L34.place', lineKeys: ['level.L34.story1', 'level.L34.story2'], lessonKey: 'level.L34.lesson', lessonKind: 'ch8' },
  tryText: (s) => ch8TryHint(s),
  naive: { actions: [], failKind: 'ch8.overheat' },
  lesson: [...tie('manual'), ...dr('small')],
  reference: [...tie('manual'), ...dr('large')],
  // frozen from the bot population (src/level/population.ts); ch8.test.ts regenerates it and fails on drift > 2 %
  frozen: { global: { budget: 390000, starA: 350000, starB: 350000 }, in: { budget: 32000000, starA: 29050000, starB: 29050000 } },
  coach: [
    { id: 'firm', textKey: 'coach.L34.firm', whyKey: 'coach.L34.firm.why', done: (s) => used(s, 'addTransformer', 'setTransformerSize', 'setBusSection', 'setTransfer', 'setDemandResponse') || s.tick > s.levelStart },
    { id: 'relief', textKey: 'coach.L34.relief', whyKey: 'coach.L34.relief.why', done: (s) => used(s, 'setTransfer', 'setDemandResponse', 'addTransformer', 'setTransformerSize') || s.tick > s.levelStart },
    { id: 'run', textKey: 'coach.L34.run', whyKey: 'coach.L34.run.why', done: (s) => s.tick > s.levelStart || s.status !== 'playing' },
  ],
  place: (s, sc) => { ch8Start(s, sc, 'L34'); placeSubstation(s, sc); },
};
