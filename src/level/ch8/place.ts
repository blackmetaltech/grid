// Scenario placement for chapter 8: the player's design record (`state.ch8`, with its default = the naive build) and a small real network on the map so the world has something to draw
// (the studies themselves run on the scenario constants of src/sim/ch8/data.ts through src/sim/distrib, not on this network).
import type { GridState } from '../../types';
import { place, type ScaffoldCtx } from '../spec';
import { voltageBand } from '../../sim/params';
import { L31, L35, L32, L36, L33, moneyFactor, type Ch8Id } from '../../sim/ch8/data';
import { defaultFeeder } from '../../sim/ch8/feeder';
import { defaultL32 } from '../../sim/ch8/reliab';
import { defaultL33 } from '../../sim/ch8/protect';
import { defaultL34 } from '../../sim/ch8/subst';

/** The default design of a level: the build the idle player leaves standing (it fails, for the lesson's reason). */
export function ch8Start(s: GridState, sc: ScaffoldCtx, id: Ch8Id): void {
  const ch: NonNullable<GridState['ch8']> = { id, money: moneyFactor(s.region), vHiPu: voltageBand(sc.params, 0.4, 'learner')[1] };
  if (id === 'L31') ch.l31 = defaultFeeder(L31);
  if (id === 'L32') ch.l32 = defaultL32();
  if (id === 'L33') ch.l33 = defaultL33();
  if (id === 'L34') ch.l34 = defaultL34();
  if (id === 'L35') ch.l35 = { feeder: defaultFeeder(L35), pvLimitKw: 3000, oltcSetPu: 1.0, ldc: false, voltVar: false };
  if (id === 'L36') ch.l36 = { why: null };
  s.ch8 = ch;
}

const live = (s: GridState): void => { for (const u of s.units) { u.online = true; u.pMin = 0; u.P = 0; } };

/** The 11 kV feeder from the primary substation: one bus per node (km along the map), a small load at each. */
export function placeFeeder(s: GridState, sc: ScaffoldCtx, kms: number[], mw: number[]): void {
  const A = (name: string, ...a: unknown[]): void => place(sc, s, name, ...a);
  A('placeBus', 4, 8, 11, 'gen', 1.02);
  let x = 4;
  kms.forEach((km, i) => { x += Math.max(3, Math.round(km * 3)); A('placeBus', x, 8, 11, 'load'); A('stringLine', `B${i + 1}`, `B${i + 2}`, 'l11-dog', 1, km); A('placeLoad', `B${i + 2}`, 'residential', mw[i], 0.9); });
  A('placeUnit', 'ccgt-418', 'B1', 20);
  s.buses[0]!.name = 'Brightwater 11 kV';
  live(s);
}
export const placeL31 = (s: GridState, sc: ScaffoldCtx): void => placeFeeder(s, sc, L31.nodes.map((n) => n.km), L31.nodes.map((n) => n.kw / 1000));
export const placeL35 = (s: GridState, sc: ScaffoldCtx): void => placeFeeder(s, sc, L35.nodes.map((n) => n.km), L35.nodes.map((n) => n.kw / 1000));
export const placeL32 = (s: GridState, sc: ScaffoldCtx): void => placeFeeder(s, sc, L32.sections.slice(0, 4).map((n) => n.km), L32.sections.slice(0, 4).map((n) => n.kw / 1000));
export const placeL33 = (s: GridState, sc: ScaffoldCtx): void => placeFeeder(s, sc, [3, 3, 3], [0.5, 0.4, 0.3]);
export const placeL36 = (s: GridState, sc: ScaffoldCtx): void => placeFeeder(s, sc, L36.sections.map((n) => n.km), L36.sections.map((n) => n.kw / 1000));

/** L34: the primary substation, two 33 kV bus sections with a transformer each, feeding the town. */
export function placeSubstation(s: GridState, sc: ScaffoldCtx): void {
  const A = (name: string, ...a: unknown[]): void => place(sc, s, name, ...a);
  A('placeBus', 8, 6, 132, 'gen', 1.02); A('placeBus', 6, 10, 33, 'sub'); A('placeBus', 10, 10, 33, 'sub');
  A('placeTransformer', 'B1', 'B2', 'pt-132-33-50'); A('placeTransformer', 'B1', 'B3', 'pt-132-33-50');
  A('placeUnit', 'ccgt-418', 'B1', 20);
  A('placeLoad', 'B2', 'residential', 12, 0.95); A('placeLoad', 'B3', 'residential', 12, 0.95);
  s.buses[0]!.name = 'Grid 132 kV'; s.buses[1]!.name = 'Section A'; s.buses[2]!.name = 'Section B';
  live(s);
}
