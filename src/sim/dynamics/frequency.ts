// Frequency dynamics for one event window (DESIGN 3.6 as amended by REVIEW E4/E5). Pure: the input is never mutated.
//   2 H_sys dΔω/dt = (Σ ΔPm_i + Σ P_b − ΔP_e)/S_sys − D_sys·Δω ,  D_sys = D_load·P_load(t)/S_sys,  P_load(t) = pre-event − shed
// States (deviations): Δω, per unit valve v_i + reheat/water z_i, per BESS P_b + discharged energy. RK4 dt 10 ms.
// Discrete actions (UFLS, trips, disconnects) are applied at the end of the step in which they fall due; thresholds are
// linearly interpolated inside the step; relays LATCH at pickup (S27).
import {
  type GovKind, type GovParams, deadZone, govTG, govValveDot, govAuxDot, govPm, clipHeadroom, bessDot, bessOutput,
  BESS_TB_FOLLOWING_S, BESS_TB_FORMING_S,
} from './governors';

/** One synchronous (or governor-less) unit online at window start. MW / MVA / s; R in pu on the unit's own S base. */
export interface FreqUnit extends GovParams {
  id: string;
  kind: GovKind;
  /** Rated MVA. */
  S: number;
  /** Inertia constant on own S base, s. */
  H: number;
  /** Droop (pu on own S); undefined or <= 0 means no primary response. */
  R?: number;
  /** Pre-event output, MW. */
  P0: number;
  /** Technical minimum / maximum output, MW (headroom limits). */
  Pmin: number;
  Pmax: number;
  /** false = excluded from the window (e.g. already tripped). Default true. */
  online?: boolean;
}

/** One battery. Grid-following: FFR only. Grid-forming: also adds S_b and H_v to the inertia, T_B 0.05 s. */
export interface FreqBess {
  id: string;
  ratedMW: number;
  /** Droop R_b (pu on rated). Default 0.01. */
  droopPu?: number;
  mode?: 'following' | 'forming';
  tB?: number;
  /** Virtual inertia H_v (s, on the rated MVA base), grid-forming only. */
  Hv?: number;
  /** Energy available for discharge, MWh (default unlimited). */
  energyMWh?: number;
}

/** One UFLS stage: picks up below hz, sheds shedPct % of pre-event load after delayS (relay + breaker). */
export interface UflsStage { hz: number; shedPct: number; delayS: number }

/** Grid-code parameters (pack data). */
export interface FreqGridCode {
  /** Governor insensitivity (offset dead-zone), Hz. */
  deadbandHz: number;
  ufls: UflsStage[];
  /** Generator under-frequency trip: below hz for s seconds (default none). */
  genUf?: { hz: number; s: number } | null;
  /** Generator over-frequency trip: above hz for s seconds. */
  genOf?: { hz: number; s: number } | null;
  /** Legacy DER: trips when |500 ms-window RoCoF| > hzPerS (after delayS), losing derLegacyMW of generation. */
  derRocofTrip?: { hzPerS: number; windowS?: number; delayS?: number } | null;
}

/** Integration/window settings. */
export interface FreqWindow {
  maxS?: number;
  dt?: number;
  traceDt?: number;
  settleAfterS?: number;
  /** Window ends once t > settleAfterS and |dΔω/dt| < this (pu/s). Default 1e-5. */
  settlePuPerS?: number;
}

/** Full explicit input of one frequency window. */
export interface FreqInput {
  /** Nominal frequency, Hz. */
  f0: number;
  units: FreqUnit[];
  bess: FreqBess[];
  /** Pre-event total load, MW (includes pumping and BESS charging). */
  loadMW: number;
  /** Disturbance step at t = 0, MW (+ lost generation / added load). The tripped unit is simply not in `units`. */
  disturbanceMW: number;
  /** Load damping, % load change per % frequency change (default 1.5). */
  dLoad?: number;
  gridCode: FreqGridCode;
  /** Pumped storage in pump mode, MW (disconnects just before stage 1). */
  pumpMW?: number;
  /** BESS in charging mode, MW (disconnects just before stage 1). */
  bessChargingMW?: number;
  /** Legacy no-ride-through DER generation, MW (lost on RoCoF trip). */
  derLegacyMW?: number;
  window?: FreqWindow;
}

/** Why-card / replay event. t in s (1 ms resolution). */
export interface FreqEvent {
  t: number;
  kind: 'ufls_pickup' | 'ufls_shed' | 'psp_disconnect' | 'bess_charge_disconnect' | 'gen_uf_trip' | 'gen_of_trip' | 'der_rocof_trip' | 'blackout';
  element: string;
  cause: Record<string, number>;
}

/** A unit lost during the window. */
export interface FreqUnitTrip { id: string; t: number; cause: 'gen_uf' | 'gen_of'; P0MW: number }

/** Result of a window. Hz, s, MW. */
export interface FreqResult {
  ok: boolean;
  error?: string;
  trace: { t: number[]; fHz: number[]; rocofHzS: number[] };
  events: FreqEvent[];
  nadirHz: number;
  tNadir: number;
  zenithHz: number;
  tZenith: number;
  fEndHz: number;
  tEndS: number;
  endReason: 'steady' | 'timeout' | 'blackout';
  shedMW: number;
  /** Analytic t = 0+ RoCoF, Hz/s: −ΔP·f0/(2·H_sys·S_sys) (predictions, P17). */
  rocof0: number;
  /** Largest |500 ms window slope| seen, Hz/s (HUD). */
  maxRocof500: number;
  hSys: number;
  sSys: number;
  unitTrips: FreqUnitTrip[];
  unitFinal: { id: string; dPmMW: number; online: boolean }[];
  bessFinal: { id: string; pMW: number }[];
}

const rnd3 = (t: number): number => Math.round(t * 1000) / 1000;

function emptyResult(f0: number, error: string): FreqResult {
  return {
    ok: false, error, trace: { t: [0], fHz: [f0], rocofHzS: [0] }, events: [], nadirHz: f0, tNadir: 0, zenithHz: f0, tZenith: 0,
    fEndHz: f0, tEndS: 0, endReason: 'blackout', shedMW: 0, rocof0: 0, maxRocof500: 0, hSys: 0, sSys: 0, unitTrips: [], unitFinal: [], bessFinal: [],
  };
}

/** Run one event window: RK4 at dt (10 ms) of the 3.6 model with UFLS / trips; returns decimated trace, events and summary numbers. */
export function runFrequencyWindow(input: FreqInput): FreqResult {
  const f0 = input.f0;
  const win = input.window ?? {};
  const dt = win.dt ?? 0.01;
  const maxS = win.maxS ?? 60;
  const traceEvery = Math.max(1, Math.round((win.traceDt ?? 0.02) / dt));
  const settleAfter = win.settleAfterS ?? 20;
  const settleTol = win.settlePuPerS ?? 1e-5;
  const dLoad = input.dLoad ?? 1.5;
  const gc = input.gridCode;
  const db = gc.deadbandHz / f0;

  // ---- unit / bess tables (copies; the input is never touched)
  const us = input.units.filter((u) => u.online !== false);
  const n = us.length, m = input.bess.length;
  const uS = us.map((u) => u.S), uH = us.map((u) => u.H);
  const uSR = us.map((u) => (u.R !== undefined && u.R > 0 ? u.S / u.R : 0));
  const uTG = us.map((u) => govTG(u.kind, u));
  const uLo = us.map((u) => u.Pmin - u.P0), uHi = us.map((u) => u.Pmax - u.P0);
  const uOn = us.map(() => true);
  const bR = input.bess.map((b) => b.ratedMW);
  const bDroop = input.bess.map((b) => b.droopPu ?? 0.01);
  const bForming = input.bess.map((b) => b.mode === 'forming');
  const bTB = input.bess.map((b) => b.tB ?? (b.mode === 'forming' ? BESS_TB_FORMING_S : BESS_TB_FOLLOWING_S));
  const bE = input.bess.map((b) => b.energyMWh ?? Infinity);
  const bHv = input.bess.map((b) => b.Hv ?? 0);

  let sSys = 0, hNum = 0;
  const refresh = (): void => {
    sSys = 0; hNum = 0;
    for (let i = 0; i < n; i++) if (uOn[i]) { sSys += uS[i]; hNum += uH[i] * uS[i]; }
    for (let j = 0; j < m; j++) if (bForming[j]) { sSys += bR[j]; hNum += bHv[j] * bR[j]; }
  };
  refresh();
  if (!(sSys > 0) || !(hNum > 0)) return emptyResult(f0, 'no synchronous inertia online: the island has nothing to hold frequency (H_sys·S_sys = 0)');
  const hSys0 = hNum / sSys, sSys0 = sSys;
  const rocof0 = (-input.disturbanceMW * f0) / (2 * hNum);

  // ---- mutable discrete context
  let dPe = input.disturbanceMW;
  let pumpLeft = input.pumpMW ?? 0, chargeLeft = input.bessChargingMW ?? 0;
  let loadNow = input.loadMW;
  let shed = 0;
  const loadPre = input.loadMW;

  const N = 1 + 2 * n + 2 * m;
  const iV = 1, iZ = 1 + n, iB = 1 + 2 * n, iE = 1 + 2 * n + m;
  const deriv = (x: Float64Array, out: Float64Array): void => {
    const dw = x[0];
    const dwE = deadZone(dw, db);
    let pm = 0;
    for (let i = 0; i < n; i++) {
      if (!uOn[i]) { out[iV + i] = 0; out[iZ + i] = 0; continue; }
      const u = us[i];
      const v = x[iV + i], z = x[iZ + i];
      out[iV + i] = govValveDot(uTG[i], uSR[i], dwE, v);
      out[iZ + i] = govAuxDot(u.kind, u, v, z);
      pm += clipHeadroom(govPm(u.kind, u, v, z), uLo[i], uHi[i]);
    }
    for (let j = 0; j < m; j++) {
      const pb = x[iB + j];
      out[iB + j] = bessDot(bR[j], bDroop[j], bTB[j], dwE, pb);
      const p = bessOutput(pb, bR[j], x[iE + j], bE[j]);
      out[iE + j] = p / 3600;
      pm += p;
    }
    out[0] = (pm - dPe - dLoad * loadNow * dw) / (2 * hNum);
  };

  const nst = Math.round(maxS / dt);
  const fHist = new Float64Array(nst + 2);
  fHist[0] = f0;
  let x = new Float64Array(N);
  const k1 = new Float64Array(N), k2 = new Float64Array(N), k3 = new Float64Array(N), k4 = new Float64Array(N), tmp = new Float64Array(N);

  const events: FreqEvent[] = [];
  const unitTrips: FreqUnitTrip[] = [];
  const stageOrder = gc.ufls.map((s, j) => j).sort((a, b) => gc.ufls[b].hz - gc.ufls[a].hz || a - b);
  const firstStage = stageOrder.length ? stageOrder[0] : -1;
  const picked = gc.ufls.map(() => false);
  const timers: { due: number; stage: number; tPick: number }[] = [];
  let ufStart: number | null = null, ofStart: number | null = null;
  let derPick: number | null = null, derDone = false;
  const derCfg = gc.derRocofTrip ?? null;
  const derWin = derCfg ? Math.max(1, Math.round((derCfg.windowS ?? 0.5) / dt)) : 0;
  let derLegacyLeft = input.derLegacyMW ?? 0;

  let fMin = f0, tMin = 0, iMin = 0, fMax = f0, tMax = 0;
  let maxRocof = 0;
  let endReason: FreqResult['endReason'] = 'timeout';
  let steps = 0;

  const addEvent = (t: number, kind: FreqEvent['kind'], element: string, cause: Record<string, number>): void => {
    events.push({ t: rnd3(t), kind, element, cause });
  };
  const rocofAt = (i: number): number => {
    // 500 ms moving-window slope of f (HUD); shorter span at the start of the window
    if (i <= 0) return rocof0;
    const k = Math.min(i, Math.round(0.5 / dt));
    return (fHist[i] - fHist[i - k]) / (k * dt);
  };
  const tripUnits = (t: number, cause: 'gen_uf' | 'gen_of', kind: FreqEvent['kind'], c: Record<string, number>): void => {
    for (let i = 0; i < n; i++) {
      if (!uOn[i] || us[i].H <= 0) continue;
      uOn[i] = false; x[iV + i] = 0; x[iZ + i] = 0;
      dPe += us[i].P0;
      unitTrips.push({ id: us[i].id, t: rnd3(t), cause, P0MW: us[i].P0 });
      addEvent(t, kind, us[i].id, { ...c, lostMW: us[i].P0 });
    }
    refresh();
  };

  for (let s = 0; s < nst; s++) {
    const t = s * dt;
    deriv(x, k1);
    // settled: instantaneous AND 1 s-mean slope below tolerance (the mean guards against stopping at a slow turning point)
    if (t > settleAfter && Math.abs(k1[0]) < settleTol && timers.length === 0 && ufStart === null && ofStart === null) {
      const k = Math.min(s, Math.round(1 / dt));
      if (Math.abs((fHist[s] - fHist[s - k]) / f0 / (k * dt)) < settleTol) { endReason = 'steady'; break; }
    }
    for (let i = 0; i < N; i++) tmp[i] = x[i] + (dt / 2) * k1[i];
    deriv(tmp, k2);
    for (let i = 0; i < N; i++) tmp[i] = x[i] + (dt / 2) * k2[i];
    deriv(tmp, k3);
    for (let i = 0; i < N; i++) tmp[i] = x[i] + dt * k3[i];
    deriv(tmp, k4);
    const xn = new Float64Array(N);
    for (let i = 0; i < N; i++) xn[i] = x[i] + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
    const tn = (s + 1) * dt;
    const fo = f0 * (1 + x[0]), fz = f0 * (1 + xn[0]);
    x = xn;
    steps = s + 1;
    fHist[steps] = fz;
    if (fz < fMin) { fMin = fz; tMin = tn; iMin = steps; }
    if (fz > fMax) { fMax = fz; tMax = tn; }
    const rc = rocofAt(steps);
    if (Math.abs(rc) > maxRocof) maxRocof = Math.abs(rc);

    // --- UFLS pickups (latching)
    for (const j of stageOrder) {
      const st = gc.ufls[j];
      if (picked[j] || !(fz < st.hz)) continue;
      picked[j] = true;
      const tc = fo < st.hz ? t : fo === fz ? tn : t + (dt * (fo - st.hz)) / (fo - fz);
      timers.push({ due: tc + st.delayS, stage: j, tPick: tc });
      addEvent(tc, 'ufls_pickup', `ufls${j + 1}`, { thresholdHz: st.hz, fBeforeHz: fo, fAfterHz: fz, delayS: st.delayS });
      if (j === firstStage) {
        if (pumpLeft > 0) { dPe -= pumpLeft; loadNow -= pumpLeft; addEvent(tc, 'psp_disconnect', 'psp', { mw: pumpLeft }); pumpLeft = 0; }
        if (chargeLeft > 0) { dPe -= chargeLeft; loadNow -= chargeLeft; addEvent(tc, 'bess_charge_disconnect', 'bess', { mw: chargeLeft }); chargeLeft = 0; }
      }
    }
    // --- apply due UFLS sheds at the end of the step in which the timer expires
    for (let q = 0; q < timers.length;) {
      const tm = timers[q];
      if (tn >= tm.due - 1e-12) {
        const mw = (gc.ufls[tm.stage].shedPct / 100) * loadPre;
        shed += mw; dPe -= mw; loadNow -= mw;
        addEvent(tm.due, 'ufls_shed', `ufls${tm.stage + 1}`, { mw, pctOfLoad: gc.ufls[tm.stage].shedPct, thresholdHz: gc.ufls[tm.stage].hz, tPickup: rnd3(tm.tPick), delayS: gc.ufls[tm.stage].delayS });
        timers.splice(q, 1);
      } else q++;
    }
    // --- generator under/over-frequency (sustained: timer resets if frequency recovers)
    if (gc.genUf) {
      if (fz < gc.genUf.hz) {
        if (ufStart === null) ufStart = fo < gc.genUf.hz ? t : t + (dt * (fo - gc.genUf.hz)) / (fo - fz);
        if (tn >= ufStart + gc.genUf.s - 1e-12) { tripUnits(ufStart + gc.genUf.s, 'gen_uf', 'gen_uf_trip', { thresholdHz: gc.genUf.hz, holdS: gc.genUf.s }); ufStart = null; }
      } else ufStart = null;
    }
    if (gc.genOf) {
      if (fz > gc.genOf.hz) {
        if (ofStart === null) ofStart = fo > gc.genOf.hz ? t : t + (dt * (gc.genOf.hz - fo)) / (fz - fo);
        if (tn >= ofStart + gc.genOf.s - 1e-12) { tripUnits(ofStart + gc.genOf.s, 'gen_of', 'gen_of_trip', { thresholdHz: gc.genOf.hz, holdS: gc.genOf.s }); ofStart = null; }
      } else ofStart = null;
    }
    // --- legacy DER RoCoF trip (full-window slope, latching pickup)
    if (derCfg && !derDone && derLegacyLeft > 0) {
      if (derPick === null && steps >= derWin) {
        const slope = (fz - fHist[steps - derWin]) / (derWin * dt);
        if (Math.abs(slope) > derCfg.hzPerS) derPick = tn;
      }
      if (derPick !== null && tn >= derPick + (derCfg.delayS ?? 0) - 1e-12) {
        dPe += derLegacyLeft;
        addEvent(derPick + (derCfg.delayS ?? 0), 'der_rocof_trip', 'der', { mw: derLegacyLeft, thresholdHzS: derCfg.hzPerS, rocofHzS: (fz - fHist[steps - derWin]) / (derWin * dt) });
        derLegacyLeft = 0; derDone = true;
      }
    }
    if (!(sSys > 0) || !(hNum > 0)) { addEvent(tn, 'blackout', 'system', { fHz: fz }); endReason = 'blackout'; break; }
  }

  // ---- outputs
  const nEnd = steps;
  const tT: number[] = [], fT: number[] = [], rT: number[] = [];
  for (let i = 0; i <= nEnd; i += traceEvery) { tT.push(rnd3(i * dt)); fT.push(fHist[i]); rT.push(rocofAt(i)); }
  if (nEnd % traceEvery !== 0) { tT.push(rnd3(nEnd * dt)); fT.push(fHist[nEnd]); rT.push(rocofAt(nEnd)); }

  // parabolic refinement of the nadir between samples (interior minima only)
  let nadirHz = fMin, tNadir = tMin;
  if (iMin > 0 && iMin < nEnd) {
    const a = fHist[iMin - 1], b = fHist[iMin], c = fHist[iMin + 1];
    const den = a - 2 * b + c;
    if (den > 0) {
      const off = (0.5 * (a - c)) / den;
      const v = b - 0.25 * (a - c) * off;
      if (off > -1 && off < 1 && v <= b) { nadirHz = v; tNadir = tMin + off * dt; }
    }
  }
  const dwEnd = x[0];
  const unitFinal = us.map((u, i) => ({ id: u.id, online: uOn[i], dPmMW: uOn[i] ? clipHeadroom(govPm(u.kind, u, x[iV + i], x[iZ + i]), uLo[i], uHi[i]) : 0 }));
  const bessFinal = input.bess.map((b, j) => ({ id: b.id, pMW: bessOutput(x[iB + j], bR[j], x[iE + j], bE[j]) }));
  return {
    ok: true, trace: { t: tT, fHz: fT, rocofHzS: rT }, events, nadirHz, tNadir: rnd3(tNadir), zenithHz: fMax, tZenith: rnd3(tMax),
    fEndHz: f0 * (1 + dwEnd), tEndS: rnd3(nEnd * dt), endReason, shedMW: shed, rocof0, maxRocof500: maxRocof, hSys: hSys0, sSys: sSys0,
    unitTrips, unitFinal, bessFinal,
  };
}

/** One governing unit for the operator-clock block frequency: S MVA, droop R (pu on S), MW headroom up/down from set-point. */
export interface BlockUnit { id?: string; S: number; R: number; upMW: number; downMW: number }

/** Result of the block-frequency iteration. */
export interface BlockFrequencyResult {
  /** Quasi-steady frequency deviation, Hz (negative = under-frequency). */
  dfHz: number;
  fHz: number;
  /** Frequency-response stiffness of the units still free, plus load damping, MW/Hz. */
  betaMWHz: number;
  /** Indices of units pushed to a limit (they left β). */
  atLimit: number[];
  /** true when no unit and no load damping is left to hold frequency; dfHz is then capped at ±f0. */
  collapsed: boolean;
}

/** Block frequency: β = Σ_free S_i/R_i/f0 + D_load·P_load/f0 [MW/Hz], Δf = −(ΔP_imb − ΣP_limit)/β, iterated as units reach limits. */
export function blockFrequency(units: BlockUnit[], dPimbMW: number, loadMW: number, f0: number, dLoad = 1.5): BlockFrequencyResult {
  const limited = new Array<boolean>(units.length).fill(false);
  const limitMW = new Array<number>(units.length).fill(0);
  const damp = (dLoad * loadMW) / f0;
  let dfHz = 0, beta = 0;
  for (let iter = 0; iter <= units.length + 1; iter++) {
    beta = damp;
    let lim = 0;
    for (let i = 0; i < units.length; i++) {
      if (limited[i]) lim += limitMW[i];
      else if (units[i].R > 0) beta += units[i].S / units[i].R / f0;
    }
    if (!(beta > 0)) { dfHz = dPimbMW > 0 ? -f0 : dPimbMW < 0 ? f0 : 0; return { dfHz, fHz: f0 + dfHz, betaMWHz: 0, atLimit: limited.flatMap((l, i) => (l ? [i] : [])), collapsed: true }; }
    dfHz = -(dPimbMW - lim) / beta;
    let changed = false;
    for (let i = 0; i < units.length; i++) {
      if (limited[i] || !(units[i].R > 0)) continue;
      const resp = (-units[i].S / units[i].R / f0) * dfHz; // MW, positive = more generation for a negative dfHz
      if (resp > units[i].upMW) { limited[i] = true; limitMW[i] = units[i].upMW; changed = true; }
      else if (resp < -units[i].downMW) { limited[i] = true; limitMW[i] = -units[i].downMW; changed = true; }
    }
    if (!changed) break;
  }
  return { dfHz, fHz: f0 + dfHz, betaMWHz: beta, atLimit: limited.flatMap((l, i) => (l ? [i] : [])), collapsed: false };
}
