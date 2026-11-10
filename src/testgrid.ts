// A synthetic 10-bus grid for the pipeline tests (not shipped data): four 132 kV buses in a ring with two generation buses, two
// 33 kV load buses behind transformers, wind and PV, four loads. Built through the real actions, with a test catalogue.
import type { GameDef, Level } from '@core/kit';
import { GAME } from './game';
import { buildActions } from './actions';
import { LINE_TEMPLATES } from './data/lineTemplates';
import type { CatalogueView, GenSpec } from './sim/build';
import type { GridState } from './types';
import { TEST_PARAMS } from './sim/params';
import { NO_RULES, ruleFail, ruleGoal } from './rules';

const gen = (id: string, kind: GenSpec['kind'], p: Partial<GenSpec>): GenSpec => ({ id, kind, capexPerKw: 1000, pMinPct: null, heatRateGJperMWh: null, fuelPerGJ: null, energyCostPerMWh: 0, rampPctMin: null, startHotS: null, hS: null, droopPct: null, co2tPerMWh: null, ...p });
const GENS: GenSpec[] = [
  gen('t-coal', 'coal', { heatRateGJperMWh: 9.5, fuelPerGJ: 2.6, pMinPct: 20, co2tPerMWh: 0.9, startHotS: 3600 }),
  gen('t-gas', 'gas', { heatRateGJperMWh: 7, fuelPerGJ: 4, pMinPct: 30, co2tPerMWh: 0.4, startHotS: 900 }),
  gen('t-diesel', 'diesel', { heatRateGJperMWh: 10, fuelPerGJ: 25, pMinPct: 20, co2tPerMWh: 0.7 }),
  gen('t-wind', 'wind', {}), gen('t-pv', 'pv', {}),
];

export const TEST_CAT: CatalogueView = {
  generator: (id) => GENS.find((g) => g.id === id) ?? null,
  line: (id) => { const t = LINE_TEMPLATES.find((x) => x.id === id); return t ? { id: t.id, kind: 'line', kv: t.kv, rOhmKm: t.rOhmKm, xOhmKm: t.xOhmKm, bUsKm: t.bUsKm, thermalMva: t.thermalMva, costPerKm: 100000 } : null; },
  transformer: (id) => (id === 't-x132-33' ? { id, mva: 60, kvHv: 132, kvLv: 33, zPct: 10, xr: 20, noLoadKw: 30, loadKw: 200, tapMin: -8, tapMax: 8, price: 2e6 } : null),
  shunt: (id) => (id === 't-cap' ? { id, kind: 'cap', mvarStep: 5, maxSteps: 4, pricePerKvar: 30, autoFactor: 1 } : null),
  storage: (id) => (id === 't-bess' ? { id, mw: 20, mwh: 40, etaRt: 0.86, capexPerKw: 400, capexPerKwh: 300 } : null),
};

export const TEST_ACTIONS = buildActions({ cat: () => TEST_CAT, getParams: () => TEST_PARAMS, money: (_s, n) => String(Math.round(n)) });

const must = (r: { ok: boolean; message: string }): void => { if (!r.ok) throw new Error(`test grid: ${r.message}`); };

/** Place the 10-bus grid in `s` (sandbox mode needed for the loads). Bus ids B1..B10, units U1 coal, U2 gas, U3 wind, U4 pv. */
export function populate(s: GridState, opts: { wind?: boolean; pv?: boolean } = {}): void {
  const A = TEST_ACTIONS;
  const bus = (x: number, y: number, kv: number, kind: string, vSet?: number): void => must(A.placeBus!(s, x, y, kv, kind, vSet) as never);
  bus(2, 2, 132, 'gen', 1.02); bus(10, 2, 132, 'gen', 1.02); bus(18, 2, 132, 'gen', 1.0); bus(18, 10, 132, 'sub'); bus(10, 10, 132, 'sub'); bus(2, 10, 132, 'sub');
  bus(18, 14, 33, 'load'); bus(10, 14, 33, 'load'); bus(2, 14, 132, 'load'); bus(14, 6, 132, 'load');
  const line = (a: string, b: string): void => must(A.stringLine!(s, a, b, 'l132-panther', 2, 30) as never);
  line('B1', 'B2'); line('B2', 'B3'); line('B3', 'B4'); line('B4', 'B5'); line('B5', 'B6'); line('B6', 'B1'); line('B2', 'B5'); line('B6', 'B9'); line('B4', 'B10'); line('B2', 'B10');
  must(A.placeTransformer!(s, 'B4', 'B7', 't-x132-33') as never); must(A.placeTransformer!(s, 'B5', 'B8', 't-x132-33') as never);
  must(A.placeUnit!(s, 't-coal', 'B1', 150) as never); must(A.placeUnit!(s, 't-gas', 'B2', 100) as never);
  if (opts.wind !== false) must(A.placeUnit!(s, 't-wind', 'B3', 40) as never);
  if (opts.pv !== false) must(A.placeUnit!(s, 't-pv', 'B6', 50) as never);
  must(A.placeLoad!(s, 'B7', 'residential', 40, 0.95) as never); must(A.placeLoad!(s, 'B8', 'commercial', 30, 0.95) as never);
  must(A.placeLoad!(s, 'B9', 'industrial', 45, 0.9) as never); must(A.placeLoad!(s, 'B10', 'residential', 35, 0.95) as never);
  s.actionLog = []; s.budget.spent = 0; delete s.purchases;   // the starting grid is not the player's move or spending
  for (const u of s.units) if (u.kind === 'coal' || u.kind === 'gas') { u.online = true; u.P = u.pMin; }
}

/** One-day level on the grid: lost on more than 5 MWh not served, won after 96 blocks. */
export const TEST_LEVEL: Level<GridState> = {
  id: 'TG1', title: 'Test grid day', brief: 'Keep the lights on for one day.', // lint-ok
  setup: (s) => { s.mode = 'sandbox'; populate(s); s.rules = { ...NO_RULES, horizonBlocks: 96, maxEnsMWh: 5, blackoutLoses: true, starCost: [1e9, 1e8] }; },
  goal: ruleGoal, fail: ruleFail, maxTicks: 200,
};

/** The same day with the coal unit tripping at block 40 and a storm at block 60 (exercises the event window and the weather events). */
export const TEST_LEVEL_TRIP: Level<GridState> = {
  id: 'TG2', title: 'Test grid trip', brief: 'Survive losing the coal unit.', // lint-ok
  setup: (s) => {
    s.mode = 'sandbox'; populate(s); s.rules = { ...NO_RULES, horizonBlocks: 96 };
    s.events.queue.push({ id: 'trip', day: 0, block: 40, kind: 'trip-unit', target: 'U1', magnitude: 0 }, { id: 'storm', day: 0, block: 60, kind: 'storm', target: '', magnitude: 6 });
  },
  goal: ruleGoal, fail: ruleFail, maxTicks: 200,
};

export const TEST_GAME: GameDef<GridState> = { ...GAME, actions: { ...GAME.actions, ...TEST_ACTIONS }, levels: [...(GAME.levels ?? []), TEST_LEVEL, TEST_LEVEL_TRIP] };
