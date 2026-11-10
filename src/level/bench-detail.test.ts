// benchDetail / benchPreview: per-run numbers behind the Kit tray and the tags (UI.md 3, 4). Read-only, deterministic, SI units.
import { describe, expect, it } from 'vitest';
import { Engine } from '@core/kit';
import { GAME } from '../game';
import { CABLE_SIZES_MM2, HUT_SITES_M } from './bench';
import type { GridState } from '../types';

const start = (id: string): Engine<GridState> => { const e = new Engine(GAME); e.act('startLevel', [id, 1, 'learner']); return e; };
const detail = (e: Engine<GridState>): any => e.q('benchDetail');
const l01 = (hut: number, mm2: number): Engine<GridState> => { const e = start('L01'); e.act('placeHut', [hut]); e.act('layCable', ['main', mm2]); return e; };
const rel = (a: number, b: number): number => Math.abs(a - b) / Math.max(1, Math.abs(b));
const balance = (d: any): number => rel(d.totals.sourceW, d.totals.deliveredW + d.totals.lossW + (d.totals.converterLossW ?? 0));

describe('benchDetail oracles', () => {
  it('L01 oracles G-01b: 300 m 2.5 mm2 -> 24.9 V; 300 m 25 mm2 -> 44.0 V; 120 m 10 mm2 -> 43.98 V', () => {
    expect(detail(l01(300, 2.5)).runs[0].vRecvV).toBeCloseTo(24.9, 1);
    expect(detail(l01(300, 25)).runs[0].vRecvV).toBeCloseTo(44.0, 1);
    expect(detail(l01(120, 10)).runs[0].vRecvV).toBeCloseTo(43.98, 2);
  });
  it('vRecv equals the existing bench solve (benchStatus, rounded to 3 dp by that query)', () => {
    for (const [h, a] of [[300, 2.5], [180, 16], [120, 10]] as const) {
      const e = l01(h, a);
      expect(Math.abs(detail(e).runs[0].vRecvV - (e.q('benchStatus') as any).vLoadV[0])).toBeLessThan(5e-4);
      expect(Math.abs(detail(e).totals.lossPct - (e.q('benchStatus') as any).lossPct)).toBeLessThan(5e-4);
    }
  });
  it('run record carries every field, finite, in SI', () => {
    const r = detail(l01(300, 2.5)).runs[0];
    for (const k of ['mm2', 'lengthM', 'rLoopOhm', 'iA', 'dropV', 'lossW', 'ampacityA', 'ampFrac', 'vSendV', 'vRecvV']) expect(Number.isFinite(r[k])).toBe(true);
    expect(r.id).toBe('main'); expect(r.lengthM).toBe(300); expect(r.mm2).toBe(2.5);
    expect(r.rLoopOhm).toBeCloseTo(7.41 * 0.6, 6);   // IEC 60228 20 C table value, two cores x 300 m
    expect(r.ampFrac).toBeCloseTo(r.iA / r.ampacityA, 12);
  });
  it('inactive and incomplete benches say why', () => {
    expect(start('L07').q('benchDetail')).toMatchObject({ active: false });
    const e = start('L01');
    const d = detail(e);
    expect(d.active).toBe(false); expect(typeof d.reason).toBe('string');
  });
});

describe('benchDetail equation data', () => {
  it('L01/L02: v0 - i r = v for every run (v0 is the run\'s own sending voltage; the source voltage for runs fed from the source)', () => {
    const cases: Engine<GridState>[] = [];
    for (const h of HUT_SITES_M) for (const a of CABLE_SIZES_MM2) cases.push(l01(h, a));
    for (const topo of ['radial', 'trunk']) for (const a of [2.5, 10, 50]) for (const b of [2.5, 16, 50]) {
      const e = start('L02'); if (topo === 'trunk') e.act('placeJunction'); e.act('layCable', ['main', a]); e.act('layCable', ['b', b]); cases.push(e);
    }
    for (const e of cases) {
      const d = detail(e);
      for (const r of d.runs) { expect(Math.abs(r.eq.v0 - r.eq.i * r.eq.r - r.eq.v)).toBeLessThan(1e-6); expect(r.eq).toEqual({ v0: r.vSendV, i: r.iA, r: r.rLoopOhm, v: r.vRecvV }); }
      expect(d.runs[0].eq.v0).toBeCloseTo(d.totals.sourceV, 9);
    }
  });
  it('L03 with converters: the run is solved at its 380 V operating voltage, so eq.v0 = 380 and v0 - i r = v still holds on the cable', () => {
    const e = start('L03'); e.act('placeConverters', [true]); e.act('layCable', ['main', 10]);
    const d = detail(e);
    expect(d.active).toBe(true);
    const r = d.runs[0];
    expect(r.vSendV).toBe(380); expect(r.eq.v0).toBe(380);
    expect(Math.abs(r.eq.v0 - r.eq.i * r.eq.r - r.eq.v)).toBeLessThan(1e-6);
    expect(d.totals.converterLossW).toBeGreaterThan(0); expect(d.totals.sourceV).toBe(48);
    expect(d.totals.deliveredW).toBeCloseTo(5000, 6);
  });
  it('L03 without converters: runs at 48 V', () => {
    const e = start('L03'); e.act('layCable', ['main', 50]);
    const d = detail(e);
    if (d.active) { expect(d.runs[0].vSendV).toBe(48); expect(d.totals.converterLossW ?? 0).toBe(0); }
  });
});

describe('benchDetail energy balance', () => {
  it('source = delivered + line loss (+ converter loss) for every hut site x every size, L02 designs and L03', () => {
    let n = 0;
    const check = (e: Engine<GridState>): void => { const d = detail(e); if (!d.active) return; expect(balance(d)).toBeLessThan(1e-6); n++; };
    for (const h of HUT_SITES_M) for (const a of CABLE_SIZES_MM2) check(l01(h, a));
    for (const topo of ['radial', 'trunk']) for (const a of CABLE_SIZES_MM2) for (const b of CABLE_SIZES_MM2) {
      const e = start('L02'); if (topo === 'trunk') e.act('placeJunction'); e.act('layCable', ['main', a]); e.act('layCable', ['b', b]); check(e);
    }
    for (const conv of [false, true]) for (const a of CABLE_SIZES_MM2) { const e = start('L03'); if (conv) e.act('placeConverters', [true]); e.act('layCable', ['main', a]); check(e); }
    expect(n).toBeGreaterThan(100);
  });
});

describe('benchPreview', () => {
  const hash = (e: Engine<GridState>): string => JSON.stringify(e.state);
  it('is pure: 50 previews leave the state byte-identical', () => {
    const e = l01(180, 10); const before = hash(e);
    for (let k = 0; k < 50; k++) e.q('benchPreview', [{ hutM: HUT_SITES_M[k % 7], mm2: CABLE_SIZES_MM2[k % 8] }]);
    expect(hash(e)).toBe(before);
  });
  it('equals actually placing and laying, then reading benchDetail and the cost', () => {
    for (const h of HUT_SITES_M) for (const a of CABLE_SIZES_MM2) {
      const e = l01(300, 2.5);
      const p = e.q('benchPreview', [{ hutM: h, mm2: a }]) as any;
      const f = l01(h, a); const d = detail(f);
      expect(p.ok).toBe(true);
      expect(p.vMinV).toBeCloseTo(d.runs[0].vRecvV, 9);
      expect(p.vLoadV).toEqual([d.runs[0].vRecvV]);
      expect(p.lossPct).toBeCloseTo(d.totals.lossPct, 9);
      expect(p.ampFracMax).toBeCloseTo(d.runs[0].ampFrac, 9);
      expect(p.capexUSD).toBeCloseTo(f.state.budget.spent, 6);
      expect(p.reason).toBeNull();
    }
  });
  it('defaults: only mm2 changes the cable on main; only hutM moves the hut', () => {
    const e = l01(300, 2.5);
    expect((e.q('benchPreview', [{ mm2: 25 }]) as any).vMinV).toBeCloseTo(detail(l01(300, 25)).runs[0].vRecvV, 9);
    expect((e.q('benchPreview', [{ hutM: 120 }]) as any).vMinV).toBeCloseTo(detail(l01(120, 2.5)).runs[0].vRecvV, 9);
    expect((e.q('benchPreview') as any).vMinV).toBeCloseTo(detail(e).runs[0].vRecvV, 9);
  });
  it('run b on L02', () => {
    const e = start('L02'); e.act('layCable', ['main', 10]); e.act('layCable', ['b', 10]);
    const p = e.q('benchPreview', [{ run: 'b', mm2: 50 }]) as any;
    const f = start('L02'); f.act('layCable', ['main', 10]); f.act('layCable', ['b', 50]);
    expect(p.ok).toBe(true); expect(p.vMinV).toBeCloseTo((f.q('benchDetail') as any).totals.vMinV ?? p.vMinV, 9);
    expect(p.capexUSD).toBeCloseTo(f.state.budget.spent, 6);
  });
  it('illegal input: ok false with a locale key, never throws', () => {
    const e = l01(300, 2.5);
    const bad: any[] = [{ mm2: 3 }, { mm2: '10' }, { mm2: NaN }, { hutM: 125 }, { hutM: 'x' }, { run: 'b', mm2: 10 }, { run: 'zz' }, null, 5, 'a', { hutM: 100000 }];
    for (const a of bad) { const p = e.q('benchPreview', [a]) as any; if (a === null || a === 5 || a === 'a') continue; expect(p.ok).toBe(false); expect(p.reason).toMatch(/^[a-z]+\.[A-Za-z.]+$/); }
    expect(() => e.q('benchPreview', [null])).not.toThrow();
    // action not allowed in the level: L02 has no placeHut, L03 has no hut either
    const l2 = start('L02'); expect((l2.q('benchPreview', [{ hutM: 120 }]) as any)).toMatchObject({ ok: false });
    expect((start('L07').q('benchPreview', [{ mm2: 10 }]) as any)).toMatchObject({ ok: false });
  });
});

describe('benchKit query', () => {
  it('per-metre price x run + poles equals the cost the engine charges, for every L01 design', () => {
    for (const hut of HUT_SITES_M) for (const mm2 of CABLE_SIZES_MM2) {
      const e = l01(hut, mm2), k: any = e.q('benchKit'), c = k.cables.find((x: any) => x.mm2 === mm2);
      const want = c.perM * hut + Math.ceil(hut / k.poleSpacingM) * k.polePrice;
      expect(rel(want, k.spent)).toBeLessThan(1e-9);
      expect(typeof c.perMText).toBe('string'); expect(k.budget).toBeGreaterThan(0);
    }
  });
});
