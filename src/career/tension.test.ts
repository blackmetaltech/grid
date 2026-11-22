// 1.12 cash tension, proven with the scripted players rather than a tuned constant:
// - the careful planner never fails and ends with little slack (the owners take idle cash; capacity has to be planned and borrowed for);
// - the purely reactive player (answers faults and failures, accepts every connection, never reinforces) loses the licence or is bailed out
//   (on High Moor, where the load is light, it may last ten years but scores under half the planner);
// - the late firefighter (also reconductors a feeder once it sheds hours a year) is never Chief and scores well below the planner;
// - the gold-plater (buys everything it can) fails.
import { describe, expect, it } from 'vitest';
import { firefighter, goldPlater, planner, reactiveOnly, runPersona } from './personas';

const SEEDS = [1, 5, 11, 23];
const failed = (e: string | null): boolean => e === 'licenceRevoked' || e === 'bailedOut';

describe('cash tension', () => {
  for (const ch of ['standard', 'city', 'storm', 'lean', 'moor'] as const) {
    it(`${ch}: the planner ends with little slack and never fails; the reactive player and the gold-plater fail; the late firefighter trails`, () => {
      let pSum = 0, fSum = 0;
      for (const seed of SEEDS) {
        const p = runPersona(seed, planner, 40, ch), f = runPersona(seed, firefighter, 40, ch);
        expect(failed(p.state.ending), `${ch}/${seed} planner ${p.state.ending}`).toBe(false);
        expect(Math.max(...p.state.history.map((k) => k.cash)), `${ch}/${seed} planner peak cash`).toBeLessThan(10);
        expect(p.state.cash, `${ch}/${seed} planner end cash`).toBeLessThan(5);
        const r = runPersona(seed, reactiveOnly, 40, ch);
        // High Moor's light load rarely overloads, so a reactive player can last ten years there on one seed in four: it still ends far behind
        if (ch === 'moor') expect(failed(r.state.ending) || r.score < 0.5 * p.score, `${ch}/${seed} reactiveOnly ${r.state.ending} ${r.score}`).toBe(true);
        else expect(failed(r.state.ending), `${ch}/${seed} reactiveOnly`).toBe(true);
        expect(failed(runPersona(seed, goldPlater, 40, ch).state.ending), `${ch}/${seed} goldPlater`).toBe(true);
        expect(f.state.ending, `${ch}/${seed} firefighter`).not.toBe('chiefEngineer');
        pSum += p.score; fSum += f.score;
      }
      expect(fSum, `${ch}: firefighter total vs planner total`).toBeLessThan(0.75 * pSum);
    }, 400000);
  }
  it('the owners take the idle cash: a reactive player pays dividends instead of banking them', () => {
    const f = runPersona(5, firefighter, 40, 'standard').state;
    expect(f.dividendsM ?? 0).toBeGreaterThan(3);
  }, 300000);
});
