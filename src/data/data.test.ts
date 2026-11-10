// Data tests for the catalogues (GIGAWATT pattern): plausibility ranges, duplicate ids, source + confidence present, internal consistency,
// and the RELEASE gate (RELEASE=1 makes any `recall` in a shipping pack fatal; `global` carries none since M1.9, so the gate is also checked unconditionally).
import { describe, expect, it } from 'vitest';
import { ACSR, COPPER } from './conductors';
import { GOVERNORS } from './governors';
import { LINE_TEMPLATES } from './lineTemplates';
import { weakest, type SourcedRow } from './types';
import { CONFIDENCES, releaseGateProblems, type CatalogueRow, type Catalogues } from '../regions/data';
import { GLOBAL } from '../regions/global';
import { IN } from '../regions/in';
import { REGIONS } from '../regions';

const PACKS = [GLOBAL, IN];
const between = (v: number | null | undefined, lo: number, hi: number): boolean => v === null || v === undefined || (v >= lo && v <= hi);
const shared: [string, SourcedRow[]][] = [['ACSR', ACSR], ['COPPER', COPPER], ['GOVERNORS', GOVERNORS], ['LINE_TEMPLATES', LINE_TEMPLATES]];

describe('shared physics catalogues (src/data)', () => {
  it.each(shared)('%s: unique ids, source and a valid confidence on every row', (_n, rows) => {
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    for (const r of rows) { expect(r.source.trim().length, r.id).toBeGreaterThan(10); expect(CONFIDENCES, r.id).toContain(r.confidence); }
  });
  it.each(shared)('%s: row confidence is the weakest of its per-field tags', (_n, rows) => {
    for (const r of rows) if (r.fieldConfidence) expect(r.confidence, r.id).toBe(weakest(r.confidence, ...(Object.values(r.fieldConfidence) as any)));
  });
  it('no shared row is recall (the shared data ships with every pack)', () => {
    for (const [n, rows] of shared) for (const r of rows) { expect(r.confidence, `${n}/${r.id}`).not.toBe('recall'); for (const c of Object.values(r.fieldConfidence ?? {})) expect(c, `${n}/${r.id}`).not.toBe('recall'); }
  });
  it('ACSR: positive resistance, R falls and ampacity rises with area (Drake is on the US rating basis and is skipped)', () => {
    for (const r of ACSR) { expect(r.r20OhmPerKm).toBeGreaterThan(0); expect(r.amp75).toBeGreaterThan(0); expect(r.diaMm).toBeGreaterThan(5); expect(r.totalMm2).toBeGreaterThan(r.alMm2); }
    const bs = ACSR.filter((r) => r.ampBasis === 'bs215').sort((a, b) => a.alMm2 - b.alMm2);
    expect(bs.length).toBe(7);
    for (let i = 1; i < bs.length; i++) {
      expect(bs[i]!.r20OhmPerKm, bs[i]!.id).toBeLessThan(bs[i - 1]!.r20OhmPerKm); expect(bs[i]!.amp75, bs[i]!.id).toBeGreaterThan(bs[i - 1]!.amp75);
      expect(bs[i]!.amp85!, bs[i]!.id).toBeGreaterThan(bs[i]!.amp75);
    }
    expect(ACSR.find((r) => r.id === 'acsr-drake')!.ampBasis).toBe('us');
  });
  it('ACSR: R20 is about rho/Al-area (aluminium 2.83e-8 ohm m, datasheet R within -5 %..+6 %)', () => {
    for (const r of ACSR) { const ideal = 28.3 / r.alMm2; expect(r.r20OhmPerKm / ideal, r.id).toBeGreaterThan(0.95); expect(r.r20OhmPerKm / ideal, r.id).toBeLessThan(1.06); }
  });
  it('copper: R about 17.24/area (IEC 60228 max values sit a few percent above), ampacity monotonic in area', () => {
    for (const r of COPPER) { const ideal = 18.1 / r.areaMm2; expect(r.r20OhmPerKm / ideal, r.id).toBeGreaterThan(0.95); expect(r.r20OhmPerKm / ideal, r.id).toBeLessThan(1.1); }
    for (let i = 1; i < COPPER.length; i++) { expect(COPPER[i]!.areaMm2).toBeGreaterThan(COPPER[i - 1]!.areaMm2); expect(COPPER[i]!.r20OhmPerKm).toBeLessThan(COPPER[i - 1]!.r20OhmPerKm); expect(COPPER[i]!.ampacityAirA).toBeGreaterThan(COPPER[i - 1]!.ampacityAirA); }
  });
  it('governors: H-independent constants in range, X2 = X"d, X0 = 0.08, X"d < X\'d', () => {
    expect(GOVERNORS.map((g) => g.id)).toEqual(['steam', 'hydro', 'gas', 'diesel']);
    for (const g of GOVERNORS) {
      expect(g.xdpp).toBeGreaterThan(0.1); expect(g.xdp).toBeGreaterThan(g.xdpp); expect(g.xdp).toBeLessThan(0.5); expect(g.x2).toBe(g.xdpp); expect(g.x0).toBe(0.08);
      for (const v of [g.tG, g.tRH, g.tW, g.fHP]) expect(v === null || v > 0).toBe(true);
    }
  });
  it('line templates: R, X, B, Zc, SIL and thermal MVA are consistent with kV and the conductor', () => {
    for (const t of LINE_TEMPLATES) {
      const c = ACSR.find((r) => r.id === t.conductor)!; expect(c, t.id).toBeDefined();
      expect(t.rOhmKm, t.id).toBeCloseTo((c.r20OhmPerKm * 1.24) / t.nBundle, 3);
      expect(between(t.xOhmKm, 0.2, 0.5), t.id).toBe(true); expect(between(t.bUsKm, 2.5, 4.5), t.id).toBe(true);
      expect(t.zcOhm, t.id).toBeCloseTo(Math.sqrt(t.xOhmKm / (t.bUsKm * 1e-6)), -1);   // sqrt(x/b) within ~5 ohm
      expect(t.silMw, t.id).toBeGreaterThan(0);
      // thermal MVA = sqrt(3) kV I75 n; DESIGN prints it rounded (l33-dog prints 13 for 13.4)
      const calc = Math.sqrt(3) * t.kv * (c.amp75 / 1000) * t.nBundle;
      expect(Math.abs(t.thermalMva - calc) / calc, `${t.id}: ${t.thermalMva} vs ${calc.toFixed(2)}`).toBeLessThan(0.05);
    }
    expect(new Set(LINE_TEMPLATES.map((t) => t.id)).size).toBe(LINE_TEMPLATES.length);
    for (let i = 1; i < LINE_TEMPLATES.length; i++) expect(LINE_TEMPLATES[i]!.kv).toBeGreaterThanOrEqual(LINE_TEMPLATES[i - 1]!.kv);
  });
});

const NAMES = ['generators', 'transformers', 'compensation', 'storage', 'protection', 'lineCosts', 'cables', 'fuels'] as const;

describe.each(PACKS.map((p) => [p.id, p] as const))('pack %s catalogues', (_id, pack) => {
  const cat: Catalogues = pack.data.catalogues;
  const rows = (n: (typeof NAMES)[number]): any[] => cat[n] as any[];
  it('every catalogue is non-empty, ids are unique per catalogue, every row has a source and a valid confidence', () => {
    for (const n of NAMES) {
      expect(rows(n).length, n).toBeGreaterThan(0);
      expect(new Set(rows(n).map((r: CatalogueRow) => r.id)).size, `${n}: duplicate ids`).toBe(rows(n).length);
      for (const r of rows(n) as CatalogueRow[]) { expect(r.source.trim().length, `${n}/${r.id}`).toBeGreaterThan(8); expect(CONFIDENCES, `${n}/${r.id}`).toContain(r.confidence); }
    }
  });
  it('row confidence is the weakest of the per-field tags', () => {
    for (const n of NAMES) for (const r of rows(n) as CatalogueRow[]) if (r.fieldConfidence) expect(r.confidence, `${n}/${r.id}`).toBe(weakest(...(Object.values(r.fieldConfidence) as any)));
  });
  it('a game row carries an honest note or says so in its source', () => {
    for (const n of NAMES) for (const r of rows(n) as CatalogueRow[]) if (r.confidence === 'game' && n !== 'protection') expect(/game/i.test(`${r.source} ${r.note ?? ''}`), `${n}/${r.id}`).toBe(true);
  });
  it('generators: plausibility ranges (heat rate 6-18 MJ/kWh, H in [0, 10], ramp, droop, P_min, CO2)', () => {
    expect(rows('generators').map((g) => g.id)).toEqual(expect.arrayContaining(['diesel-1500', 'microhydro-250k', 'smallhydro-10', 'coal-sub-500', 'coal-sc-660', 'ccgt-418', 'ocgt-105', 'hydro-250', 'psp-250', 'pv-100', 'wind-50', 'biomass-10', 'synccon-100']));
    expect(rows('generators').length).toBe(14);
    for (const g of rows('generators')) {
      expect(between(g.heatRateMJkWh, 6, 18), g.id).toBe(true);
      if (g.heatRateMJkWh !== null && g.heatRateMJkWh !== undefined) expect(['coal', 'gas', 'diesel', 'nuclear', 'biomass'], g.id).toContain(g.kind);
      expect(between(g.hS, 0, 10), g.id).toBe(true); expect(between(g.pMinPct, 0, 100), g.id).toBe(true); expect(between(g.rampPctMin, 0, 100), g.id).toBe(true);
      expect(between(g.droopPct, 2, 12), g.id).toBe(true); expect(between(g.co2tPerMWh, 0, 1.2), g.id).toBe(true);
      if (g.startHotS != null && g.startColdS != null) expect(g.startColdS, g.id).toBeGreaterThanOrEqual(g.startHotS);
      if (g.capexPerKw != null) expect(g.capexPerKw, g.id).toBeGreaterThan(0);
    }
    // CO2 ordering and capex ordering the design relies on (PV < wind < coal < nuclear per kW in `global`)
    const by = (id: string) => rows('generators').find((g) => g.id === id);
    expect(by('ccgt-418').co2tPerMWh).toBeLessThan(by('coal-sc-660').co2tPerMWh); expect(by('coal-sc-660').co2tPerMWh).toBeLessThan(by('coal-sub-500').co2tPerMWh);
    expect(by('coal-sc-660').heatRateMJkWh).toBeLessThan(by('coal-sub-500').heatRateMJkWh); expect(by('ccgt-418').heatRateMJkWh).toBeLessThan(by('ocgt-105').heatRateMJkWh);
    if (pack.id === 'global') { const k = (id: string) => by(id).capexPerKw; expect(k('pv-100')).toBeLessThan(k('wind-50')); expect(k('wind-50')).toBeLessThan(k('coal-sc-660')); expect(k('coal-sc-660')).toBeLessThan(k('nuclear-1100')); }
  });
  it('transformers: ratings, ratios, %Z, X/R and losses in range', () => {
    for (const t of rows('transformers')) {
      expect(t.kvHv, t.id).toBeGreaterThan(t.kvLv); expect(t.mva, t.id).toBeGreaterThan(0);
      if (t.etaPct != null) { expect(between(t.etaPct, 90, 100), t.id).toBe(true); continue; }
      expect(between(t.zPct, 3, 20), t.id).toBe(true); expect(between(t.xr, 1, 80), t.id).toBe(true);
      expect(t.noLoadKw, t.id).toBeGreaterThan(0); expect(t.loadKw, t.id).toBeGreaterThan(t.noLoadKw);
      const lossFrac = (t.noLoadKw + t.loadKw) / (t.mva * 1000); expect(lossFrac, `${t.id}: full-load losses`).toBeLessThan(0.03);
      expect(lossFrac, t.id).toBeGreaterThan(0.001);
      if (t.price != null) expect(t.price, t.id).toBeGreaterThan(0);
    }
    const dts = rows('transformers').filter((t) => /^dt-/.test(t.id)).sort((a, b) => a.mva - b.mva);
    for (let i = 1; i < dts.length; i++) { expect(dts[i].noLoadKw).toBeGreaterThan(dts[i - 1].noLoadKw); expect(dts[i].loadKw).toBeGreaterThan(dts[i - 1].loadKw); }
    const pts = rows('transformers').filter((t) => t.pricePerMva != null);
    for (const t of pts) expect(t.price, t.id).toBeCloseTo(t.pricePerMva * t.mva, 0);
  });
  it('compensation: rating, price and derived resonance consistent', () => {
    for (const c of rows('compensation')) {
      if (c.mvar != null) expect(c.mvar, c.id).toBeGreaterThan(0);
      if (c.pricePerKvar != null) expect(c.pricePerKvar, c.id).toBeGreaterThan(0);
      if (c.detunePct != null) { expect(between(c.detunePct, 1, 20), c.id).toBe(true); expect(c.resonanceH, c.id).toBeCloseTo(1 / Math.sqrt(c.detunePct / 100), 2); expect(c.costFactor).toBeGreaterThan(1); }
    }
    expect(rows('compensation').filter((c) => c.kind === 'shunt-reactor').map((c) => c.mvar)).toEqual([50, 63, 80, 125]);
    expect(rows('compensation').filter((c) => /^cap-detuned/.test(c.id)).map((c) => [c.detunePct, c.resonanceH])).toEqual([[7, 3.78], [14, 2.67]]);
  });
  it('storage: efficiency, SoC window, response and cost consistency', () => {
    for (const s of rows('storage')) {
      expect(between(s.etaRt, 0.5, 1), s.id).toBe(true); expect(between(s.responseMs, 1, 600000), s.id).toBe(true);
      if (s.socMinPct != null) { expect(s.socMinPct, s.id).toBeLessThan(s.socMaxPct); expect(between(s.socMaxPct, 50, 100), s.id).toBe(true); }
      if (s.mwh != null) { expect(s.mwh, s.id).toBeGreaterThanOrEqual(s.mw); expect(s.mwh / s.mw, s.id).toBeLessThanOrEqual(8); }
      if (s.capexPerKw != null && s.capexPerKwh != null && s.mwh != null) expect(s.allInPerKw, s.id).toBeCloseTo(s.capexPerKw + (s.capexPerKwh * s.mwh) / s.mw, 1);
      expect(s.allInPerKw ?? 0, s.id).toBeGreaterThan(0);
    }
    const duration = (id: string) => { const s = rows('storage').find((x) => x.id === id); return s.mwh / s.mw; };
    expect([duration('bess-2h-50'), duration('bess-4h-50'), duration('bess-gfm-50')]).toEqual([2, 4, 1]);
    expect(rows('storage').find((s) => s.id === 'bess-gfm-50').hVs).toBe(4);
  });
  it('protection: IEC 60255-151 constants exact; breaker ratings are R10 values; settings ranges sane', () => {
    const p = (id: string) => rows('protection').find((r) => r.id === id);
    expect([p('idmt-si').params, p('idmt-vi').params, p('idmt-ei').params, p('idmt-lti').params].map((x: any) => [x.k, x.alpha, x.c])).toEqual([[0.14, 0.02, 0], [13.5, 1, 0], [80, 2, 0], [120, 1, 0]]);
    for (const id of ['idmt-si', 'idmt-vi', 'idmt-ei', 'idmt-lti']) expect(p(id).confidence).toBe('standard');
    const r10 = [10, 12.5, 16, 20, 25, 31.5, 40, 50, 63, 80, 100];
    for (const ka of p('breaker-r10').params.ratingsKa) expect(r10).toContain(ka);
    const s = p('idmt-ranges').params; expect(s.isMinPctCt).toBeLessThan(s.isMaxPctCt); expect(s.tmsMin).toBeLessThan(s.tmsMax); expect(s.ctiS).toBeGreaterThan(0);
    const d = p('distance-relay').params; expect(d.z1Pct).toBeLessThan(100); expect(d.z2Pct).toBeGreaterThan(100); expect(d.z1S).toBeLessThan(d.z2S); expect(d.z2S).toBeLessThan(d.z3S);
    const thd = p('thd-limits').params.thdVPct; for (let i = 1; i < thd.length; i++) { expect(thd[i].maxKv).toBeGreaterThan(thd[i - 1].maxKv); expect(thd[i].pct).toBeLessThan(thd[i - 1].pct); }
  });
  it('line costs: cost rises with voltage, a twin 400 kV line costs less than a quad, double circuit factor in (1, 2)', () => {
    const lc = rows('lineCosts'); for (const l of lc) { expect(l.costPerKm, l.id).toBeGreaterThan(0); expect(l.doubleCircuitFactor, l.id).toBeGreaterThan(1); expect(l.doubleCircuitFactor, l.id).toBeLessThan(2); }
    for (let i = 1; i < lc.length; i++) { expect(lc[i].kv).toBeGreaterThanOrEqual(lc[i - 1].kv); expect(lc[i].costPerKm).toBeGreaterThan(lc[i - 1].costPerKm); }
    const kvs = new Set(lc.map((l) => l.kv)); for (const t of LINE_TEMPLATES.filter((x) => x.kv >= 1)) expect(kvs.has(t.kv), t.id).toBe(true);
  });
  it('cables: copper price per metre positive, pole spacing sane', () => {
    for (const c of rows('cables')) { expect(c.perMm2PerM).toBeGreaterThan(0); expect(c.sheathPerM).toBeGreaterThan(0); expect(between(c.poleSpacingM, 10, 100)).toBe(true); expect(c.polePrice).toBeGreaterThan(0); }
  });
  it('fuels: the catalogue prices equal the economy block of the pack', () => {
    const f = (id: string) => rows('fuels').find((x) => x.id === id);
    for (const k of ['coal', 'gas', 'diesel', 'biomass'] as const) { expect(f(k).unit).toBe('GJ'); expect(f(k).price, k).toBe(pack.data.economy.fuelPerGJ[k]); }
    if (pack.data.economy.nuclearPerMWhe !== null) expect(f('nuclear').price).toBe(pack.data.economy.nuclearPerMWhe);
    else expect(f('nuclear')).toBeUndefined();
  });
});

describe('RELEASE gate for global', () => {
  it('global ships, and has no recall catalogue row or provenance entry (always checked; RELEASE=1 additionally covers any later regression)', () => {
    expect(GLOBAL.status).toBe('shipping');
    expect(releaseGateProblems(GLOBAL)).toEqual([]);
    if (process.env.RELEASE) for (const p of REGIONS.list()) expect(releaseGateProblems(p), p.id).toEqual([]);
  });
  it('every shipping pack in the registry passes the gate', () => { for (const p of REGIONS.list()) expect(releaseGateProblems(p), p.id).toEqual([]); });
  it('global has a catalogue row with a non-recall tag for every unit of the DESIGN §4.9 counts', () => {
    const c = GLOBAL.data.catalogues;
    expect(c.generators.length).toBe(14); expect(c.storage.length).toBe(4 + 5);   // the four DESIGN rows and the five L30 island packs
    for (const n of NAMES) for (const r of c[n]) expect(r.confidence, `${n}/${r.id}`).not.toBe('recall');
    // the in pack keeps its recall rows (draft); the gate must not apply to it
    expect(IN.data.catalogues.generators.some((r) => r.confidence === 'recall')).toBe(true);
  });
});
