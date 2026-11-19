// Analytical radial reliability: failure-mode and effects analysis (FMEA), Billinton and Allan, "Reliability Evaluation of Power Systems"
// (2nd ed.), ch. 7 (radial distribution); index definitions from IEEE Std 1366-2012.
//
// Model. The feeder is a tree of sections. A section has length, failure rate lambda (permanent faults per km per year) and repair time r (h).
// The customers and average load of a section sit at its downstream node. Devices sit at the UPSTREAM end of a section:
//   - the source breaker at the head of every root section (clears and recloses at once: no outage time of its own),
//   - 'fuse': clears faults downstream of it (lateral fuse), is replaced by a crew (fuseH),
//   - 'manual' / 'remote' sectionaliser: opened to isolate a faulty zone (manualH / remoteH hours),
//   - a section may carry a normally open tie at its downstream end to an alternate supply (closing time tie.closeH, capacity tie.capacityKw).
// For a fault on section f (rate lambda*length):
//   F = nearest fuse at or above f (else the source breaker): everything under F is interrupted.
//   s = nearest device at or above f (fuse or sectionaliser or the head): the faulted zone Z = s plus the sections below it, not crossing a
//       further device. Loads in Z are out for r(f).
//   Loads under F but not under s (upstream of the zone): restored by opening s,  t = max(t_sw(s), t_sw(F)).
//   Sub-zones below the zone (under a device b below s): restored through the tie if the tie lies under b and its capacity covers the
//       load:  t = max(t_sw(b), ...) + tie.closeH ; otherwise they stay out for r(f).
// Interruptions of 5 min or less are momentary (IEEE 1366): they do not enter SAIFI / SAIDI / CAIDI but their energy is in ENS.
// Simplifications: permanent faults only, single faults, perfect switches and protection, a tie restores whole sub-zones below a device only.
//   SAIFI = sum(lambda_i N_i) / N_T          SAIDI = sum(U_i N_i) / N_T (min/yr)         CAIDI = SAIDI / SAIFI        ENS = sum(L_i U_i) (MWh/yr)

export type SwitchKind = 'none' | 'fuse' | 'manual' | 'remote';
export interface ReliabilitySection {
  id: string; parent: string | null;
  lengthKm: number; lambdaPerKm: number; repairH: number;
  customers: number; avgLoadKw: number;
  /** Device at the upstream end of this section. */
  device?: SwitchKind;
  /** Normally open tie at this section's downstream end. */
  tie?: { closeH: number; capacityKw?: number };
}
export interface ReliabilityTimes { manualH: number; remoteH: number; fuseH: number }
export const DEFAULT_TIMES: ReliabilityTimes = { manualH: 1, remoteH: 0.05, fuseH: 1 };
/** IEEE 1366: an interruption is sustained when longer than 5 minutes. */
export const SUSTAINED_H = 5 / 60;

export interface SectionContribution {
  id: string; faultsPerYear: number; customerInterruptions: number; customerMinutes: number; saifi: number; saidiMin: number; ensMWh: number;
}
export interface ReliabilityResult {
  saifi: number; saidi: number; caidi: number; ensMWh: number; customers: number;
  /** Faults per year over the whole feeder. */
  faultsPerYear: number;
  sections: SectionContribution[];
  /** outage hours of node k for a fault on section f (rows: fault, columns: node), for teaching tables. */
  outageH: Record<string, Record<string, number>>;
}

function tSwitch(d: SwitchKind | undefined, t: ReliabilityTimes): number {
  return d === 'fuse' ? t.fuseH : d === 'manual' ? t.manualH : d === 'remote' ? t.remoteH : 0;
}

export function reliability(secs: ReliabilitySection[], times: ReliabilityTimes = DEFAULT_TIMES): ReliabilityResult {
  const idx = new Map<string, number>();
  secs.forEach((s, i) => idx.set(s.id, i));
  const par = secs.map((s) => (s.parent === null ? -1 : idx.get(s.parent) ?? -1));
  const kids: number[][] = secs.map(() => []);
  par.forEach((p, i) => { if (p >= 0) kids[p]!.push(i); });
  const sub = (a: number): number[] => { const out = [a]; for (let h = 0; h < out.length; h++) out.push(...kids[out[h]!]!); return out; };
  const subs = secs.map((_, i) => new Set(sub(i)));
  const isDev = (i: number): boolean => par[i]! < 0 || (secs[i]!.device ?? 'none') !== 'none';
  const devTime = (i: number): number => (par[i]! < 0 ? 0 : tSwitch(secs[i]!.device, times));
  const nearest = (f: number, pred: (i: number) => boolean): number => { let a = f; while (a >= 0 && !pred(a)) a = par[a]!; return a < 0 ? rootOf(f) : a; };
  const rootOf = (f: number): number => { let a = f; while (par[a]! >= 0) a = par[a]!; return a; };
  const hasTie = (set: Set<number>): { s: ReliabilitySection; load: number } | null => {
    for (const i of set) if (secs[i]!.tie) return { s: secs[i]!, load: [...set].reduce((a, j) => a + secs[j]!.avgLoadKw, 0) };
    return null;
  };
  const NT = secs.reduce((a, s) => a + s.customers, 0);
  const outageH: Record<string, Record<string, number>> = {};
  const contrib: SectionContribution[] = [];
  let saifi = 0, saidi = 0, ens = 0, faults = 0;
  for (let f = 0; f < secs.length; f++) {
    const sf = secs[f]!, lam = sf.lambdaPerKm * sf.lengthKm, r = sf.repairH;
    const F = nearest(f, (i) => par[i]! < 0 || secs[i]!.device === 'fuse');
    const s = nearest(f, isDev);
    const hit = subs[F]!;
    // faulted zone: s and descendants not crossing a further device
    const zone = new Set<number>();
    const walk = (a: number) => { zone.add(a); for (const c of kids[a]!) if (!isDev(c)) walk(c); };
    walk(s);
    const row: Record<string, number> = {};
    for (let k = 0; k < secs.length; k++) {
      let d = 0;
      if (hit.has(k)) {
        if (zone.has(k)) d = r;
        else if (!subs[s]!.has(k)) d = Math.max(tSwitch(secs[s]!.device, times) * (par[s]! < 0 ? 0 : 1), devTime(F));
        else {
          // below the zone: find the device b on the path from k up to s
          let b = k; while (!isDev(b)) b = par[b]!;
          const tie = hasTie(subs[b]!);
          d = tie && (tie.s.tie!.capacityKw === undefined || tie.load <= tie.s.tie!.capacityKw) ? devTime(b) + tie.s.tie!.closeH : r;
          d = Math.min(d, r);
        }
      }
      row[secs[k]!.id] = d;
    }
    outageH[sf.id] = row;
    let ci = 0, cm = 0, e = 0;
    for (let k = 0; k < secs.length; k++) {
      const d = row[secs[k]!.id]!, sk = secs[k]!;
      if (d > SUSTAINED_H) { ci += sk.customers; cm += sk.customers * d * 60; }
      e += (sk.avgLoadKw * d) / 1000;
    }
    contrib.push({ id: sf.id, faultsPerYear: lam, customerInterruptions: lam * ci, customerMinutes: lam * cm, saifi: NT ? (lam * ci) / NT : 0, saidiMin: NT ? (lam * cm) / NT : 0, ensMWh: lam * e });
    saifi += NT ? (lam * ci) / NT : 0; saidi += NT ? (lam * cm) / NT : 0; ens += lam * e; faults += lam;
  }
  return { saifi, saidi, caidi: saifi > 0 ? saidi / saifi : 0, ensMWh: ens, customers: NT, faultsPerYear: faults, sections: contrib, outageH };
}
