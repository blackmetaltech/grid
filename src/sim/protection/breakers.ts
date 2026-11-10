// Circuit breakers and conductor damage (DESIGN 3.8): clearing time, breaking-capacity failure, breaker-failure protection, I2t.
import type { Msg } from '../network';

/** Standard breaking-current ratings (kA, R10 series) and interrupting times (cycles). */
export const BREAKER_RATINGS_KA = [25, 31.5, 40, 50, 63] as const;
export const INTERRUPT_CYCLES = [2, 3, 5] as const;
/** Breaker-failure protection delay before the adjacent breakers open (s). */
export const BF_DELAY_S = 0.2;
/** Conductor adiabatic constant K for aluminium (A sqrt(s) / mm^2), recall-flagged IEC 60949 style (S31). */
export const K_ALUMINIUM = 76;

export interface Breaker {
  id: string;
  /** Rated symmetrical breaking current (kA). */
  ratedKA: number;
  /** Interrupting time in cycles at f0 (2, 3 or 5). */
  cycles: number;
  /** Ids of the breakers adjacent to this one (they open on breaker failure). */
  adjacent: string[];
}

/** Total clearing time = relay time + cycles / f0 (s). */
export function clearingTimeS(relayS: number, cycles: number, f0Hz: number): number {
  return relayS + cycles / f0Hz;
}

/** Breaker fails when the symmetrical fault current exceeds its rated breaking current (S7: no DC offset). */
export function breakerFails(b: Pick<Breaker, 'ratedKA'>, faultKA: number): boolean {
  return faultKA > b.ratedKA;
}

export interface ClearEvent { breaker: string; tS: number; cause: Msg }
export interface ClearResult {
  /** Opening events sorted by time then id. */
  events: ClearEvent[];
  /** Breakers that were commanded but could not break the fault current. */
  failed: string[];
  /** Breakers that never opened (commanded or called by breaker-failure protection but over-duty themselves). */
  stuck: string[];
  /** Time the last event completes (s); Infinity if a breaker is stuck with no backup. */
  clearedAtS: number;
}

/**
 * Clear a fault: each commanded breaker (relay time per id) opens at relay + cycles/f0 if I_f (kA through it) <= rating,
 * otherwise it fails and breaker-failure protection opens every adjacent breaker at relay + 200 ms + their own interrupting time (S7).
 */
export function clearFault(breakers: Breaker[], relayS: Record<string, number>, faultKA: Record<string, number>, f0Hz: number): ClearResult {
  const byId = new Map(breakers.map((b) => [b.id, b]));
  const opened = new Map<string, ClearEvent>();
  const failed: string[] = [], stuck = new Set<string>();
  const cmd = Object.keys(relayS).filter((id) => byId.has(id)).sort();
  for (const id of cmd) {
    const b = byId.get(id)!, t = relayS[id]!, ik = faultKA[id] ?? 0;
    if (!breakerFails(b, ik)) {
      opened.set(id, { breaker: id, tS: clearingTimeS(t, b.cycles, f0Hz), cause: { key: 'breaker.opened', params: { id, kA: ik } } });
    } else {
      failed.push(id); stuck.add(id);
    }
  }
  for (const id of failed) {
    const b = byId.get(id)!, tBf = relayS[id]! + BF_DELAY_S;
    for (const adj of b.adjacent.slice().sort()) {
      const a = byId.get(adj);
      if (!a || opened.has(adj)) continue;
      const ik = faultKA[adj] ?? 0;
      if (breakerFails(a, ik)) { stuck.add(adj); continue; }
      opened.set(adj, { breaker: adj, tS: clearingTimeS(tBf, a.cycles, f0Hz), cause: { key: 'breaker.failure-backup', params: { failed: id, id: adj, kA: ik } } });
    }
  }
  const events = [...opened.values()].sort((x, y) => x.tS - y.tS || (x.breaker < y.breaker ? -1 : 1));
  const stuckList = [...stuck].filter((id) => !opened.has(id)).sort();
  return { events, failed, stuck: stuckList, clearedAtS: stuckList.length ? Infinity : events.reduce((m, e) => Math.max(m, e.tS), 0) };
}

/** Adiabatic limit I^2 t <= (K A)^2 (A in amperes, t in s, area in mm^2): true when the conductor anneals. */
export function conductorAnneals(iA: number, tS: number, areaMm2: number, k: number = K_ALUMINIUM): boolean {
  const lim = k * areaMm2;
  return iA * iA * tS > lim * lim;
}
/** Longest fault duration (s) a conductor survives at current I (A): t = (K A / I)^2; Infinity at zero current. */
export function maxFaultDurationS(iA: number, areaMm2: number, k: number = K_ALUMINIUM): number {
  if (!(iA > 0)) return Infinity;
  const r = (k * areaMm2) / iA;
  return r * r;
}
