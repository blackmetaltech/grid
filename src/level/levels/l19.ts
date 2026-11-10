// L19 Fifty Hertz (DESIGN 2.6 chapter 6, an event level on the grid chassis): the southern region, islanded for maintenance. 6.9 GW of evening load, 12 coal units (500 MW,
// 588 MVA, H = 3.5 s) and 4 hydro units (250 MW, 294 MVA, H = 3 s), solar zero after dark. At 20:00 the largest coal unit trips. The dispatch before the trip is the engine's own
// economic dispatch (hydro first, coal shares the rest), which leaves about 90 MW of headroom on the 11 coal units still running: the naive build.
// The player keeps a 13th coal unit spinning (headroom spread), adds droop, or puts batteries on frequency response; the event window (RK4 10 ms, governors, UFLS) says what the nadir was.
import type { Action } from '@core/kit';
import type { GridLevelSpec } from '../spec';
import { place } from '../spec';
import { BLOCKS_PER_DAY } from '../../types';
import { freqLesson, freqTry } from '../ch6-text';

export const L19_LOAD_MW = 6900;
export const L19_START = 64, L19_TRIP_BLOCK = 80, L19_HORIZON = 22;
/** U1..U12 coal (online), U13..U16 hydro, U17 the spare coal unit (cold). */
export const COAL_IDS = Array.from({ length: 12 }, (_, i) => `U${i + 1}`);
export const HYDRO_IDS = ['U13', 'U14', 'U15', 'U16'];
export const SPARE = 'U17';
const loadsMW = [['residential', 3200], ['industrial', 2600], ['agricultural', 900], ['critical', 200]] as const;

const flat = (): { p: number[]; q: number[] } => ({ p: new Array<number>(BLOCKS_PER_DAY).fill(1), q: new Array<number>(BLOCKS_PER_DAY).fill(0.3) });

export const spin: Action[] = [{ name: 'spinUnit', args: [SPARE] }];
export const droop = (pct: number): Action[] => [...COAL_IDS, SPARE, ...HYDRO_IDS].map((id) => ({ name: 'setDroop', args: [id, pct] }));
export const ffr = (n: number): Action[] => Array.from({ length: n }, (_, i) => [{ name: 'placeStorage', args: ['B1', 'bess-2h-50'] }, { name: 'setFfr', args: [`S${i + 1}`] }]).flat();

export const L19: GridLevelSpec = {
  id: 'L19', kind: 'grid', chapter: 6, titleKey: 'level.L19.title', briefKey: 'level.L19.brief', concepts: ['inertia', 'rocof', 'governor-droop', 'spinning-reserve', 'ufls', 'ffr'],
  startBlock: L19_START, horizonBlocks: L19_HORIZON, maxTicks: L19_HORIZON + 4,
  allowed: {
    actions: ['spinUnit', 'setDroop', 'placeStorage', 'setFfr', 'predict', 'demolish'],
    parts: { placeStorage: ['bess-2h-50'] },
  },
  sites: [
    { id: 'reserve', options: [{ id: 'none', actions: [] }, { id: 'spin-13th', actions: spin }] },
    { id: 'droop', options: [{ id: 'droop-5', actions: [] }, { id: 'droop-3', actions: droop(3) }, { id: 'droop-6', actions: droop(6) }] },
    { id: 'ffr', options: [0, 1, 2, 3, 4, 5, 6].map((n) => ({ id: n === 0 ? 'no-ffr' : `ffr-${n * 50}`, actions: ffr(n) })) },
  ],
  thresholds: { nadirMinHz: { symbol: 'ufls1Hz' }, nadirStar3Hz: { symbol: 'ufls1Hz', add: 0.15 }, coverMin: 1 },
  decisive: { key: 'reserveCover', limit: 'coverMin', dir: 'min' },
  star3: [{ key: 'nadirHz', min: 'nadirStar3Hz' }],
  brownoutLoses: false, blackoutLoses: true, stars: true, histogram: 'capex',
  extraRules: (th) => ({ freqTrack: true, minNadirHz: th.nadirMinHz }),
  lessonText: (s, p, th) => freqLesson(s, p, th, 'L19'),
  tryText: (s, p, th) => freqTry(s, p, th, 'L19'),
  story: { placeKey: 'level.L19.place', lineKeys: ['level.L19.story1', 'level.L19.story2', 'level.L19.story3'], lessonKey: 'level.L19.lesson' },
  naive: { actions: [], failKind: 'nadir' },
  lesson: [...spin, ...ffr(2)],
  reference: spin,
  // frozen from the bot population (42 designs per region; budget = 1.1 x the dearer of lesson and reference, rounded up to 2 significant figures; A = median passing cost, B = 15th percentile of the three-star designs)
  frozen: { global: { budget: 93000000, starA: 56778941.90140845, starB: 29603941.901408453 }, in: { budget: 12000000000, starA: 6255913561.5451765, starB: 1755913561.5451765 } },
  coach: [
    { id: 'read-headroom', textKey: 'coach.L19.headroom', whyKey: 'coach.L19.headroom.why', done: (s) => s.tick > s.levelStart },
    { id: 'reserve', textKey: 'coach.L19.reserve', whyKey: 'coach.L19.reserve.why', done: (s) => s.actionLog.some((a) => a.name === 'spinUnit' || a.name === 'placeStorage' || a.name === 'setDroop') },
    { id: 'predict', textKey: 'coach.L19.predict', whyKey: 'coach.L19.predict.why', done: (s) => s.metrics.predictions.length > 0 },
    { id: 'run', textKey: 'coach.L19.run', whyKey: 'coach.L19.run.why', done: (s) => s.status !== 'playing' },
  ],
  place: (s, sc) => {
    const A = (name: string, ...a: unknown[]): void => place(sc, s, name, ...a);
    A('placeBus', 4, 4, 400, 'gen', 1.0);
    for (let i = 0; i < 12; i++) A('placeUnit', 'coal-sub-500', 'B1', 500);
    for (let i = 0; i < 4; i++) A('placeUnit', 'hydro-250', 'B1', 250);
    A('placeUnit', 'coal-sub-500', 'B1', 500);   // U17: the spare, cold
    for (const [cls, mw] of loadsMW) A('placeLoad', 'B1', cls, mw, 0.95);
    for (const l of s.loads) { l.zip = [0, 0, 1]; l.shape = flat(); if (l.class === 'critical') l.priority = 'hospital'; }
    for (const u of s.units) { if (u.id === SPARE) continue; u.online = true; u.P = u.kind === 'hydro' ? 250 : (L19_LOAD_MW - 1000) / 12; u.commit.minUpLeft = 0; }
    s.dispatch.auto = false;   // the control room runs the island's commitment by hand tonight: nothing starts a unit unless the player does (auto commitment would keep the largest unit's worth of reserve by itself)
    // the sky is clear and there is no sun at 20:00 anyway; the one scripted event is the trip of the largest unit
    s.events.queue.push({ id: 'trip-U1', day: 0, block: L19_TRIP_BLOCK, kind: 'trip-unit', target: 'U1', magnitude: 0 });
  },
};
