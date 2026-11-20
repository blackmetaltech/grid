// L35 Sun on the Roofs (DESIGN-1.1 B1, Event: distribution; chapter 8 job 5): feeder 5 of Brightwater, Rabbit wire, 1.5 MW evening peak, a 2.5 MW queue of rooftop PV on its last four nodes. At noon the load is 30 % and
// the sun pushes power back up the feeder, so the voltage RISES toward the roofs (reverse flow); in the evening there is no sun and the voltage sags as on any feeder. The same wire has to keep every customer inside
// 230 V -6 % .. the pack's ceiling at both. The tap changer's set point with line-drop compensation lowers the source when power flows back and raises it under load; volt-var inverters absorb vars as voltage
// climbs; a heavier head conductor lowers the rise. Pass: both snapshots in band with at least 1 MW connected (the council's promise). Lamp 3: 2.5 MW connected. Engine: src/sim/distrib/hosting.ts.
import type { Action } from '@core/kit';
import type { GridLevelSpec } from '../spec';
import { placeL35, ch8Start } from '../ch8/place';
import { L35S, V_LO_PU } from '../../sim/ch8/data';
import { ch8TryHint } from '../ch8/queries';

const pv = (kw: number): Action[] => [{ name: 'setPvLimit', args: [kw] }];
const oltc = (v: number, ldc: boolean): Action[] => [{ name: 'setOltc', args: [v, ldc] }];
const vv = (): Action[] => [{ name: 'setVoltVar', args: [true] }];
const cond = (n: string[], c: string): Action[] => n.map((id) => ({ name: 'setConductor', args: [id, c] }));
const used = (s: { actionLog: { name: string }[] }, ...names: string[]): boolean => s.actionLog.some((a) => names.includes(a.name));

export const L35: GridLevelSpec = {
  id: 'L35', kind: 'event', chapter: 8, titleKey: 'level.L35.title', briefKey: 'level.L35.brief', concepts: ['reverse-flow', 'voltage-rise', 'hosting-capacity', 'oltc-ldc', 'volt-var'],
  startBlock: 48, horizonBlocks: null, maxTicks: 2,
  allowed: {
    actions: ['setPvLimit', 'setOltc', 'setVoltVar', 'setConductor'],
    parts: { setConductor: ['Rabbit', 'Hyena'] },
  },
  sites: [
    { id: 'pv', options: [1000, 2000, 3000].map((k) => ({ id: `${k}`, actions: pv(k) })) },
    { id: 'oltc', options: [false, true].flatMap((ldc) => L35S.oltcSetOptions.map((v) => ({ id: `${v}${ldc ? '+ldc' : ''}`, actions: oltc(v, ldc) }))) },
    { id: 'voltvar', options: [{ id: 'unity', actions: [] }, { id: 'voltvar', actions: vv() }] },
    { id: 'cable', options: [{ id: 'rabbit', actions: [] }, { id: 'hyena', actions: cond(['N1', 'N2'], 'Hyena') }] },
  ],
  thresholds: { marginMin: 0, vLoPu: V_LO_PU, vHiPu: { symbol: 'busBandHiPu', kv: 0.4 }, pvMin: L35S.minPvKw, pvStar: L35S.starPvKw, boughtMin: 1 },
  decisive: { key: 'marginPu', limit: 'marginMin', dir: 'min' },
  // a $0 design (only a set-point and the PV limit) earns the pass lamp only: the spend lamp needs something bought (DESIGN-1.1 A1)
  star2: [{ key: 'bought', min: 'boughtMin' }],
  star3: [{ key: 'pvKw', min: 'pvStar' }],
  brownoutLoses: false, blackoutLoses: false, stars: true, histogram: 'capex',
  story: { placeKey: 'level.L35.place', lineKeys: ['level.L35.story1', 'level.L35.story2'], lessonKey: 'level.L35.lesson', lessonKind: 'ch8' },
  tryText: (s) => ch8TryHint(s),
  naive: { actions: [], failKind: 'ch8.voltageHigh' },
  lesson: [...pv(1000), ...oltc(1.02, true)],
  reference: [...pv(3000), ...oltc(1.04, false), ...vv()],
  // the pack's +6 % ceiling leaves volt-var alone only 1 MW of headroom: the Indian reference also reconductors the head
  byRegion: { in: { reference: [...pv(3000), ...oltc(1.02, false), ...vv(), ...cond(['N1', 'N2'], 'Hyena')] } },
  // frozen from the bot population (src/level/population.ts); ch8.test.ts regenerates it and fails on drift > 2 %
  frozen: { global: { budget: 33000, starA: 19000, starB: 8000 }, in: { budget: 13000000, starA: 11620000, starB: 11620000 } },
  coach: [
    { id: 'pv', textKey: 'coach.L35.pv', whyKey: 'coach.L35.pv.why', done: (s) => used(s, 'setPvLimit') || s.tick > s.levelStart },
    { id: 'control', textKey: 'coach.L35.control', whyKey: 'coach.L35.control.why', done: (s) => used(s, 'setOltc', 'setVoltVar', 'setConductor') || s.tick > s.levelStart },
    { id: 'run', textKey: 'coach.L35.run', whyKey: 'coach.L35.run.why', done: (s) => s.tick > s.levelStart || s.status !== 'playing' },
  ],
  place: (s, sc) => { ch8Start(s, sc, 'L35'); placeL35(s, sc); },
};
