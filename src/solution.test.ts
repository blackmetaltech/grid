// Solution codes: the expert's run becomes a code; the verifier replays it to the same score; cheats do not verify.
import { describe, expect, it } from 'vitest';
import { Engine, Env, decodeSolution, encodeSolution } from '@core/kit';
import { GAME } from './game';
import { verify } from './verify';

function expertRun(region?: string, level = 'steady'): Engine<any> {
  const env = new Env(GAME); env.reset({ seed: 1, level, region });
  const agent = GAME.levels!.find((l) => l.id === level)!.solver!(1);
  for (let i = 0; i < 120 && env.state.status === 'playing'; i++) {
    for (const a of agent(env.state, env.ctx({} as any))) env.step(a);
    if (env.state.status === 'playing') env.step({ name: 'tick' });
  }
  return env.engine;
}

describe('solution codes of the sample game', () => {
  it('free play has no code', () => expect(new Engine(GAME).q('solutionCode')).toBeNull());
  it('the expert run verifies, with the metrics the game computes', () => {
    const e = expertRun(); expect(e.state.status).toBe('won');
    const code = e.q('solutionCode') as string;
    const r = verify('steady', code);
    expect(r.ok).toBe(true); expect(r.reason).toBe('won'); expect(r.ruleset).toBe('grid:global@1.1');
    expect(r.ticks).toBe(e.state.tick - e.state.levelStart);
    expect(r.metrics).toEqual({ ticks: r.ticks, waterUsedM3: e.state.waterUsedM3 });
    expect(r.metrics.waterUsedM3).toBeGreaterThan(0);
    expect(verify('steady', code)).toEqual(r);                        // same code, same result
    expect(verify('steady', code, { region: 'global' }).ok).toBe(true);
  });
  it('the same moves give the same code (determinism)', () => expect(expertRun().q('solutionCode')).toBe(expertRun().q('solutionCode')));
  it('a tampered code fails the checksum', () => {
    const code = expertRun().q('solutionCode') as string;
    const parts = code.split('.'); parts[1] = parts[1]!.slice(0, 10) + (parts[1]![10] === 'A' ? 'B' : 'A') + parts[1]!.slice(11);
    const r = verify('steady', parts.join('.')); expect(r.ok).toBe(false); expect(r.reason).toMatch(/checksum/);
  });
  it('a re-encoded edit (valid checksum) is replayed, not trusted: a shorter cheat does not win', () => {
    const d = decodeSolution(expertRun().q('solutionCode') as string) as any;
    const cheat = encodeSolution({ ...d, actions: d.actions.slice(0, 2) });
    const r = verify('steady', cheat); expect(r.ok).toBe(false); expect(r.reason).toMatch(/not won/);
    const wrong = encodeSolution({ ...d, actions: [['setValve', [140]], ...d.actions] });
    expect(verify('steady', wrong).reason).toMatch(/Action 1 \(setValve\) rejected: A valve opens from 0 %/);
  });
  it('a code from a different region (ruleset) is not ok on the global board, but verifies in its own region', () => {
    const code = expertRun('in').q('solutionCode') as string;
    expect((decodeSolution(code) as any).ruleset).toBe('grid:in@1.1');
    const global = verify('steady', code, { region: 'global' }); expect(global.ok).toBe(false); expect(global.reason).toMatch(/Region mismatch/);
    const own = verify('steady', code); expect(own.ok).toBe(true); expect(own.ruleset).toBe('grid:in@1.1');
  });
  it('a code from another ruleset version is a clean not-ok', () => {
    const d = decodeSolution(expertRun().q('solutionCode') as string) as any;
    for (const old of ['grid:global@1.0', 'grid:global@2.1', 'grid:global@1']) {
      const r = verify('steady', encodeSolution({ ...d, ruleset: old })); expect(r.ok, old).toBe(false); expect(r.reason, old).toMatch(/Ruleset mismatch/);
    }
  });
  it('an idle run produces a code that does not verify', () => {
    const env = new Env(GAME); env.reset({ seed: 1, level: 'steady' }); for (let i = 0; i < 200 && env.state.status === 'playing'; i++) env.step({ name: 'tick' });
    const code = env.engine.q('solutionCode') as string; expect(code).toMatch(/^CB1\./);
    const r = verify('steady', code); expect(r.ok).toBe(false); expect(r.reason).toMatch(/not won/);
  });
  it('wrong level / junk input never throw', () => {
    const code = expertRun().q('solutionCode') as string;
    expect(verify('nope', code).ok).toBe(false);
    for (const junk of ['', 'x', 'CB1.a.b', code.slice(0, 20), '{}']) expect(verify('steady', junk).ok).toBe(false);
  });
});
