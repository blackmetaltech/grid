// Classical single-machine infinite-bus rotor-angle model (DESIGN 3.7, S4). pu on the machine base, angles in rad.
//   dδ/dt = ω_s (ω − 1) ;  2H dω/dt = P_m − P_e(δ) − D(ω − 1) ;  P_e = P_max,stage · sin δ ,  P_max = E'V/X_eq(stage)
import { dmath, cLuDecompose, cLuSolve, SingularMatrixError, cx, sub, mul, type Complex } from '@core/numerics';

/** Stage curves and machine data. Pmax_* = E'V/X_eq for the pre-fault / during-fault / post-fault network (during may be 0). */
export interface SmibInput {
  /** Inertia constant, s (machine base). */
  H: number;
  /** Nominal frequency, Hz. */
  f0: number;
  /** Mechanical power, pu. */
  Pm: number;
  PmaxPre: number;
  PmaxDuring: number;
  PmaxPost: number;
  /** Fault applied at t = 0, cleared at this time, s. */
  tClearS: number;
  /** Damping, pu (0 in tests). */
  D?: number;
  /** Window length (default 3 s) and step (default 1 ms) and trace decimation (default 10 ms). */
  tEndS?: number;
  dt?: number;
  traceDt?: number;
}

/** P_max = E'·V / X_eq  [pu]; X_eq <= 0 or infinite means the transfer path is gone (0). */
export function pmaxFromX(E: number, V: number, X: number): number {
  return Number.isFinite(X) && X > 0 ? (E * V) / X : 0;
}

/** Pre-fault equilibrium angle δ0 = asin(P_m/P_max,pre) [rad]; null when P_m > P_max,pre (no operating point). */
export function delta0Of(Pm: number, PmaxPre: number): number | null {
  if (!(PmaxPre > 0) || Pm > PmaxPre || Pm < -PmaxPre) return null;
  return dmath.asin(Pm / PmaxPre);
}

/** Post-fault unstable equilibrium δ_u = π − asin(P_m/P_max,post) [rad]; null when P_m > P_max,post (no post-fault equilibrium). */
export function deltaUOf(Pm: number, PmaxPost: number): number | null {
  if (!(PmaxPost > 0) || Pm > PmaxPost || Pm < -PmaxPost) return null;
  return Math.PI - dmath.asin(Pm / PmaxPost);
}

/** Result of a time-domain SMIB run. */
export interface SmibResult {
  ok: boolean;
  error?: string;
  /** Loss of synchronism (δ > δ_u with ω > 1) happened. */
  lossOfSync: boolean;
  tLossS: number | null;
  /** First swing returned (ω < 1 after clearing) before δ_u. */
  firstSwingStable: boolean;
  delta0: number;
  deltaU: number;
  deltaMax: number;
  tDeltaMax: number;
  deltaAtClear: number;
  tEndS: number;
  trace: { t: number[]; deltaRad: number[]; omegaPu: number[] };
}

interface Sim { lossOfSync: boolean; tLoss: number | null; swingBack: boolean; deltaMax: number; tDeltaMax: number; deltaClear: number; tEnd: number;
  t: number[]; d: number[]; w: number[] }

function simulate(inp: SmibInput, tClear: number, d0: number, du: number, record: boolean, stopOnResolved: boolean): Sim {
  const dt = inp.dt ?? 1e-3;
  const tEnd = inp.tEndS ?? 3;
  const ws = 2 * Math.PI * inp.f0;
  const D = inp.D ?? 0;
  const twoH = 2 * inp.H;
  let pmax = inp.PmaxDuring;
  const f = (d: number, w: number, o: [number, number]): void => { o[0] = ws * (w - 1); o[1] = (inp.Pm - pmax * dmath.sin(d) - D * (w - 1)) / twoH; };
  let d = d0, w = 1, t = 0;
  const out: Sim = { lossOfSync: false, tLoss: null, swingBack: false, deltaMax: d0, tDeltaMax: 0, deltaClear: d0, tEnd: 0, t: [], d: [], w: [] };
  const every = Math.max(1, Math.round((inp.traceDt ?? 0.01) / dt));
  const a: [number, number] = [0, 0], b: [number, number] = [0, 0], c: [number, number] = [0, 0], e: [number, number] = [0, 0];
  let cleared = tClear <= 0;
  if (cleared) pmax = inp.PmaxPost;
  if (record) { out.t.push(0); out.d.push(d); out.w.push(w); }
  let step = 0;
  while (t < tEnd - 1e-12) {
    let h = dt;
    const snap = !cleared && t + h > tClear - 1e-12;
    if (snap) h = tClear - t;
    if (h > 0) {
      f(d, w, a); f(d + (h / 2) * a[0], w + (h / 2) * a[1], b); f(d + (h / 2) * b[0], w + (h / 2) * b[1], c); f(d + h * c[0], w + h * c[1], e);
      d += (h / 6) * (a[0] + 2 * b[0] + 2 * c[0] + e[0]);
      w += (h / 6) * (a[1] + 2 * b[1] + 2 * c[1] + e[1]);
      t = snap ? tClear : t + h;
    }
    if (snap) { cleared = true; pmax = inp.PmaxPost; out.deltaClear = d; }
    step++;
    if (d > out.deltaMax) { out.deltaMax = d; out.tDeltaMax = t; }
    if (record && (step % every === 0 || snap)) { out.t.push(t); out.d.push(d); out.w.push(w); }
    if (d > du && w > 1) { out.lossOfSync = true; out.tLoss = t; out.tEnd = t; if (record && out.t[out.t.length - 1] !== t) { out.t.push(t); out.d.push(d); out.w.push(w); } return out; }
    if (cleared && w < 1 && t > tClear) { out.swingBack = true; if (stopOnResolved) { out.tEnd = t; return out; } }
  }
  out.tEnd = t;
  return out;
}

/** Time-domain classical SMIB run: RK4 (dt 1 ms, 3 s), fault 0..tClear, loss of synchronism when δ > δ_u with ω > 1. */
export function runSmib(inp: SmibInput): SmibResult {
  const d0 = delta0Of(inp.Pm, inp.PmaxPre), du = deltaUOf(inp.Pm, inp.PmaxPost);
  const empty = (error: string): SmibResult => ({ ok: false, error, lossOfSync: false, tLossS: null, firstSwingStable: false, delta0: 0, deltaU: 0, deltaMax: 0, tDeltaMax: 0, deltaAtClear: 0, tEndS: 0, trace: { t: [0], deltaRad: [0], omegaPu: [1] } });
  if (d0 === null) return empty('P_m exceeds the pre-fault P_max: no steady operating point exists (the generator is already beyond its steady-state limit).');
  if (du === null) return empty('P_m exceeds the post-fault P_max: no post-fault equilibrium; the unit cannot stay in step once the fault is cleared.');
  if (!(inp.H > 0)) return empty('Inertia constant H must be positive.');
  const s = simulate(inp, inp.tClearS, d0, du, true, false);
  return {
    ok: true, lossOfSync: s.lossOfSync, tLossS: s.tLoss, firstSwingStable: s.swingBack && !s.lossOfSync, delta0: d0, deltaU: du, deltaMax: s.deltaMax,
    tDeltaMax: s.tDeltaMax, deltaAtClear: s.deltaClear, tEndS: s.tEnd, trace: { t: s.t, deltaRad: s.d, omegaPu: s.w },
  };
}

/** Closed-form equal-area results. */
export interface EqualAreaResult {
  ok: boolean;
  error?: string;
  delta0: number;
  deltaU: number;
  /** cos δ_cr = [P_m(δ_u − δ0) + Pmax_post cos δ_u − Pmax_during cos δ0]/(Pmax_post − Pmax_during) [rad]; null when no clearing angle limits (always stable). */
  deltaCr: number | null;
  /** Critical clearing time, s: closed form t = √(4H(δ_cr − δ0)/(ω_s P_m)) when the fault is terminal (Pmax_during = 0), else integrated. null = never unstable, 0 = unstable even if cleared instantly. */
  tCrS: number | null;
  alwaysStable: boolean;
}

/** Equal-area criterion: δ_cr and t_cr in closed form (PS-24: δ_cr = 84.775°, t_cr = 0.25996 s). */
export function equalAreaCritical(inp: SmibInput): EqualAreaResult {
  const d0 = delta0Of(inp.Pm, inp.PmaxPre), du = deltaUOf(inp.Pm, inp.PmaxPost);
  if (d0 === null || du === null) return { ok: false, error: 'No equilibrium for the given P_m and P_max curves.', delta0: d0 ?? 0, deltaU: du ?? 0, deltaCr: null, tCrS: null, alwaysStable: false };
  const num = inp.Pm * (du - d0) + inp.PmaxPost * dmath.cos(du) - inp.PmaxDuring * dmath.cos(d0);
  const den = inp.PmaxPost - inp.PmaxDuring;
  if (!(den > 0)) return { ok: true, delta0: d0, deltaU: du, deltaCr: null, tCrS: 0, alwaysStable: false };
  const cosCr = num / den;
  if (cosCr <= -1) return { ok: true, delta0: d0, deltaU: du, deltaCr: du, tCrS: null, alwaysStable: true };
  if (cosCr >= 1) return { ok: true, delta0: d0, deltaU: du, deltaCr: d0, tCrS: 0, alwaysStable: false };
  const dcr = dmath.acos(cosCr);
  if (dcr <= d0) return { ok: true, delta0: d0, deltaU: du, deltaCr: dcr, tCrS: 0, alwaysStable: false };
  const ws = 2 * Math.PI * inp.f0;
  let tcr: number;
  if (inp.PmaxDuring === 0 && !(inp.D) && inp.Pm > 0) {
    tcr = dmath.sqrt((4 * inp.H * (dcr - d0)) / (ws * inp.Pm));
  } else {
    // fault-on swing integrated until δ reaches δ_cr (RK4 dt 0.1 ms, linear interpolation inside the step)
    tcr = integrateToAngle(inp, d0, dcr);
  }
  return { ok: true, delta0: d0, deltaU: du, deltaCr: dcr, tCrS: tcr, alwaysStable: false };
}

function integrateToAngle(inp: SmibInput, d0: number, target: number): number {
  const ws = 2 * Math.PI * inp.f0, D = inp.D ?? 0, h = 1e-4, twoH = 2 * inp.H;
  const f = (d: number, w: number): [number, number] => [ws * (w - 1), (inp.Pm - inp.PmaxDuring * dmath.sin(d) - D * (w - 1)) / twoH];
  let d = d0, w = 1, t = 0;
  for (let i = 0; i < 100000; i++) {
    const a = f(d, w), b = f(d + (h / 2) * a[0], w + (h / 2) * a[1]), c = f(d + (h / 2) * b[0], w + (h / 2) * b[1]), e = f(d + h * c[0], w + h * c[1]);
    const dn = d + (h / 6) * (a[0] + 2 * b[0] + 2 * c[0] + e[0]);
    const wn = w + (h / 6) * (a[1] + 2 * b[1] + 2 * c[1] + e[1]);
    if (dn >= target) return t + (h * (target - d)) / (dn - d);
    d = dn; w = wn; t += h;
  }
  return 10;
}

/** Critical clearing time found with the engine's RK4 (dt 1 ms, step snapped to the clearing instant) by bisection on the clearing time; null = stable even at 2 s. */
export function criticalClearingTimeRk4(inp: SmibInput, tMaxS = 2): number | null {
  const d0 = delta0Of(inp.Pm, inp.PmaxPre), du = deltaUOf(inp.Pm, inp.PmaxPost);
  if (d0 === null || du === null) return 0;
  const stable = (tc: number): boolean => {
    const s = simulate({ ...inp, tEndS: Math.max(inp.tEndS ?? 3, tc + 3) }, tc, d0, du, false, true);
    return !s.lossOfSync && s.swingBack;
  };
  if (stable(tMaxS)) return null;
  if (inp.PmaxPost <= inp.PmaxPre && !stable(1e-6)) return 0;
  let lo = 0, hi = tMaxS;
  for (let i = 0; i < 60; i++) { const mid = 0.5 * (lo + hi); if (stable(mid)) lo = mid; else hi = mid; }
  return 0.5 * (lo + hi);
}

/** P-δ drawer data: the three sine curves and operating points. */
export interface PDeltaCurves {
  deltaRad: number[];
  pePre: number[];
  peDuring: number[];
  pePost: number[];
  pm: number;
  delta0: number | null;
  deltaU: number | null;
}

/** Points of P_e = Pmax·sin δ for pre/during/post-fault stages over δ ∈ [0, π] [pu]. */
export function pDeltaCurves(inp: SmibInput, nPoints = 181): PDeltaCurves {
  const deltaRad: number[] = [], pePre: number[] = [], peDuring: number[] = [], pePost: number[] = [];
  for (let i = 0; i < nPoints; i++) {
    const d = (Math.PI * i) / (nPoints - 1), s = dmath.sin(d);
    deltaRad.push(d); pePre.push(inp.PmaxPre * s); peDuring.push(inp.PmaxDuring * s); pePost.push(inp.PmaxPost * s);
  }
  return { deltaRad, pePre, peDuring, pePost, pm: inp.Pm, delta0: delta0Of(inp.Pm, inp.PmaxPre), deltaU: deltaUOf(inp.Pm, inp.PmaxPost) };
}

/** Live equal-area quantities for clearing at δ_c. Areas in pu·rad. */
export interface EqualAreas {
  /** Accelerating area A1 = ∫δ0..δc (P_m − Pe,during) dδ = P_m(δc−δ0) + Pmax_d (cos δc − cos δ0). */
  a1: number;
  /** Decelerating area available up to δ_u: Pmax_p (cos δc − cos δ_u) − P_m (δ_u − δc). */
  a2Available: number;
  /** A2 accumulated up to δ_now: Pmax_p (cos δc − cos δ_now) − P_m (δ_now − δc). */
  a2Now: number;
  /** First-swing stable (A2 available >= A1). */
  stable: boolean;
  /** Maximum swing angle where A2 = A1 (rad), null when unstable. */
  deltaMax: number | null;
}

/** Areas A1 and A2 for the P-δ drawer, for clearing at angle deltaC and the rotor currently at deltaNow (rad). */
export function equalAreas(inp: SmibInput, deltaC: number, deltaNow: number): EqualAreas {
  const d0 = delta0Of(inp.Pm, inp.PmaxPre) ?? 0, du = deltaUOf(inp.Pm, inp.PmaxPost) ?? Math.PI;
  const a1 = inp.Pm * (deltaC - d0) + inp.PmaxDuring * (dmath.cos(deltaC) - dmath.cos(d0));
  const a2 = (d: number): number => inp.PmaxPost * (dmath.cos(deltaC) - dmath.cos(d)) - inp.Pm * (d - deltaC);
  const avail = a2(du);
  const stable = avail >= a1;
  let deltaMax: number | null = null;
  if (stable) {
    let lo = deltaC, hi = du;
    for (let i = 0; i < 80; i++) { const mid = 0.5 * (lo + hi); if (a2(mid) < a1) lo = mid; else hi = mid; }
    deltaMax = 0.5 * (lo + hi);
  }
  return { a1, a2Available: avail, a2Now: a2(deltaNow), stable, deltaMax };
}

/** Kron reduction result. */
export interface KronResult { ok: boolean; error?: string; Y: Complex[][] }

/** Kron reduction Y_red = Y_kk − Y_kr Y_rr⁻¹ Y_rk onto the kept nodes (complex LU); singular eliminated block gives ok:false with a message. */
export function kronToTwoNode(Ybus: Complex[][], keep: number[]): KronResult {
  const n = Ybus.length;
  const keepSet = new Set(keep);
  const rest: number[] = [];
  for (let i = 0; i < n; i++) if (!keepSet.has(i)) rest.push(i);
  const Ykk = keep.map((i) => keep.map((j) => cx(Ybus[i][j].re, Ybus[i][j].im)));
  if (rest.length === 0) return { ok: true, Y: Ykk };
  const Yrr = rest.map((i) => rest.map((j) => Ybus[i][j]));
  let dec;
  try { dec = cLuDecompose(Yrr); } catch (e) {
    if (e instanceof SingularMatrixError) return { ok: false, error: 'The nodes being eliminated are electrically floating (singular Y_rr): add a path to ground or keep that node.', Y: Ykk };
    throw e;
  }
  const Y = Ykk.map((row) => row.slice());
  for (let b = 0; b < keep.length; b++) {
    // column b of Y_rk, solved against Y_rr, then multiplied by Y_kr
    const col = rest.map((i) => Ybus[i][keep[b]]);
    const x = cLuSolve(dec, col);
    for (let a = 0; a < keep.length; a++) {
      let acc = cx(0, 0);
      for (let r = 0; r < rest.length; r++) { const p = mul(Ybus[keep[a]][rest[r]], x[r]); acc = { re: acc.re + p.re, im: acc.im + p.im }; }
      Y[a][b] = sub(Y[a][b], acc);
    }
  }
  return { ok: true, Y };
}

/** Transfer reactance from a reduced 2x2 admittance (lossless): Y12 = j/X_eq  →  X_eq = 1/Im(Y12) [pu]; Infinity when disconnected. */
export function xEqFromKron(Y: Complex[][]): number {
  const b = Y[0][1].im;
  return b > 1e-12 ? 1 / b : Infinity;
}
