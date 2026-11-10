// Scenario placement for chapter 7: the player's design record (`state.ch7`, with its default = the naive build) and a small real network on the map so the world has
// something to draw (the studies themselves run on the scenario constants of src/sim/ch7/scenarios.json, not on this network).
import type { GridState } from '../../types';
import { place, type ScaffoldCtx } from '../spec';
import { SC, moneyFactor } from '../../sim/ch7/data';
import type { Ch7Id, L24Design, L26Design } from '../../sim/ch7/state';
import { PLANTS } from '../../sim/ch7/merit';

const defaultL24 = (): L24Design => ({ relays: [0, 1, 2, 3].map(() => ({ curve: 'SI' as const, pct: 100, tms: 0.15 })) });
const defaultL26 = (): L26Design => ({ mode: 'merit', windows: Object.fromEntries(PLANTS.map((k) => [k, [0, 24] as [number, number]])) });

/** The default design of a level: the build the idle player leaves standing (it fails, for the lesson's reason). */
export function ch7Start(s: GridState, id: Ch7Id): void {
  const ch = { id, money: moneyFactor(s.region) } as NonNullable<GridState['ch7']>;
  if (id === 'L23') ch.l23 = { rating: 25, uk: 10, coupler: 'closed', reactor: 0 };
  if (id === 'L24') ch.l24 = defaultL24();
  if (id === 'L25') ch.l25 = { relay: 'idmt-si-0.1', cycles: 5, reclose: false };
  if (id === 'L26') ch.l26 = defaultL26();
  if (id === 'L27') ch.l27 = { rating: 25, dispatch: [350, 350, 300] };
  s.ch7 = ch;
}

const live = (s: GridState): void => { for (const u of s.units) { u.online = true; u.pMin = 0; u.P = 0; } };

/** L23 / L27: the 33 kV industrial board (grid at 132 kV, two transformers, two sections, the captive generators, the estate loads). */
export function placeBoard(s: GridState, sc: ScaffoldCtx, extra: boolean): void {
  const A = (name: string, ...a: unknown[]): void => place(sc, s, name, ...a);
  A('placeBus', 8, 6, 132, 'gen', 1.02); A('placeBus', 6, 10, 33, 'sub'); A('placeBus', 10, 10, 33, 'sub');
  A('placeTransformer', 'B1', 'B2', 'pt-132-33-50'); A('placeTransformer', 'B1', 'B3', 'pt-132-33-50');
  A('placeUnit', 'ccgt-418', 'B1', 20);
  A('placeUnit', 'diesel-1500', 'B2', 1.5); A('placeUnit', 'diesel-1500', 'B3', 1.5);
  if (extra) A('placeUnit', 'diesel-1500', 'B3', 1.5);
  A('placeLoad', 'B2', 'industrial', 0.6 * SC.l23.estate.mva / 2 / 10, SC.l23.estate.pf); A('placeLoad', 'B3', 'industrial', 0.6 * SC.l23.estate.mva / 2 / 10, SC.l23.estate.pf);
  s.buses[0]!.name = 'Grid 132 kV'; s.buses[1]!.name = 'Section A'; s.buses[2]!.name = 'Section B';
  live(s);
}

/** L24: the radial 11 kV feeder, substation to the far end. */
export function placeFeeder(s: GridState, sc: ScaffoldCtx): void {
  const A = (name: string, ...a: unknown[]): void => place(sc, s, name, ...a);
  A('placeBus', 4, 8, 11, 'gen', 1.02);
  let x = 4;
  SC.l24.sections.forEach((sec, i) => { x += Math.round(sec.km * 3); A('placeBus', x, 8, 11, 'load'); A('stringLine', `B${i + 1}`, `B${i + 2}`, 'l11-dog', 1, sec.km); A('placeLoad', `B${i + 2}`, 'industrial', sec.mw, 0.9); });
  A('placeUnit', 'ccgt-418', 'B1', 20);
  s.buses[0]!.name = 'Substation';
  live(s);
}

/** L25: the hydro plant and the city across a double-circuit 400 kV line. */
export function placeHydroLine(s: GridState, sc: ScaffoldCtx): void {
  const A = (name: string, ...a: unknown[]): void => place(sc, s, name, ...a);
  A('placeBus', 4, 6, 400, 'gen', 1.02); A('placeBus', 40, 6, 400, 'load');
  A('stringLine', 'B1', 'B2', 'l400-twinmoose', 2, 120);
  A('placeUnit', 'hydro-250', 'B1', 250);
  A('placeLoad', 'B2', 'commercial', 240, 0.95);
  s.buses[0]!.name = 'Kestrel Falls'; s.buses[1]!.name = 'City';
  live(s);
}

/** L26: the generation area (coal, hydro, solar) and the load area (CCGT, OCGT) joined by the 220 kV corridor. */
export function placeTwoAreas(s: GridState, sc: ScaffoldCtx): void {
  const A = (name: string, ...a: unknown[]): void => place(sc, s, name, ...a);
  A('placeBus', 6, 6, 220, 'gen', 1.02); A('placeBus', 40, 6, 220, 'load');
  A('stringLine', 'B1', 'B2', 'l220-twinzebra', 2, 80);
  A('placeUnit', 'coal-sub-500', 'B1', 350); A('placeUnit', 'coal-sc-660', 'B1', 450); A('placeUnit', 'hydro-250', 'B1', 200);
  A('placeUnit', 'ccgt-418', 'B2', 400); A('placeUnit', 'ocgt-105', 'B2', 105);
  A('placeLoad', 'B1', 'industrial', 500, 0.95); A('placeLoad', 'B2', 'residential', 880, 0.95);
  s.buses[0]!.name = 'Generation area'; s.buses[1]!.name = 'Load area';
  live(s);
}
