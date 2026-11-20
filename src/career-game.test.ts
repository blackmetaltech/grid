// Career wiring: the actions drive the pure engine through GridState.career, the code is the save, money is in the region's currency,
// and every string a career can show resolves.
import { describe, expect, it } from 'vitest';
import { Env } from '@core/kit';
import { GAME } from './game';
import { en } from './locales/en';
import { careerMoney, USD_PER_GBP } from './career-game';
import { PERSONAS, runPersona, PROJECT_KINDS } from './career';
import type { GridState } from './types';

const play = (region = 'global'): Env<GridState> => { const e = new Env(GAME); e.reset({ seed: 7, region }); return e; };
const q = (e: Env<GridState>, name: string, ...args: unknown[]): any => (GAME.queries![name] as any)(e.state, ...args);
const act = (e: Env<GridState>, name: string, ...args: unknown[]) => e.step({ name, args }).info as unknown as { ok: boolean; message: string; key: string };

describe('career wiring', () => {
  it('starts, plans, runs a year through incidents, and the code replays to the same state', () => {
    const e = play();
    expect(q(e, 'career').active).toBe(false);
    expect(act(e, 'careerProject', 'recloser', 'F1').ok).toBe(false);
    expect(act(e, 'careerStart', 11).ok).toBe(true);
    const c0 = q(e, 'career');
    expect(c0.feeders.length).toBe(9); expect(c0.primaries.length).toBe(2); expect(c0.year).toBe(1);
    expect(act(e, 'careerProject', 'recloser', 'F1').ok).toBe(true);
    expect(act(e, 'careerProject', 'recloser', 'F1').ok).toBe(false);   // duplicate
    expect(act(e, 'careerProject', 'teleporter', 'F1').ok).toBe(false);
    expect(act(e, 'careerVegetation', 2).ok).toBe(true);
    for (let i = 0; i < 4; i++) {
      const r = act(e, 'careerEndQuarter');
      expect(r.ok).toBe(true);
      if (e.state.career!.state.phase === 'incident') {
        for (const inc of q(e, 'career').incidents) { if (inc.hasTie) act(e, 'careerTie', inc.id); act(e, 'careerCrew', inc.id); }
        expect(act(e, 'careerEndQuarter').ok).toBe(true);
      }
    }
    const c = q(e, 'career');
    expect(c.year).toBe(2); expect(c.reviews.length).toBe(1); expect(c.reviews[0].verdicts.length).toBe(3);
    expect(typeof c.reviews[0].overloaded).toBe('number');
    for (const r of c.requests) expect(r.loadingAfterPct).toBeGreaterThanOrEqual(c.feeders.find((f: any) => f.id === r.feederId).loadingPct - 0.05);
    for (const v of c.reviews[0].verdicts) expect(v.text).not.toMatch(/\{|career\./);
    const f = play();
    expect(act(f, 'careerLoad', c.code).ok).toBe(true);
    expect(JSON.stringify(f.state.career!.state)).toBe(JSON.stringify(e.state.career!.state));
    expect(act(f, 'careerLoad', 'nonsense').ok).toBe(false);
  });

  it('money is the same build in the pack currency (US$ per GBP x the pack factor)', () => {
    const g = play('global'), i = play('in');
    act(g, 'careerStart', 3); act(i, 'careerStart', 3);
    expect(q(i, 'career').cash / q(g, 'career').cash).toBeCloseTo(83, 6);
    expect(careerMoney({ region: 'global' }, 1)).toBeCloseTo(1e6 * USD_PER_GBP, 6);
    const qt = q(g, 'careerQuote', 'tieSwitch', 'F2');
    expect(qt.capexText).toMatch(/\d/); expect(qt.text).not.toMatch(/\{/);
  });

  it('the board lists buildable options and every quote and refusal resolves', () => {
    const e = play(); act(e, 'careerStart', 5);
    const b = q(e, 'careerBoard');
    expect(b.kinds.length).toBe(PROJECT_KINDS.length);
    for (const k of b.kinds) { expect(en[`career.kind.${k.kind}`]).toBeTruthy(); expect(en[`career.blurb.${k.kind}`]).toBeTruthy(); }
    expect(b.kinds.find((k: any) => k.kind === 'reconductor').options.length).toBeGreaterThan(0);
    const tx = q(e, 'careerQuote', 'replaceAssets', 'P1-T1');
    expect(tx.ok).toBe(true); expect(tx.why).toMatch(/fails in the next year/); expect(tx.why).not.toMatch(/\{/);
    const nf = q(e, 'careerQuote', 'newFeeder', 'P1');
    expect(nf.loadingBeforePct).toBeGreaterThan(0); expect(nf.loadingAfterPct).toBeLessThan(nf.loadingBeforePct);   // the busiest feeder of P1 is split
    for (const k of b.kinds) for (const o of k.options.slice(0, 2)) { const qt = q(e, 'careerQuote', k.kind, o.target); expect(qt.ok).toBe(true); expect(qt.why).not.toMatch(/\{|career\./); }
  });

  it('every career persona ending and message key has a string', () => {
    for (const end of ['chiefEngineer', 'steady', 'bailedOut', 'licenceRevoked']) { expect(en[`career.ending.${end}`]).toBeTruthy(); expect(en[`career.endingName.${end}`]).toBeTruthy(); }
    for (const p of PERSONAS) {
      const r = runPersona(9, p, 12);
      for (const rv of r.state.reviews) for (const v of rv.verdicts) expect(en[v.key], v.key).toBeTruthy();
      for (const x of r.state.incidents) expect(en[`career.incident.${x.kind}`]).toBeTruthy();
      for (const x of r.state.requests) expect(en[`career.conn.${x.kind}`]).toBeTruthy();
    }
  });
});

describe('1.3 charters in the game', () => {
  it('careerStart takes a charter, careerWeekly a week; the query and code carry them', () => {
    const e = play();
    expect(act(e, 'careerStart', 4, 'boom').ok).toBe(true);
    let c = q(e, 'career');
    expect(c.charter).toBe('boom'); expect(String(c.charterName)).toBe('Boomtown'); expect(String(c.code).startsWith('C2/4/boom/')).toBe(true);
    expect(act(e, 'careerLoad', String(c.code)).ok).toBe(true); expect(q(e, 'career').charter).toBe('boom');
    expect(act(e, 'careerWeekly', 2026, 47).ok).toBe(true);
    c = q(e, 'career'); expect(c.weekly).toBe('2026-W47'); expect(c.charter).not.toBe('standard');
    expect(act(e, 'careerWeekly', 2026, 60).ok).toBe(false);
    const ch = q(e, 'careerCharters', 2026, 47);
    expect(ch.charters).toHaveLength(7); expect(ch.weekly.key).toBe('2026-W47'); expect(ch.weekly.charter).toBe(c.charter);
  });
});
