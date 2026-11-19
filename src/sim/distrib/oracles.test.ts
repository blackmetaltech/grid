// Chapter 8 engine vs the independent Python oracles (tools/oracles/ch8_expected.json). Closed forms 1e-6, integrations and bisections 1e-3.
import { describe, expect, it } from 'vitest';
import exp from '../../../tools/oracles/ch8_expected.json';
import SC from './scenarios.json';
import { chainFeeder, solveRadial } from './radial';
import { reliability, type ReliabilitySection } from './reliability';
import { recloserPair, fuseK, marginsAt, ieeeTime } from './tcc';
import { steadyState, stepTx, hotSpot, runCycle } from './thermal-tx';
import { hostingCapacity, VOLT_VAR_CAT_B } from './hosting';

const rel = (a: number, b: number, tol: number) => expect(Math.abs(a - b) / Math.max(1e-12, Math.abs(b))).toBeLessThan(tol);

describe('ch8 oracles', () => {
  it('5-section feeder voltages, section currents, losses (1e-6)', () => {
    const f = chainFeeder(SC.feeder5.kV, SC.feeder5.sections), r = solveRadial(f);
    SC.feeder5.sections.forEach((s, i) => { rel(r.byId[s.id]!.vPu, exp.feeder5.vPu[i]!, 1e-6); rel(r.sections[i]!.currentA, exp.feeder5.currentA[i]!, 1e-6); rel(r.sections[i]!.pLossKw, exp.feeder5.sectionLossKw[i]!, 1e-6); });
    rel(r.lossKw, exp.feeder5.totalLossKw, 1e-6);
    // the textbook (R P + X Q)/V drop is within 0.1 pu-percent of the exact flow
    exp.feeder5.handVPu.forEach((h, i) => expect(Math.abs(h - exp.feeder5.vPu[i]!)).toBeLessThan(0.003));
  });

  it('3-section reliability with fuse, sectionaliser, tie (1e-6)', () => {
    const secs = SC.reliability.sections as ReliabilitySection[];
    const cases: [string, ReliabilitySection[], typeof SC.reliability.times][] = [
      ['withTie', secs, SC.reliability.times],
      ['noTie', secs.map((s) => ({ ...s, tie: undefined })), SC.reliability.times],
      ['remoteS2', secs.map((s) => (s.id === 'S2' ? { ...s, device: 'remote' as const } : s)), SC.reliability.times],
    ];
    for (const [k, s, t] of cases) {
      const r = reliability(s, t), e = (exp.reliability as Record<string, { saifi: number; saidi: number; caidi: number; ensMWh: number }>)[k]!;
      rel(r.saifi, e.saifi, 1e-6); rel(r.saidi, e.saidi, 1e-6); rel(r.caidi, e.caidi, 1e-6); rel(r.ensMWh, e.ensMWh, 1e-6);
    }
  });

  it('recloser / fuse coordination margins at 3 currents (1e-6)', () => {
    const c = SC.coordination, { fast, slow } = recloserPair(c.pickupA, c.fastTd, c.slowTd), fuse = fuseK(c.fuseK);
    const m = marginsAt(fast, slow, fuse, c.currentsA);
    exp.coordination.rows.forEach((row, i) => { rel(m[i]!.marginFast, row.marginFast, 1e-6); rel(m[i]!.marginSlow, row.marginSlow, 1e-6); });
    rel(ieeeTime('VI', c.slowTd, c.currentsA[0]!, c.pickupA), exp.coordination.rows[0]!.tSlow, 1e-6);
  });

  it('IEC 60076-7 hot spot after a step load, and 24 h cycle ageing (1e-3)', () => {
    const st = SC.thermal.step; let s = steadyState(st.k0), t = 0;
    for (const m of st.minutes) { s = stepTx(s, st.k, m - t); t = m; rel(hotSpot(s, SC.thermal.ambientC), (exp.thermal.step as Record<string, { hot: number }>)[String(m)]!.hot, 1e-3); }
    const r = runCycle(SC.thermal.cycleK, SC.thermal.ambientC);
    rel(r.peakHotC, exp.thermal.cycle.peakHotC, 1e-3);
    rel(r.lossOfLifeH, exp.thermal.cycle.lossOfLifeH, 1e-3);
    [0, 27, 28, 50, 67, 68, 83, 84, 95].forEach((i, j) => rel(r.thetaHot[i]!, exp.thermal.cycle.hotEnd[j]!, 1e-3));
  });

  it('hosting capacity, unity pf and volt-var (1e-3)', () => {
    const f = chainFeeder(SC.feeder5.kV, SC.feeder5.sections), h = SC.hosting, lim = { vMaxPu: h.vMaxPu };
    const u = hostingCapacity(f, { sites: h.sites, loadScale: h.loadScale }, lim, 50000, 1e-4);
    rel(u.hostingKw, exp.hosting.unity.hostingKw, 1e-3);
    const v = hostingCapacity(f, { sites: h.sites, loadScale: h.loadScale, voltVar: VOLT_VAR_CAT_B }, lim, 50000, 1e-4);
    rel(v.hostingKw, exp.hosting.voltvar.hostingKw, 1e-3);
    exp.hosting.voltvar.vPu.forEach((x, i) => rel(v.atLimit.nodes.find((n) => n.id === SC.feeder5.sections[i]!.id)!.vPu, x, 1e-3));
  });
});
