// A synthetic 60-bus / 90-branch sandbox grid at the DESIGN 3.15 caps, for the perf harness (not shipped data). Ten rows of six
// 132 kV buses, 90 lines, 16 generating units on 12 buses (coal, gas, wind, PV) and 48 loads. Built through the real actions.
import type { Level } from '@core/kit';
import type { GridState } from './types';
import { TEST_ACTIONS } from './testgrid';
import { NO_RULES, ruleFail, ruleGoal } from './rules';

const must = (r: { ok: boolean; message: string }): void => { if (!r.ok) throw new Error(`test grid 60: ${r.message}`); };

export function populate60(s: GridState): void {
  const A = TEST_ACTIONS;
  const W = 6, H = 10;
  const id = (r: number, c: number): string => `B${r * W + c + 1}`;
  const genAt = new Set([0, 2, 5, 12, 14, 17, 30, 33, 36, 41, 48, 53]);   // flat indices of the generator buses
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) must(A.placeBus!(s, 2 + c * 4, 2 + r * 4, 132, genAt.has(r * W + c) ? 'gen' : 'load', genAt.has(r * W + c) ? 1.02 : undefined) as never);
  const line = (a: string, b: string): void => must(A.stringLine!(s, a, b, 'l132-panther', 2, 15) as never);
  for (let r = 0; r < H; r++) for (let c = 0; c < W - 1; c++) line(id(r, c), id(r, c + 1));          // 50 horizontal
  for (const c of [0, 5, 2, 3]) for (let r = 0; r < H - 1; r++) line(id(r, c), id(r + 1, c));        // 36 vertical
  for (let r = 0; r < 4; r++) line(id(r, 1), id(r + 1, 1));                                          // 4 more = 90
  const kinds = ['t-coal', 't-coal', 't-gas', 't-coal', 't-gas', 't-wind', 't-coal', 't-gas', 't-pv', 't-coal', 't-gas', 't-pv'];
  [...genAt].sort((a, b) => a - b).forEach((i, k) => {
    const kind = kinds[k]!; const mw = kind === 't-wind' || kind === 't-pv' ? 60 : 120;
    must(A.placeUnit!(s, kind, `B${i + 1}`, mw) as never);
    if (k % 3 === 0) must(A.placeUnit!(s, 't-gas', `B${i + 1}`, 40) as never);                       // a second unit on some buses
  });
  const classes = ['residential', 'commercial', 'industrial'] as const;
  for (let i = 0; i < W * H; i++) if (!genAt.has(i)) must(A.placeLoad!(s, `B${i + 1}`, classes[i % 3]!, 14, 0.95) as never);
  s.actionLog = []; s.budget.spent = 0; delete s.purchases;
  for (const u of s.units) if (u.kind === 'coal' || u.kind === 'gas') { u.online = true; u.P = u.pMin; }
}

/** A 7-day-capable level on the 60-bus grid (the horizon is long so a run is never cut short by the verdict). */
export const LEVEL_60: Level<GridState> = {
  id: 'TG60', title: 'Test grid 60', brief: 'Perf case.', // lint-ok
  setup: (s) => { s.mode = 'sandbox'; populate60(s); s.rules = { ...NO_RULES, horizonBlocks: 96 * 7 }; },
  goal: ruleGoal, fail: ruleFail, maxTicks: 1000,
};
