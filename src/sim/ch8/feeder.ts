// Voltage studies on a radial feeder (L31 the long feeder, L35 sun on the roofs, L36 the exam): the engine's backward-forward sweep (src/sim/distrib/radial.ts) on a tree
// made of a trunk (one section per node) and, at each node, the distribution transformer as a leaf section whose impedance is the transformer's short-circuit impedance.
// An off-load tap acts on that leaf only (the customers behind it), a regulator on the trunk section into its node (everything below it).
import { dmath } from '@core/numerics';
import { CONDUCTORS, solveRadial, solveWithPv, hostingCapacity, VOLT_VAR_CAT_B, type RadialFeeder, type RadialResult, type PvSolution } from '../distrib';
import { V_NOM, MIN_LOAD_FRAC, REGULATOR, CONDUCTOR_PRICE_KM, type FeederScenario } from './data';
import type { FeederDesign } from './state';

const cond = (id: string) => CONDUCTORS.find((c) => c.id === id)!;
export const trunkId = (n: { id: string }): string => n.id;
export const custId = (n: { id: string }): string => 'C' + n.id.slice(1);

export const defaultFeeder = (sc: FeederScenario): FeederDesign => ({ cond: sc.nodes.map(() => sc.base), tap: sc.nodes.map(() => 0), reg: null });

/** The radial tree of a scenario under a design. */
export function buildFeeder(sc: FeederScenario, d: FeederDesign): RadialFeeder {
  const nodes: RadialFeeder['nodes'] = [{ id: 'src', parent: null, rOhm: 0, xOhm: 0, pKw: 0, qKvar: 0 }];
  const zBase = (sc.kV * sc.kV * 1000);
  sc.nodes.forEach((n, i) => {
    const c = cond(d.cond[i]!);
    nodes.push({ id: trunkId(n), parent: i === 0 ? 'src' : trunkId(sc.nodes[i - 1]!), rOhm: c.rOhmKm * n.km, xOhm: c.xOhmKm * n.km, pKw: 0, qKvar: 0,
      ...(d.reg && d.reg.at === i ? { regulator: { vSetPu: d.reg.vSetPu, bandPu: REGULATOR.bandPu, stepPct: REGULATOR.stepPct, maxSteps: REGULATOR.maxSteps } } : {}) });
  });
  sc.nodes.forEach((n, i) => {
    const z = (sc.zPct / 100) * zBase / n.kva, r = z / dmath.sqrt(1 + sc.xr * sc.xr);
    nodes.push({ id: custId(n), parent: trunkId(n), rOhm: r, xOhm: r * sc.xr, pKw: n.kw, qKvar: n.kvar, tapPct: d.tap[i] ?? 0 });
  });
  return { kV: sc.kV, nodes };
}

export interface VoltageStudy {
  /** Customer voltage (V on the 230 V base) at each node: [peak, minimum load]. */
  vPeak: number[]; vMin: number[];
  minV: number; minNode: string; maxV: number; maxNode: string;
  /** Margins to the band, pu (negative = outside): low edge at peak, high edge at minimum load. */
  marginLoPu: number; marginHiPu: number; marginPu: number;
  lossPct: number; lossKw: number; peak: RadialResult; low: RadialResult;
  /** Largest section current at peak against its conductor's ampacity (>1 = overloaded) and the section that carries it. */
  loadingMax: number; loadingSection: string;
  /** Reconductoring + regulator, US$. */
  capexUSD: number;
  regStepPeak: number; regStepMin: number;
}

export function feederCapex(sc: FeederScenario, d: FeederDesign): number {
  return sc.nodes.reduce((a, n, i) => a + n.km * Math.max(0, (CONDUCTOR_PRICE_KM[d.cond[i]!] ?? 0) - (CONDUCTOR_PRICE_KM[sc.base] ?? 0)), 0) + (d.reg ? REGULATOR.price : 0);
}

export function studyVoltage(sc: FeederScenario, d: FeederDesign, hiPu: number, loPu = 0.94): VoltageStudy {
  const f = buildFeeder(sc, d);
  const peak = solveRadial(f, { vSourcePu: sc.sourcePu }), low = solveRadial(f, { vSourcePu: sc.sourcePu, loadScale: MIN_LOAD_FRAC });
  const vP = sc.nodes.map((n) => peak.byId[custId(n)]!.vPu), vM = sc.nodes.map((n) => low.byId[custId(n)]!.vPu);
  const iMin = vP.indexOf(Math.min(...vP)), iMax = vM.indexOf(Math.max(...vM));
  const marginLo = Math.min(...vP) - loPu, marginHi = hiPu - Math.max(...vM);
  let loading = 0, ls = '';
  sc.nodes.forEach((n, i) => { const s = peak.sections.find((x) => x.id === trunkId(n))!, l = s.currentA / cond(d.cond[i]!).ampacityA; if (l > loading) { loading = l; ls = n.id; } });
  const lossKw = peak.sections.filter((s) => s.id.startsWith('N')).reduce((a, s) => a + s.pLossKw, 0);
  return {
    vPeak: vP.map((v) => v * V_NOM), vMin: vM.map((v) => v * V_NOM), minV: vP[iMin]! * V_NOM, minNode: sc.nodes[iMin]!.id, maxV: vM[iMax]! * V_NOM, maxNode: sc.nodes[iMax]!.id,
    marginLoPu: marginLo, marginHiPu: marginHi, marginPu: Math.min(marginLo, marginHi), lossPct: peak.sourceKw > 0 ? (100 * lossKw) / peak.sourceKw : 0, lossKw, peak, low,
    loadingMax: loading, loadingSection: ls, capexUSD: feederCapex(sc, d),
    regStepPeak: d.reg ? peak.regSteps[trunkId(sc.nodes[d.reg.at]!)] ?? 0 : 0, regStepMin: d.reg ? low.regSteps[trunkId(sc.nodes[d.reg.at]!)] ?? 0 : 0,
  };
}

/** Textbook cumulative drop, percent of V: sum over sections of (R P + X Q)/V^2 with P and Q the power flowing through the section (losses ignored). */
export function handDropPct(sc: FeederScenario, d: FeederDesign): number {
  let drop = 0;
  sc.nodes.forEach((n, i) => {
    const c = cond(d.cond[i]!), p = sc.nodes.slice(i).reduce((a, m) => a + m.kw, 0) * 1000, q = sc.nodes.slice(i).reduce((a, m) => a + m.kvar, 0) * 1000;
    drop += (c.rOhmKm * n.km * p + c.xOhmKm * n.km * q) / (sc.kV * sc.kV * 1e6);
  });
  return drop * 100;
}

// ---- L35: PV on the feeder ----------------------------------------------------------------------------------------------------------
export interface PvStudy {
  /** Noon: minimum load, PV at its connection limit. Evening: peak load, no PV. */
  noon: PvSolution; evening: PvSolution;
  maxV: number; maxNode: string; minV: number; minNode: string; marginHiPu: number; marginLoPu: number; marginPu: number;
  hostingKw: number; hostingLimitedBy: string; reverseFlow: boolean; capexUSD: number; pvKw: number;
}
export interface PvOpts { pvKw: number; oltcSetPu: number; ldc: boolean; voltVar: boolean; sites: string[]; noonLoad: number; eveningLoad: number }
export function oltcSpec(set: number, ldc: boolean, o: { stepPct: number; bandPu: number; ratedA: number; rLdcPu: number; xLdcPu: number }) {
  return { vSetPu: set, bandPu: o.bandPu, stepPct: o.stepPct, maxSteps: 16, ratedA: o.ratedA, rLdcPu: ldc ? o.rLdcPu : 0, xLdcPu: ldc ? o.xLdcPu : 0 };
}
export function studyPv(sc: FeederScenario, d: FeederDesign, o: PvOpts, hiPu: number, oltc: Parameters<typeof oltcSpec>[2], withHosting = false, loPu = 0.94): PvStudy {
  const f = buildFeeder(sc, d), sites = o.sites.map((id) => ({ node: 'C' + id.slice(1), share: 1 }));
  const sc1 = { sites, oltc: oltcSpec(o.oltcSetPu, o.ldc, oltc), ...(o.voltVar ? { voltVar: VOLT_VAR_CAT_B } : {}), vSourcePu: 1 };
  const noon = solveWithPv(f, { ...sc1, loadScale: o.noonLoad }, o.pvKw), evening = solveWithPv(f, { ...sc1, loadScale: o.eveningLoad }, 0);
  const cs = sc.nodes.map((n) => 'C' + n.id.slice(1));
  const vN = cs.map((id) => noon.byId[id]!.vPu), vE = cs.map((id) => evening.byId[id]!.vPu);
  const hi = Math.max(...vN), lo = Math.min(...vE);
  const h = withHosting ? hostingCapacity(f, { ...sc1, loadScale: o.noonLoad }, { vMaxPu: hiPu }, 6000, 2) : { hostingKw: 0, limitedBy: 'none' as const };
  return {
    noon, evening, maxV: hi * V_NOM, maxNode: sc.nodes[vN.indexOf(hi)]!.id, minV: lo * V_NOM, minNode: sc.nodes[vE.indexOf(lo)]!.id,
    marginHiPu: hiPu - hi, marginLoPu: lo - loPu, marginPu: Math.min(hiPu - hi, lo - loPu), hostingKw: h.hostingKw, hostingLimitedBy: h.limitedBy,
    reverseFlow: noon.sourceKw < 0, capexUSD: feederCapex(sc, d), pvKw: o.pvKw,
  };
}
