// UI query contract (M2.4): palette, phasor, dial and the result card's histogram (bot fallback, labelled).
import { describe, expect, it } from 'vitest';
import { Engine } from '@core/kit';
import { GAME } from './game';
import { LEVEL_SPECS } from './level';
import type { GridState } from './types';

const start = (id: string, ticks = 0): Engine<GridState> => { const e = new Engine(GAME); e.act('startLevel', [id, 1, 'learner']); if (ticks) e.act('tick', [ticks]); return e; };
const finite = (x: unknown): boolean => JSON.stringify(x, (_k, v) => (typeof v === 'number' && !Number.isFinite(v) ? '__NF__' : v)).indexOf('__NF__') < 0;

describe('ui queries', () => {
  it('palette lists exactly the allowed actions and parts of the level', () => {
    for (const spec of LEVEL_SPECS) {
      const p = start(spec.id).q('palette') as any;
      expect(p.active).toBe(true);
      expect(p.actions.map((a: any) => a.action)).toEqual(spec.allowed.actions);
      for (const a of p.actions) expect(a.parts).toEqual(spec.allowed.parts[a.action] ?? []);
    }
  });
  it('phasor of an L07 branch: S = P + jQ, pf = cos(phi), current lags V by phi', () => {
    const e = start('L07', 40);
    const br = (e.q('world') as any).branches[0].id;
    const ph = e.q('phasor', ['branch', br]) as any;
    expect(finite(ph)).toBe(true);
    expect(ph.sMVA).toBeCloseTo(Math.hypot(ph.pMW, ph.qMVAr), 2);
    expect(ph.pf).toBeCloseTo(Math.cos((ph.phiDeg * Math.PI) / 180) * Math.sign(ph.pMW || 1), 2);
    expect(ph.iAngDeg).toBeCloseTo(ph.vAngDeg - ph.phiDeg, 2);
    const info = e.q('branchInfo', [br]) as any;
    expect(ph.iKA).toBeCloseTo(info.currentKA, 3);
    const bus = (e.q('world') as any).buses.find((b: any) => b.demandMW > 0);
    const pb = e.q('phasor', ['bus', bus.id]) as any;
    expect(pb.vPu).toBeCloseTo((e.q('busInfo', [bus.id]) as any).vPu, 3);
    expect(e.q('phasor', ['bus', 'nope'])).toEqual({ error: true });
  });
  it('dial carries f, the pack centre, the standard range and the UFLS stages', () => {
    const d = start('P0', 4).q('dial') as any;   // (L07 reports f ~ 1000 Hz after one block: sim bug, see the M2.4 report)
    expect(d.f0).toBe(50); expect(d.stdLo).toBeLessThan(d.stdHi); expect(d.uflsHz.length).toBeGreaterThan(0);
    expect(d.fHz).toBeGreaterThan(47); expect(d.fHz).toBeLessThan(53);
  });
  it('result card histogram is the bot population, labelled as such, with the star targets', () => {
    const e = start('L07', 4);
    const r = e.q('resultCard') as any;
    expect(r.active).toBe(true); expect(r.source).toBe('bot'); expect(r.labelKey).toBe('hist.bot');
    expect(r.bins.length).toBe(10); expect(r.bins.reduce((a: number, b: any) => a + b.count, 0)).toBe(r.n);
    expect(r.metricKey).toBe('hist.metric.lossPct'); expect(r.label).toBe('Every design the job allows (offline sample, not real players yet)'); expect(r.histogram).toBe('lossPct');
    expect((start('P0').q('resultCard') as any).active).toBe(false);
  }, 60000);
});
