// Bench level scenarios (DESIGN 2.6): L01 (48 V ideal source, cable, N homes) and L03 (380 V, 2 km loop, constant-power converter).
import { cx, abs, type Complex } from '@core/numerics';
import { GROUND, solveMna, cableLoopR, type BenchError, type Elem } from './mna';

export interface L01Input { vSource?: number; loopROhm: number; homes: number; homeW?: number; homeV?: number }
export interface L01Result { ok: true; vLoad: number; iA: number; lossPct: number; cableLossW: number; loadW: number }

/** L01: ideal source, loop resistance, N parallel constant-Z homes (default 48 W at 48 V). lossPct = 100 (1 - Vload/Vsource). */
export function solveL01(inp: L01Input): L01Result | { ok: false; error: BenchError } {
  const vs = inp.vSource ?? 48, hw = inp.homeW ?? 48, hv = inp.homeV ?? 48;
  const el: Elem[] = [
    { kind: 'V', id: 'src', a: 's', b: GROUND, e: cx(vs) },
    { kind: 'R', id: 'cable', a: 's', b: 'far', r: inp.loopROhm },
  ];
  for (let k = 0; k < inp.homes; k++) el.push({ kind: 'LOAD', id: `home${k}`, a: 'far', b: GROUND, p: hw, q: 0, vnom: hv });
  const r = solveMna(el, 0);
  if (!r.ok) return r;
  const vLoad = abs(r.V.far), iA = abs(r.I.cable);
  return { ok: true, vLoad, iA, lossPct: 100 * (1 - vLoad / vs), cableLossW: iA * iA * inp.loopROhm, loadW: vLoad * iA };
}

export interface L03Input { rOhmPerKm20C: number; loopKm?: number; vSend?: number; pLoadW?: number; eta?: number }
export interface L03Result { ok: true; vFar: number; iA: number; lossW: number; pFarW: number; lossPctExact: number; lossPctNaive: number }

/** L03: sending end holds vSend, far converter is a constant-power load pLoad/eta; loss % = I^2 R / P_far (exact) vs (P/V)^2 R / P (naive). */
export function solveL03(inp: L03Input): L03Result | { ok: false; error: BenchError } {
  const vs = inp.vSend ?? 380, pl = inp.pLoadW ?? 5000, eta = inp.eta ?? 0.97;
  const R = cableLoopR(inp.rOhmPerKm20C, (inp.loopKm ?? 2) * 1000 / 2, 2);
  const r = solveMna([
    { kind: 'V', id: 'src', a: 's', b: GROUND, e: cx(vs) },
    { kind: 'R', id: 'cable', a: 's', b: 'far', r: R },
    { kind: 'CPL', id: 'conv', a: 'far', b: GROUND, p: pl, eta },
  ], 0);
  if (!r.ok) return r;
  const iA = abs(r.I.cable), pFar = pl / eta, lossW = iA * iA * R;
  const iNaive = pFar / vs;
  return { ok: true, vFar: abs(r.V.far), iA, lossW, pFarW: pFar, lossPctExact: (100 * lossW) / pFar, lossPctNaive: (100 * iNaive * iNaive * R) / pFar };
}

export interface SiNetwork {
  slack: { node: string; v: Complex };
  branches: { id: string; a: string; b: string; z: Complex }[];
  /** Constant-Z loads from P (W), Q (var) at nominal V (volts). */
  loads: { node: string; p: number; q: number; vnom: number }[];
}
/** P6: solve an SI (ohm, volt) network with constant-Z loads by MNA at w = 1 (impedances already complex); returns node voltages. */
export function solveSiConstZ(net: SiNetwork): { ok: true; V: Record<string, Complex> } | { ok: false; error: BenchError } {
  const el: Elem[] = [{ kind: 'V', id: 'slack', a: net.slack.node, b: GROUND, e: net.slack.v }];
  for (const b of net.branches) el.push({ kind: 'Z', id: b.id, a: b.a, b: b.b, z: b.z });
  net.loads.forEach((l, k) => el.push({ kind: 'LOAD', id: `load${k}`, a: l.node, b: GROUND, p: l.p, q: l.q, vnom: l.vnom }));
  const r = solveMna(el, 1);
  return r.ok ? { ok: true, V: r.V } : r;
}
