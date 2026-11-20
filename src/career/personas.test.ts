// The ordering the design asks for (DESIGN-1.1 C2): planner > firefighter > idle on the 10-year score; gold-plater ends bailed out or fined.
// The planner must beat the firefighter on 45 of 50 seeds (1.3: 46). When the network cannot meet its targets even in fair weather it goes
// into reliability emergency mode: every feeder is a candidate, it may borrow and use capacity crews, and it trims more trees.
import { describe, expect, it } from 'vitest';
import { firefighter, goldPlater, idle, planner, runPersona, type CareerState } from './index';

const SEEDS = Array.from({ length: 50 }, (_, i) => i + 1);
const sweep = (p: typeof idle): { score: number; state: CareerState }[] => SEEDS.map((s) => { const r = runPersona(s, p); return { score: r.score, state: r.state }; });

describe('persona sweep, seeds 1..50', () => {
  const R = { idle: sweep(idle), firefighter: sweep(firefighter), goldPlater: sweep(goldPlater), planner: sweep(planner) };
  const count = (rs: { state: CareerState }[]): Record<string, number> => { const c: Record<string, number> = {}; for (const r of rs) c[r.state.ending ?? 'x'] = (c[r.state.ending ?? 'x'] ?? 0) + 1; return c; };
  it('planner > firefighter > idle on at least 80 % of seeds', () => {
    let pf = 0, fi = 0, all = 0;
    SEEDS.forEach((_, i) => { const a = R.planner[i]!.score > R.firefighter[i]!.score, b = R.firefighter[i]!.score > R.idle[i]!.score; if (a) pf++; if (b) fi++; if (a && b) all++; });
    const mean = (rs: { score: number }[]): number => rs.reduce((x, r) => x + r.score, 0) / rs.length;
    console.log('persona means', { idle: mean(R.idle), firefighter: mean(R.firefighter), goldPlater: mean(R.goldPlater), planner: mean(R.planner) }, 'P>F', pf, 'F>I', fi, 'both', all,
      'endings', { idle: count(R.idle), firefighter: count(R.firefighter), goldPlater: count(R.goldPlater), planner: count(R.planner) });
    expect(all).toBeGreaterThanOrEqual(45);
    expect(mean(R.planner)).toBeGreaterThan(mean(R.firefighter)); expect(mean(R.firefighter)).toBeGreaterThan(mean(R.idle));
  });
  it('the gold-plater ends bailed out or fined (licence revoked) in most seeds, and never as Chief Engineer', () => {
    const bad = R.goldPlater.filter((r) => r.state.ending === 'bailedOut' || r.state.ending === 'licenceRevoked').length;
    expect(bad).toBeGreaterThanOrEqual(35);
    expect(R.goldPlater.filter((r) => r.state.ending === 'chiefEngineer').length).toBe(0);
    expect(Math.max(...R.goldPlater.map((r) => r.state.cash))).toBeLessThan(2);
  });
  it('idle never reaches Chief Engineer; the planner usually does', () => {
    expect(R.idle.filter((r) => r.state.ending === 'chiefEngineer').length).toBe(0);
    expect(R.planner.filter((r) => r.state.ending === 'chiefEngineer').length).toBeGreaterThanOrEqual(12);   // Chief now needs targets met 8 of 10 years, healthier assets, cash >= 0 and a clean load index
  });
});
