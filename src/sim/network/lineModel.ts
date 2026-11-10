// Transmission-line models. Exact equivalent pi (used by the grid solve) and the textbook ABCD forms (Codex labs, oracles).
import { dmath as dm, cx, add, sub, mul, div, scale, sqrt, abs, type Complex } from '@core/numerics';
import { S_BASE_MVA } from './types';

const ONE: Complex = { re: 1, im: 0 };

/** Complex sinh(a+jb) = sinh a cos b + j cosh a sin b. */
export function csinh(a: Complex): Complex {
  const [s, c] = dm.sincos(a.im);
  return { re: dm.sinh(a.re) * c, im: dm.cosh(a.re) * s };
}
/** Complex cosh(a+jb) = cosh a cos b + j sinh a sin b. */
export function ccosh(a: Complex): Complex {
  const [s, c] = dm.sincos(a.im);
  return { re: dm.cosh(a.re) * c, im: dm.sinh(a.re) * s };
}
/** Complex tanh = sinh/cosh. */
export function ctanh(a: Complex): Complex {
  return div(csinh(a), ccosh(a));
}

/** sinh(u)/u (series for tiny |u| so that length -> 0 is exact). */
function sinhc(u: Complex): Complex {
  if (abs(u) < 1e-4) { const u2 = mul(u, u); return add(ONE, scale(u2, 1 / 6)); }
  return div(csinh(u), u);
}
/** tanh(u)/u (series for tiny |u|). */
function tanhc(u: Complex): Complex {
  if (abs(u) < 1e-4) { const u2 = mul(u, u); return sub(ONE, scale(u2, 1 / 3)); }
  return div(ctanh(u), u);
}

export interface LineParams {
  /** Series impedance per km, ohm/km (r + jx). */
  zPerKm: Complex;
  /** Shunt admittance per km, S/km (g + jb). */
  yPerKm: Complex;
  lengthKm: number;
}

export interface LinePi {
  /** gamma = sqrt(z y), 1/km. */
  gamma: Complex;
  /** Characteristic impedance Z_c = sqrt(z/y), ohm. */
  Zc: Complex;
  /** Equivalent-pi series impedance Z' = Z_c sinh(gamma l), ohm. */
  Zseries: Complex;
  /** Equivalent-pi shunt admittance at EACH end Y'/2 = tanh(gamma l / 2) / Z_c, S. */
  Yhalf: Complex;
}

/** Exact equivalent pi: gamma = sqrt(zy), Zc = sqrt(z/y), Z' = Zc sinh(gamma l) = z l sinh(gl)/(gl), Y'/2 = tanh(gl/2)/Zc = (y l/2) tanh(gl/2)/(gl/2) (ohm, S). */
export function linePi(p: LineParams): LinePi {
  const { zPerKm: z, yPerKm: y, lengthKm: l } = p;
  const gamma = sqrt(mul(z, y));
  const Zc = sqrt(div(z, y));
  const gl = scale(gamma, l);
  const Zseries = mul(scale(z, l), sinhc(gl));
  const Yhalf = mul(scale(y, l / 2), tanhc(scale(gl, 0.5)));
  return { gamma, Zc, Zseries, Yhalf };
}

export interface LinePu {
  /** Series r, x (pu), total shunt conductance and susceptance (both ends together, pu): the NetBranch fields. */
  r: number; x: number; gc: number; bc: number;
}

/** Convert the exact pi to pu: Z_base = kV^2/S_base; z_pu = Z'/Z_b, total bc = 2 Im(Y'/2) Z_b, gc = 2 Re(Y'/2) Z_b (circuits in parallel: n). */
export function linePu(p: LineParams, kV: number, sBaseMVA = S_BASE_MVA, circuits = 1): LinePu {
  const pi = linePi(p);
  const zb = (kV * kV) / sBaseMVA;
  const z = scale(pi.Zseries, 1 / (zb * circuits));
  const yh = scale(pi.Yhalf, zb * circuits);
  return { r: z.re, x: z.im, gc: 2 * yh.re, bc: 2 * yh.im };
}

/** Nominal pi in pu (z = z l, y = y l, no hyperbolics); the limit of linePu as l -> 0. */
export function lineNominalPu(p: LineParams, kV: number, sBaseMVA = S_BASE_MVA): LinePu {
  const zb = (kV * kV) / sBaseMVA;
  const z = scale(p.zPerKm, p.lengthKm / zb);
  const y = scale(p.yPerKm, p.lengthKm * zb);
  return { r: z.re, x: z.im, gc: y.re, bc: y.im };
}

export interface ABCD { A: Complex; B: Complex; C: Complex; D: Complex }
export type LineKind = 'short' | 'nominalPi' | 'long';

/** Textbook two-port: short A=D=1,B=Z,C=0; nominal pi A=1+ZY/2,B=Z,C=Y(1+ZY/4); long A=D=cosh(gl),B=Zc sinh(gl),C=sinh(gl)/Zc (Z = z l, Y = y l). */
export function lineABCD(kind: LineKind, p: LineParams): ABCD {
  const Z = scale(p.zPerKm, p.lengthKm), Y = scale(p.yPerKm, p.lengthKm);
  if (kind === 'short') return { A: ONE, B: Z, C: cx(0), D: ONE };
  if (kind === 'nominalPi') {
    const zy = mul(Z, Y);
    const A = add(ONE, scale(zy, 0.5));
    return { A, B: Z, C: mul(Y, add(ONE, scale(zy, 0.25))), D: A };
  }
  const gamma = sqrt(mul(p.zPerKm, p.yPerKm)), Zc = sqrt(div(p.zPerKm, p.yPerKm));
  const gl = scale(gamma, p.lengthKm);
  const A = ccosh(gl);
  return { A, B: mul(Zc, csinh(gl)), C: div(csinh(gl), Zc), D: A };
}

/** Sending end from the receiving end: [VS; IS] = [A B; C D][VR; IR] (volts, amps; per-phase quantities). */
export function sendingEnd(m: ABCD, VR: Complex, IR: Complex): { VS: Complex; IS: Complex } {
  return { VS: add(mul(m.A, VR), mul(m.B, IR)), IS: add(mul(m.C, VR), mul(m.D, IR)) };
}

/** Receiving-end no-load voltage for a given sending voltage: V_R0 = V_S / A (volts). */
export function noLoadReceiving(m: ABCD, VS: Complex): Complex {
  return div(VS, m.A);
}

/** Determinant AD - BC (= 1 for any reciprocal passive two-port). */
export function abcdDet(m: ABCD): Complex {
  return sub(mul(m.A, m.D), mul(m.B, m.C));
}

/** Lossless line propagation constant beta = w sqrt(L C) (rad/km) from L (H/km), C (F/km), f (Hz). */
export function losslessBeta(LHperKm: number, CFperKm: number, fHz: number): number {
  return 2 * Math.PI * fHz * Math.sqrt(LHperKm * CFperKm);
}
