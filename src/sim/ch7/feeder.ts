// L24: a radial 11 kV feeder with four IEC IDMT overcurrent relays. Fault currents come from the engine's Zbus fault study of the feeder (nodes at the
// scripted fault sites); times from the IEC 60255-151 relay model; the conductor limit is I^2 t <= (K A)^2. Oracle: tools/oracles/ch7_oracles.py.
import { S_BASE_MVA, type Net } from '../network';
import { FaultStudy, conductorAnneals, idmtTime, type FaultModel } from '../protection';
import { SC } from './data';
import type { L24Design } from './state';

/** Pre-fault study of the feeder at the scripted fault sites: the 3-phase fault current (A) at each, from one Zbus. */
let AMPS: number[] | null = null;
export function faultAmps(): number[] {
  if (AMPS) return AMPS;
  const c = SC.l24, zb = (c.kv * c.kv) / S_BASE_MVA;
  const starts = [0]; for (const s of c.sections) starts.push(starts[starts.length - 1]! + s.km);
  const km = c.faults.map((f) => starts[f.section - 1]! + f.at * c.sections[f.section - 1]!.km);
  const nodes = [...new Set([0, ...starts, ...km])].sort((a, b) => a - b);
  const id = (k: number): string => 'N' + k;
  const net: Net = { buses: nodes.map((k) => ({ id: id(k), kV: c.kv })), branches: [], shunts: [], loads: [], units: [] };
  for (let i = 1; i < nodes.length; i++) {
    const d = nodes[i]! - nodes[i - 1]!;
    net.branches.push({ id: 'S' + i, from: id(nodes[i - 1]!), to: id(nodes[i]!), r: (c.zPerKmOhm[0] * d) / zb, x: (c.zPerKmOhm[1] * d) / zb, bc: 0, inService: true });
  }
  const m: FaultModel = { net, gens: [{ bus: id(0), x1: S_BASE_MVA / c.sscMVA }] };
  const st = new FaultStudy(m);
  AMPS = km.map((k) => st.fault(id(k), '3ph').iFaultKA * 1000);
  return AMPS;
}

export type L24Fail = 'nuisance' | 'blind' | 'burnt' | 'miscoordination';
export interface FaultRow { id: string; section: number; amps: number; /** operating time of R1..R_section (s; Infinity = does not operate) */ times: number[]; nearestS: number; marginS: number; worstUp: number | null; burnt: boolean }
export interface L24Study {
  is: number[]; faults: FaultRow[]; totalS: number; minMarginS: number; kind: L24Fail | null;
  /** the offending thing, for the incident report */
  bad: { relay: number; fault: string; upS: number; downS: number; amps: number; limitS?: number } | null;
  /** load (MWh) of healthy sections dropped by an over-tripping upstream relay (the faulted section's own load is lost anyway) */
  avoidableEnsMWh: number;
  capexUSD: number;
}

export function studyL24(d: L24Design): L24Study {
  const c = SC.l24, amps = faultAmps();
  const is = d.relays.map((r, k) => (c.ctA[k]! * r.pct) / 100);
  const faults: FaultRow[] = [];
  let total = 0, minMargin = Infinity, blind = false, burnt = false, mis = false, ens = 0;
  let blindBad: L24Study['bad'] = null, burntBad: L24Study['bad'] = null, misBad: L24Study['bad'] = null, misWorst = Infinity;
  c.faults.forEach((f, fi) => {
    const k = f.section - 1, i = amps[fi]!;
    const times = d.relays.slice(0, k + 1).map((r, j) => idmtTime(r.curve, r.tms, i, is[j]!));
    const tk = times[k]!;
    if (!Number.isFinite(tk)) { blind = true; blindBad ??= { relay: k, fault: f.id, upS: Infinity, downS: Infinity, amps: i }; }
    let margin = Infinity, worstUp: number | null = null;
    for (let j = 0; j < k; j++) {
      const m = times[j]! - tk - c.ctiS;
      if (m < margin) { margin = m; worstUp = j; }
      if (m < -1e-12) {
        mis = true;
        if (m < misWorst) { misWorst = m; misBad = { relay: j, fault: f.id, upS: times[j]!, downS: tk, amps: i }; }
        // the farthest upstream over-tripping relay drops the healthy sections j..k-1
        let far = j; for (let q = 0; q < k; q++) if (times[q]! - tk - c.ctiS < -1e-12) { far = q; break; }
        ens += c.sections.slice(far, k).reduce((a, s) => a + s.mw, 0) * c.repairH;
      }
    }
    const sec = c.sections[k]!;
    const b = Number.isFinite(tk) && conductorAnneals(i, tk, sec.mm2, c.kAlu);
    if (b) { burnt = true; burntBad ??= { relay: k, fault: f.id, upS: tk, downS: tk, amps: i, limitS: ((c.kAlu * sec.mm2) / i) ** 2 }; }
    faults.push({ id: f.id, section: f.section, amps: i, times, nearestS: tk, marginS: margin, worstUp, burnt: b });
    total += tk; if (margin < minMargin) minMargin = margin;
  });
  const nuisanceIdx = is.findIndex((x, k) => x < c.pickupLoadFactor * c.loadA[k]!);
  const kind: L24Fail | null = nuisanceIdx >= 0 ? 'nuisance' : blind ? 'blind' : burnt ? 'burnt' : mis ? 'miscoordination' : null;
  const bad: L24Study['bad'] = nuisanceIdx >= 0 ? { relay: nuisanceIdx, fault: '', upS: 0, downS: 0, amps: c.loadA[nuisanceIdx]! } : kind === 'blind' ? blindBad : kind === 'burnt' ? burntBad : kind === 'miscoordination' ? misBad : null;
  return { is, faults, totalS: blind ? Infinity : total, minMarginS: Number.isFinite(minMargin) ? minMargin : 0, kind, bad, avoidableEnsMWh: ens, capexUSD: c.relayPrice * 4 };
}
