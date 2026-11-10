// L21 Inertia Matters (DESIGN 2.6 chapter 6, an event level): noon in a solar desert, 70 % inverter-based. A 500 MW gas unit trips. The rooftop PV (1.2 GW) is legacy and trips on
// RoCoF > 1.0 Hz/s (no ride-through, DESIGN S29, modelled on legacy anti-islanding settings, inspired by South Australia 2016). The sync fleet is whatever the cheapest dispatch left on
// at noon: four hydro units and the gas unit, all coal off. The player brings inertia back (a coal unit held at minimum, synchronous condensers, grid-forming batteries) or fits ride-through.
import type { Action } from '@core/kit';
import type { GridLevelSpec } from '../spec';
import { place } from '../spec';
import { BLOCKS_PER_DAY } from '../../types';
import { freqLesson, freqTry } from '../ch6-text';

export const L21_START = 44, L21_TRIP_BLOCK = 48, L21_HORIZON = 14;
export const L21_LOAD_MW = 5200;
export const UTILITY_PV_MW = 3000, ROOFTOP_PV_MW = 1200, TRIP_MW = 500;
/** U1 the 500 MW gas unit that trips, U2..U5 hydro, U6..U8 coal (cold), U9 utility PV, U10 rooftop PV. */
export const TRIP_ID = 'U1', HYDRO_IDS = ['U2', 'U3', 'U4', 'U5'], COAL_IDS = ['U6', 'U7', 'U8'], PV_ID = 'U9', ROOFTOP_ID = 'U10';
const flat = (): { p: number[]; q: number[] } => ({ p: new Array<number>(BLOCKS_PER_DAY).fill(1), q: new Array<number>(BLOCKS_PER_DAY).fill(0.3) });

/** The unit ids a design adds: condensers come after U10, batteries are S1... */
export const coalHold = (n: number): Action[] => COAL_IDS.slice(0, n).map((id) => ({ name: 'spinUnit', args: [id] }));
export const condensers = (n: number, mva = 300): Action[] => Array.from({ length: n }, (_, i) => [{ name: 'placeUnit', args: ['synccon-100', 'B1', mva] }, { name: 'spinUnit', args: [`U${11 + i}`] }]).flat();
export const gfm = (n: number): Action[] => Array.from({ length: n }, (_, i) => [{ name: 'placeStorage', args: ['B1', 'bess-gfm-50'] }, { name: 'setFfr', args: [`S${i + 1}`] }]).flat();
export const rideThrough: Action[] = [{ name: 'upgradeRideThrough', args: [] }];

export const L21: GridLevelSpec = {
  id: 'L21', kind: 'event', chapter: 6, titleKey: 'level.L21.title', briefKey: 'level.L21.brief', concepts: ['inertia', 'rocof', 'ffr', 'synchronous-condenser', 'inverter-based-resources'],
  startBlock: L21_START, horizonBlocks: L21_HORIZON, maxTicks: L21_HORIZON + 4,
  allowed: {
    actions: ['spinUnit', 'placeUnit', 'placeStorage', 'setFfr', 'upgradeRideThrough', 'predict', 'demolish'],
    parts: { placeUnit: ['synccon-100'], placeStorage: ['bess-gfm-50'] },
  },
  sites: [
    { id: 'coal', options: [0, 1, 2, 3].map((n) => ({ id: n === 0 ? 'coal-off' : `coal-${n}`, actions: coalHold(n) })) },
    { id: 'condenser', options: [0, 1, 2].map((n) => ({ id: n === 0 ? 'no-condenser' : `condenser-${n * 300}`, actions: condensers(n) })) },
    { id: 'gfm', options: [0, 2, 4, 6, 8, 10].map((n) => ({ id: n === 0 ? 'no-gfm' : `gfm-${n * 50}`, actions: gfm(n) })) },
    { id: 'ride', options: [{ id: 'legacy', actions: [] }, { id: 'ride-through', actions: rideThrough }] },
  ],
  thresholds: { nadirMinHz: 49.4, nadirStar3Hz: 49.58 },
  decisive: null,
  star3: [{ key: 'nadirHz', min: 'nadirStar3Hz' }],
  brownoutLoses: false, blackoutLoses: true, stars: true, histogram: 'capex',
  extraRules: (th) => ({ freqTrack: true, minNadirHz: th.nadirMinHz, derLegacyIds: [ROOFTOP_ID], derRocofHzS: 1.0 }),
  lessonText: (s, p, th) => freqLesson(s, p, th, 'L21'),
  tryText: (s, p, th) => freqTry(s, p, th, 'L21'),
  story: { placeKey: 'level.L21.place', lineKeys: ['level.L21.story1', 'level.L21.story2', 'level.L21.story3'], lessonKey: 'level.L21.lesson' },
  naive: { actions: [], failKind: 'nadir' },
  lesson: [...coalHold(2), ...gfm(8)],
  reference: [...coalHold(2), ...gfm(10)],
  // frozen from the bot population (144 designs per region; same rule as L19)
  frozen: { global: { budget: 330000000, starA: 305540314.9647888, starB: 305540314.9647888 }, in: { budget: 58000000000, starA: 52750636143.6818, starB: 52750636143.6818 } },
  coach: [
    { id: 'read-inertia', textKey: 'coach.L21.inertia', whyKey: 'coach.L21.inertia.why', done: (s) => s.tick > s.levelStart },
    { id: 'add-inertia', textKey: 'coach.L21.add', whyKey: 'coach.L21.add.why', done: (s) => s.actionLog.some((a) => a.name === 'spinUnit' || a.name === 'placeStorage' || a.name === 'upgradeRideThrough') },
    { id: 'predict', textKey: 'coach.L21.predict', whyKey: 'coach.L21.predict.why', done: (s) => s.metrics.predictions.length > 0 },
    { id: 'run', textKey: 'coach.L21.run', whyKey: 'coach.L21.run.why', done: (s) => s.status !== 'playing' },
  ],
  place: (s, sc) => {
    const A = (name: string, ...a: unknown[]): void => place(sc, s, name, ...a);
    A('placeBus', 4, 4, 400, 'gen', 1.0);
    A('placeUnit', 'ccgt-418', 'B1', TRIP_MW);
    for (let i = 0; i < 4; i++) A('placeUnit', 'hydro-250', 'B1', 250);
    for (let i = 0; i < 3; i++) A('placeUnit', 'coal-sub-500', 'B1', 500);
    A('placeUnit', 'pv-100', 'B1', UTILITY_PV_MW); A('placeUnit', 'pv-100', 'B1', ROOFTOP_PV_MW);
    A('placeLoad', 'B1', 'residential', L21_LOAD_MW, 0.95);
    for (const l of s.loads) { l.zip = [0, 0, 1]; l.shape = flat(); }
    const trip = s.units.find((u) => u.id === TRIP_ID)!;
    trip.pMin = TRIP_MW;   // the gas unit runs flat out on a take-or-pay contract: it is exactly 500 MW when it trips
    for (const u of s.units) if (u.kind !== 'coal') { u.online = true; u.P = u.id === TRIP_ID ? TRIP_MW : u.P; }
    for (const u of s.units) if (u.kind === 'hydro') u.P = 250;
    for (const u of s.units) if (u.kind === 'coal') u.startBlocks = 2;   // the idle coal units are held hot on banked boilers: half an hour from the order to the grid
    s.dispatch.auto = false;
    s.weather.clouds = [{ x: 0, y: 0, radiusTiles: 0.1, opacity: 0, vx: 0, vy: 0 }];   // a clear desert sky
    s.events.queue.push({ id: 'trip-U1', day: 0, block: L21_TRIP_BLOCK, kind: 'trip-unit', target: TRIP_ID, magnitude: 0 });
  },
};
