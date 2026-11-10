// L28 Keep the Lights On (DESIGN 2.6 finale, chapter F, kind 'grid'): Lumen Province, the whole state, three days. Day 1 a heatwave (record peak, voltage stress), Day 2 a wet-season storm
// (a 400 kV line, the largest unit and a 220/132 kV transformer trip, then lightning on Saltmarsh Island's one feeder), Day 3 a holiday of full sun and low demand (over-voltage, low inertia).
// The player spends a reinforcement budget (US$ M by the DESIGN 9.4 rule) on parts the engine already carries: lines, transformers, reactive plant, batteries, reserve and the protection settings.
// Stars: ENS <= 0.1 % of the three days and the island never dark; cost <= A; cost <= B with no energy shed at all, no block outside the standard frequency range and losses <= 3 %.
import type { Action } from '@core/kit';
import type { GridLevelSpec } from '../spec';
import { place } from '../spec';
import { BLOCKS_PER_DAY, type LoadClass } from '../../types';
import type { FinaleDay } from '../../sim/finale';

export const TILE_M = 4000;
export const MAP_W = 100, MAP_H = 44;
export const DAYS = 3;
export const HORIZON = DAYS * BLOCKS_PER_DAY;

interface BusRow { key: string; name: string; kv: number; x: number; y: number; kind: 'gen' | 'load' | 'sub' | 'junction'; vSet?: number }
/** The 26 buses of the state in placement order (ids B1..B26). Tile edge 4 km: the map is 400 x 176 km. */
export const BUSES: BusRow[] = [
  { key: 'redhill', name: 'Redhill 400', kv: 400, x: 10, y: 8, kind: 'gen', vSet: 1.02 },   // lint-ok
  { key: 'capital4', name: 'Capital 400', kv: 400, x: 50, y: 22, kind: 'sub' },   // lint-ok
  { key: 'marlow4', name: 'Marlow 400', kv: 400, x: 32, y: 34, kind: 'gen', vSet: 1.02 },   // lint-ok
  { key: 'eastgate4', name: 'Eastgate 400', kv: 400, x: 78, y: 16, kind: 'sub' },   // lint-ok
  { key: 'westfell4', name: 'Westfell 400', kv: 400, x: 22, y: 18, kind: 'sub' },   // lint-ok
  { key: 'south4', name: 'Southplain 400', kv: 400, x: 58, y: 38, kind: 'sub' },   // lint-ok
  { key: 'gorge', name: 'Gorge hydro 220', kv: 220, x: 6, y: 24, kind: 'gen', vSet: 1.03 },   // lint-ok
  { key: 'windmere', name: 'Windmere wind 220', kv: 220, x: 6, y: 34, kind: 'gen', vSet: 1.0 },   // lint-ok
  { key: 'sunfield', name: 'Sunfield solar 220', kv: 220, x: 50, y: 42, kind: 'gen', vSet: 1.0 },   // lint-ok
  { key: 'capital2', name: 'Capital 220', kv: 220, x: 52, y: 22, kind: 'sub' },   // lint-ok
  { key: 'dc', name: 'Datacentre 220', kv: 220, x: 58, y: 18, kind: 'load' },   // lint-ok
  { key: 'eastgate2', name: 'Eastgate 220', kv: 220, x: 80, y: 18, kind: 'sub' },   // lint-ok
  { key: 'highfell', name: 'Highfell pumped hydro 220', kv: 220, x: 32, y: 8, kind: 'gen', vSet: 1.03 },   // lint-ok
  { key: 'westfell2', name: 'Westfell 220', kv: 220, x: 24, y: 18, kind: 'sub' },   // lint-ok
  { key: 'south2', name: 'Southplain 220', kv: 220, x: 60, y: 36, kind: 'sub' },   // lint-ok
  { key: 'eastgate1', name: 'Eastgate', kv: 132, x: 84, y: 22, kind: 'load' },   // lint-ok
  { key: 'harbour', name: 'Harbour', kv: 132, x: 92, y: 26, kind: 'load' },   // lint-ok
  { key: 'saltmarsh', name: 'Saltmarsh Island', kv: 132, x: 96, y: 36, kind: 'load' },   // lint-ok
  { key: 'westfell1', name: 'Westfell', kv: 132, x: 26, y: 22, kind: 'load' },   // lint-ok
  { key: 'northfield', name: 'Northfield', kv: 132, x: 30, y: 12, kind: 'load' },   // lint-ok
  { key: 'southplain', name: 'Southplain', kv: 132, x: 64, y: 34, kind: 'load' },   // lint-ok
  { key: 'marlowtown', name: 'Marlow', kv: 220, x: 38, y: 38, kind: 'load' },   // lint-ok
  { key: 'dunmore', name: 'Dunmore', kv: 132, x: 72, y: 30, kind: 'gen', vSet: 1.0 },   // lint-ok
  { key: 'riverside', name: 'Riverside', kv: 132, x: 40, y: 14, kind: 'load' },   // lint-ok
  { key: 'ironworks', name: 'Ironworks', kv: 132, x: 28, y: 26, kind: 'load' },   // lint-ok
  { key: 'capital1', name: 'Capital 132', kv: 132, x: 50, y: 25, kind: 'load' },   // lint-ok
];
export const BUS = Object.fromEntries(BUSES.map((b, i) => [b.key, `B${i + 1}`])) as Record<string, string>;

interface LineRow { key: string; from: string; to: string; cat: string; circuits: number }
/** Lines in placement order (ids T1..): the 400 kV ring, the 220 kV net, the 132 kV spurs. Lengths are the straight map distance. */
export const LINES: LineRow[] = [
  { key: 'redhill-westfell', from: 'redhill', to: 'westfell4', cat: 'l400-twinmoose', circuits: 2 },
  { key: 'westfell-capital', from: 'westfell4', to: 'capital4', cat: 'l400-twinmoose', circuits: 2 },
  { key: 'redhill-capital', from: 'redhill', to: 'capital4', cat: 'l400-twinmoose', circuits: 2 },
  { key: 'capital-eastgate', from: 'capital4', to: 'eastgate4', cat: 'l400-twinmoose', circuits: 2 },
  { key: 'capital-marlow', from: 'capital4', to: 'marlow4', cat: 'l400-twinmoose', circuits: 2 },
  { key: 'marlow-south', from: 'marlow4', to: 'south4', cat: 'l400-twinmoose', circuits: 1 },
  { key: 'south-capital', from: 'south4', to: 'capital4', cat: 'l400-twinmoose', circuits: 1 },
  { key: 'south-eastgate', from: 'south4', to: 'eastgate4', cat: 'l400-twinmoose', circuits: 1 },
  { key: 'gorge-westfell', from: 'gorge', to: 'westfell2', cat: 'l220-twinzebra', circuits: 2 },
  { key: 'windmere-gorge', from: 'windmere', to: 'gorge', cat: 'l220-twinzebra', circuits: 1 },
  { key: 'westfell-capital2', from: 'westfell2', to: 'capital2', cat: 'l220-twinzebra', circuits: 1 },
  { key: 'highfell-westfell', from: 'highfell', to: 'westfell2', cat: 'l220-twinzebra', circuits: 1 },
  { key: 'highfell-capital', from: 'highfell', to: 'capital2', cat: 'l220-twinzebra', circuits: 1 },
  { key: 'sunfield-south', from: 'sunfield', to: 'south2', cat: 'l220-twinzebra', circuits: 2 },
  { key: 'south-capital2', from: 'south2', to: 'capital2', cat: 'l220-twinzebra', circuits: 1 },
  { key: 'dc-capital-a', from: 'dc', to: 'capital2', cat: 'l220-twinzebra', circuits: 1 },
  { key: 'dc-capital-b', from: 'dc', to: 'capital2', cat: 'l220-twinzebra', circuits: 1 },
  { key: 'eastgate-capital2', from: 'eastgate2', to: 'capital2', cat: 'l220-twinzebra', circuits: 1 },
  { key: 'eastgate-harbour', from: 'eastgate1', to: 'harbour', cat: 'l132-panther', circuits: 2 },
  { key: 'causeway', from: 'harbour', to: 'saltmarsh', cat: 'l132-panther', circuits: 1 },
  { key: 'dunmore-eastgate', from: 'dunmore', to: 'eastgate1', cat: 'l132-panther', circuits: 2 },
  { key: 'northfield-riverside', from: 'northfield', to: 'riverside', cat: 'l132-panther', circuits: 1 },
  { key: 'marlowtown-south', from: 'marlowtown', to: 'south2', cat: 'l220-twinzebra', circuits: 1 },
  { key: 'ironworks-westfell', from: 'ironworks', to: 'westfell1', cat: 'l132-panther', circuits: 2 },
];
export const LINE_ID = Object.fromEntries(LINES.map((l, i) => [l.key, `T${i + 1}`])) as Record<string, string>;

interface XfmrRow { key: string; hv: string; lv: string; cat: string; n: number }
export const XFMRS: XfmrRow[] = [
  { key: 'westfell-ict', hv: 'westfell4', lv: 'westfell2', cat: 'ict-400-220-315', n: 2 },
  { key: 'capital-ict', hv: 'capital4', lv: 'capital2', cat: 'ict-400-220-315', n: 3 },
  { key: 'south-ict', hv: 'south4', lv: 'south2', cat: 'ict-400-220-315', n: 2 },
  { key: 'eastgate-ict', hv: 'eastgate4', lv: 'eastgate2', cat: 'ict-400-220-315', n: 2 },
  { key: 'eastgate-132', hv: 'eastgate2', lv: 'eastgate1', cat: 'ict-220-132-160', n: 2 },
  { key: 'westfell-132', hv: 'westfell2', lv: 'westfell1', cat: 'ict-220-132-160', n: 2 },
  { key: 'highfell-132', hv: 'highfell', lv: 'northfield', cat: 'ict-220-132-160', n: 1 },
  { key: 'south-132', hv: 'south2', lv: 'southplain', cat: 'ict-220-132-160', n: 2 },
  { key: 'capital-132', hv: 'capital2', lv: 'capital1', cat: 'ict-220-132-160', n: 2 },
  { key: 'highfell-riverside', hv: 'highfell', lv: 'riverside', cat: 'ict-220-132-160', n: 1 },
  { key: 'marlow-ict', hv: 'marlow4', lv: 'marlowtown', cat: 'ict-400-220-315', n: 1 },
];

interface LoadRow { bus: string; cls: LoadClass; mw: number; pf: number; priority?: 'hospital' | 'school'; flat?: boolean }
export const LOADS: LoadRow[] = [
  { bus: 'capital2', cls: 'commercial', mw: 380, pf: 0.9 },
  { bus: 'capital2', cls: 'residential', mw: 345, pf: 0.95 },
  { bus: 'dc', cls: 'industrial', mw: 300, pf: 0.98, flat: true },
  { bus: 'eastgate2', cls: 'industrial', mw: 320, pf: 0.88 },
  { bus: 'harbour', cls: 'commercial', mw: 90, pf: 0.92 },
  { bus: 'saltmarsh', cls: 'residential', mw: 28, pf: 0.95, priority: 'school' },
  { bus: 'westfell1', cls: 'residential', mw: 125, pf: 0.95 },
  { bus: 'northfield', cls: 'residential', mw: 80, pf: 0.95 },
  { bus: 'southplain', cls: 'agricultural', mw: 100, pf: 0.85 },
  { bus: 'marlowtown', cls: 'residential', mw: 115, pf: 0.95 },
  { bus: 'dunmore', cls: 'industrial', mw: 55, pf: 0.88 },
  { bus: 'riverside', cls: 'residential', mw: 100, pf: 0.95 },
  { bus: 'ironworks', cls: 'industrial', mw: 90, pf: 0.85 },
  { bus: 'capital1', cls: 'commercial', mw: 140, pf: 0.9 },
  { bus: 'westfell2', cls: 'industrial', mw: 230, pf: 0.88 },
];

interface UnitRow { bus: string; cat: string; mw: number; n: number }
export const UNITS: UnitRow[] = [
  { bus: 'redhill', cat: 'coal-sc-660', mw: 660, n: 2 },
  { bus: 'marlow4', cat: 'ccgt-418', mw: 418, n: 2 },
  { bus: 'gorge', cat: 'hydro-250', mw: 250, n: 2 },
  { bus: 'highfell', cat: 'hydro-250', mw: 250, n: 2 },
  { bus: 'dunmore', cat: 'ocgt-105', mw: 105, n: 2 },
  { bus: 'harbour', cat: 'biomass-10', mw: 10, n: 1 },
  { bus: 'sunfield', cat: 'pv-100', mw: 900, n: 1 },
  { bus: 'windmere', cat: 'wind-50', mw: 600, n: 1 },
];

/** Transformer branch ids by key, in placement order after the lines (T25..). */
export const XFMR_IDS: Record<string, string[]> = (() => {
  const out: Record<string, string[]> = {}; let n = LINES.length;
  for (const x of XFMRS) { out[x.key] = Array.from({ length: x.n }, () => `T${++n}`); }
  return out;
})();

/** The three days: pinned weather and the holiday's demand. */
export const FINALE_DAYS: FinaleDay[] = [
  { tMinC: 30, tMaxC: 44, windMs: 5, cloud: 0, scale: {} },
  { tMinC: 21, tMaxC: 26, windMs: 8, cloud: 0.8, scale: {} },
  { tMinC: 22, tMaxC: 31, windMs: 8, cloud: 0, scale: { commercial: 0.7, industrial: 0.8, residential: 0.95, agricultural: 0.9 } },
];

/** Scripted trips of Day 2 (index 1). Element ids follow the placement order above: the first Capital 400/220 kV transformer is T27. */
export const TRIP = { line: LINE_ID['capital-eastgate']!, unit: 'U1', ict: XFMR_IDS['capital-ict']![0]!, island: LINE_ID['causeway']! };
export const EVENTS = { stormBlock: 48, stormBlocks: 48, lineBlock: 57, unitBlock: 74, ictBlock: 84, lightningBlock: 94, holidayTripBlock: 47, holidayUnit: 'U5' };
export const REPAIRS = [{ id: TRIP.line, day: 2, block: 8 }, { id: TRIP.ict, day: 2, block: 12 }, { id: TRIP.island, day: 2, block: 24 }];
export const ENERGY_MWH = 131237.51379137684;   // oracle F-1 (tools/oracles/chf_oracles.py)
export const FINALE = { days: FINALE_DAYS, islandBus: BUS.saltmarsh!, repairs: REPAIRS, restorePerBlock: 0.5, lightning: { id: TRIP.island, day: 1, block: EVENTS.lightningBlock }, beats: [{ day: 0, block: 1, key: 'log.finale.day1' }, { day: 1, block: 1, key: 'log.finale.day2' }, { day: 1, block: 44, key: 'log.finale.stormWarn' }, { day: 2, block: 1, key: 'log.finale.day3' }], energyMWh: ENERGY_MWH, nightMWh: 92.141 };


// ---- the player's parts -------------------------------------------------------------------------------------------------------------
const act = (name: string, ...args: unknown[]): Action => ({ name, args });
export const B = BUS;
const bus = (k: string): string => BUS[k]!;
/** The Eastgate 220/132 kV transformers' tap changers raised to hold 1.03 pu on the 132 kV side (they hold 1.00 pu): the 132 kV tail to Harbour, Dunmore and Saltmarsh sags in the heat otherwise. */
export const tapsEastgate: Action[] = (XFMR_IDS['eastgate-132'] ?? []).map((id) => act('setTapAuto', id, 1.02, 0.015, 1));
/** 200 MVAr of switched 400 kV capacitor at Eastgate 400 (C1), on automatic: in below 0.975 pu, out above 1.03 pu, one 50 MVAr step per block. */
export const capsEastgate: Action[] = [act('placeShunt', bus('eastgate4'), 'cap-400-50', 4), act('setShuntSteps', 'C1', 2), act('setShuntAuto', 'C1', 0.975, 1.03, 1)];
/** 500 MVAr of switched 400 kV reactor at Redhill 400 (C2), on automatic: in above 1.04 pu, out below 0.99 pu. */
export const reactorsCapital: Action[] = [act('placeShunt', bus('redhill'), 'reactor-400-125', 4), act('setShuntSteps', 'C2', 0), act('setShuntAuto', 'C2', 0.99, 1.04, 1)];
/** A 200 MVAr STATCOM at Eastgate 400 (C1): holds the voltage both ways, continuously. */
export const statcomEastgate: Action[] = [act('placeShunt', bus('eastgate4'), 'statcom-200', 1), act('setShuntSteps', 'C1', 1)];
export const fixedReactors: Action[] = [act('placeShunt', bus('capital4'), 'reactor-400-125', 4), act('setShuntSteps', 'C1', 4)];
export const gfm = (n: number): Action[] => Array.from({ length: n }, () => act('placeStorage', bus('capital2'), 'bess-gfm-50'));
export const secondCauseway: Action[] = [act('stringLine', bus('harbour'), bus('saltmarsh'), 'l132-panther', 1)];
export const eastgateFeeder: Action[] = [act('stringLine', bus('eastgate1'), bus('saltmarsh'), 'l132-panther', 1)];
export const islandBattery = (sku: 'bess-2h-50' | 'bess-4h-50'): Action[] => [act('placeStorage', bus('saltmarsh'), sku)];
export const fourthIct: Action[] = [act('placeTransformer', bus('capital4'), bus('capital2'), 'ict-400-220-315')];

export const REACTIVE = [
  { id: 'none', actions: [] as Action[] }, { id: 'taps', actions: tapsEastgate }, { id: 'taps+caps', actions: [...tapsEastgate, ...capsEastgate] },
  { id: 'taps+caps+reactors', actions: [...tapsEastgate, ...capsEastgate, ...reactorsCapital] }, { id: 'taps+statcom+reactors', actions: [...tapsEastgate, ...statcomEastgate, ...reactorsCapital] },
];
export const spinCcgt: Action[] = [act('spinUnit', 'U4')];
export const RESERVE = [{ id: 'none', actions: [] as Action[] }, { id: 'gfm4', actions: gfm(4) }, { id: 'spin', actions: spinCcgt }, { id: 'gfm4+spin', actions: [...gfm(4), ...spinCcgt] }];
export const ISLAND = [{ id: 'none', actions: [] as Action[] }, { id: 'second-causeway', actions: secondCauseway }, { id: 'eastgate-feeder', actions: eastgateFeeder }, { id: 'battery-4h', actions: islandBattery('bess-4h-50') }];

export const L28: GridLevelSpec = {
  id: 'L28', kind: 'grid', chapter: 8, titleKey: 'level.L28.title', briefKey: 'level.L28.brief', concepts: ['n-1', 'voltage-control', 'inertia', 'reserve'],
  startBlock: 0, horizonBlocks: HORIZON, maxTicks: HORIZON + 4,
  allowed: { actions: ['stringLine', 'placeTransformer', 'placeShunt', 'setShuntAuto', 'setShuntSteps', 'setTapAuto', 'placeStorage', 'spinUnit', 'setUflsMap', 'demolish'],
    parts: { stringLine: ['l132-panther', 'l220-twinzebra', 'l400-twinmoose'], placeTransformer: ['ict-400-220-315', 'ict-220-132-160'], placeShunt: ['cap-400-50', 'cap-220-50', 'reactor-400-125', 'statcom-200'], placeStorage: ['bess-2h-50', 'bess-4h-50', 'bess-gfm-50'] } },
  sites: [{ id: 'reactive', options: REACTIVE }, { id: 'reserve', options: RESERVE }, { id: 'island', options: ISLAND }],
  thresholds: { freqViolMax: 0, lossMaxPct: 3 },
  decisive: null,
  star3: [{ key: 'freqViolBlocks', max: 'freqViolMax' }, { key: 'islandDarkBlocks', max: 'freqViolMax' }, { key: 'lossPct', max: 'lossMaxPct' }],
  brownoutLoses: false, blackoutLoses: true, stars: true, histogram: 'capex',
  story: { placeKey: 'level.L28.place', lineKeys: ['level.L28.story1', 'level.L28.story2', 'level.L28.story3'], lessonKey: 'level.L28.lesson', lessonKind: 'finale' },
  extraRules: () => ({ finale: FINALE, vWatch: { lo: 0.95, hi: 1.05, kv: [400, 220, 132], graceBlocks: 6 }, maxEnsMWh: 0.001 * ENERGY_MWH, freqTrack: false }),
  naive: { actions: [], failKind: 'brownout' }, // lesson: taps and capacitors for the heat, a spun gas unit for reserve, and a second causeway line for the island (a rule-of-thumb N-1); the reference swaps the line for a 4-hour battery, the cheapest design that passes
  lesson: [...tapsEastgate, ...capsEastgate, ...spinCcgt, ...secondCauseway], reference: [...tapsEastgate, ...capsEastgate, ...spinCcgt, ...islandBattery('bess-4h-50')],
  // frozen from the bot population (80 designs per region; budget = 1.1 x the dearer of lesson and reference rounded up to 2 significant figures; A = median passing cost; B = 15th percentile of the passing
  // designs with no shed energy, no frequency block out of range, the island always lit and losses <= 3 %): chf.test.ts regenerates them and fails on drift > 2 %
  frozen: { global: { budget: 70000000, starA: 59723208.50865215, starB: 53781954.76834224 }, in: { budget: 8000000000, starA: 1579729269.6560645, starB: 631133701.8030616 } },
  coach: [
    { id: 'volt', textKey: 'coach.L28.volt', whyKey: 'coach.L28.volt.why', done: (s) => s.actionLog.some((a) => a.name === 'setTapAuto') && s.shunts.length > 0 },
    { id: 'reserve', textKey: 'coach.L28.reserve', whyKey: 'coach.L28.reserve.why', done: (s) => s.actionLog.some((a) => a.name === 'spinUnit') || s.storage.length > 1 },
    { id: 'island', textKey: 'coach.L28.island', whyKey: 'coach.L28.island.why', done: (s) => s.branches.some((b) => (b.to === 'B18' || b.from === 'B18') && b.id !== 'T20') || s.storage.some((b) => b.bus === 'B18') },
    { id: 'run', textKey: 'coach.L28.run', whyKey: 'coach.L28.run.why', done: (s) => s.tick > s.levelStart || s.status !== 'playing' },
  ],
  place: (s, sc) => {
    const A = (name: string, ...a: unknown[]): void => place(sc, s, name, ...a);
    s.terrain = null;
    s.map.tileM = TILE_M; s.map.w = MAP_W; s.map.h = MAP_H;
    for (const b of BUSES) A('placeBus', b.x, b.y, b.kv, b.kind, b.vSet);
    s.buses.forEach((b, i) => { b.name = BUSES[i]!.name; });
    for (const l of LINES) A('stringLine', BUS[l.from], BUS[l.to], l.cat, l.circuits);
    for (const x of XFMRS) for (let i = 0; i < x.n; i++) A('placeTransformer', BUS[x.hv], BUS[x.lv], x.cat);
    for (const u of UNITS) for (let i = 0; i < u.n; i++) A('placeUnit', u.cat, BUS[u.bus], u.mw);
    for (const l of LOADS) A('placeLoad', BUS[l.bus], l.cls, l.mw, l.pf);
    A('placeStorage', BUS.sunfield, 'bess-2h-50');
    s.loads.forEach((l, i) => {
      const r = LOADS[i]!;
      if (r.priority) l.priority = r.priority;
      if (r.flat) { l.zip = [0, 0, 1]; l.shape = { p: new Array<number>(BLOCKS_PER_DAY).fill(1), q: new Array<number>(BLOCKS_PER_DAY).fill(Math.sqrt(1 - r.pf * r.pf) / r.pf) }; }
    });
    // the tap changers stand on automatic (the utility's own work); the units that run all night start on
    for (const b of s.branches) if (b.tap) b.tap.auto = { vSet: 1.0, deadband: 0.015, delayBlocks: 1, counter: 0 };
    for (const u of s.units) if (u.kind === 'coal' || u.kind === 'gas' || u.kind === 'hydro') { u.online = true; u.P = u.pMin; }
    const ev = (e: Parameters<typeof s.events.queue.push>[0]): void => { s.events.queue.push(e); };
    ev({ id: 'storm', day: 1, block: EVENTS.stormBlock, kind: 'storm', target: '', magnitude: EVENTS.stormBlocks });
    ev({ id: 'trip-line', day: 1, block: EVENTS.lineBlock, kind: 'trip-branch', target: TRIP.line, magnitude: 0 });
    ev({ id: 'trip-unit', day: 1, block: EVENTS.unitBlock, kind: 'trip-unit', target: TRIP.unit, magnitude: 0 });
    ev({ id: 'trip-ict', day: 1, block: EVENTS.ictBlock, kind: 'trip-branch', target: TRIP.ict, magnitude: 0 });
    ev({ id: 'holiday-trip', day: 2, block: EVENTS.holidayTripBlock, kind: 'trip-unit', target: EVENTS.holidayUnit, magnitude: 0 });
  },
};
