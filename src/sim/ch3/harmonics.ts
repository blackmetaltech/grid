// L08 harmonic study on the game state: superposition at h x f0 on the 11 kV network around the drives (DESIGN 3.5). Every element is a plain Z at h
// (X_L -> h X_L, X_C -> X_C / h) solved by the bench MNA, so it is an independent path from the load flow. Pure: reads the state, never writes it.
//   supply:   Thevenin at the buses with a running generator: Z_s = (X_s / (X/R)) + j h X_s,  X_s = kV^2 / Ssc
//   feeder:   every in-service line between buses of the group: r + j h x (ohm, from the stored pu on 100 MVA)
//   loads:    one resistor per bus that carries `dampingShare` of its P (the rest of a motor load is inductive and does not damp)
//   banks:    a series Z to ground per capacitor bank: j (h p Xc - Xc / h) + 0.1 % Xc of ESR;  Xc = kV^2 / Q_nameplate, p the reactor share of Xc
//   drives:   a current source I1 / h at each load marked `vfd`, I1 = P / (sqrt(3) V pf)
import { cx, abs, dmath, type Complex } from '@core/numerics';
import { GROUND, solveMna, type Elem } from '../bench/mna';
import { S_BASE_MVA } from '../network';
import type { GridState, Shunt } from '../../types';
import type { HarmonicRules } from './rules';

const ESR = 0.001;
export interface BankStudy { /** short-circuit level seen at the bank's bus, MVA (supply + lines in series) */ sscMVA: number; id: string; bus: string; qNameplateMVAr: number; detunePct: number; ratedA: number; fundA: number; harmA: Record<number, number>; rmsA: number; /** rms / rated */ ratio: number; /** parallel resonance order of the bank with the supply seen at its bus */ hParallel: number }
export interface HarmonicResult { /** fundamental current of all the drives, A */ i1A: number; bus: string; v1PhV: number; vhV: Record<number, number>; thdPct: number; banks: BankStudy[] }

/** Buses joined to `start` through in-service lines (a transformer ends the 11 kV group). */
function group(s: StudyState, start: string): Set<string> {
  const g = new Set([start]); let grew = true;
  while (grew) {
    grew = false;
    for (const b of s.branches) if (b.inService && b.kind !== 'xfmr' && (g.has(b.from) !== g.has(b.to))) { g.add(b.from); g.add(b.to); grew = true; }
  }
  return g;
}

/** The study at the bus of the first drive. null when there is no drive running or no solution yet. */
export type StudyState = Pick<GridState, 'buses' | 'branches' | 'units' | 'loads' | 'shunts'>;
export function harmonicStudy(s: StudyState, r: HarmonicRules, f0: number, vPu: (bus: string) => number | undefined): HarmonicResult | null {
  const drives = s.loads.filter((l) => l.vfd && l.P * (1 - l.shedFrac) > 1e-9);
  if (drives.length === 0) return null;
  const bus = drives[0]!.bus, bb = s.buses.find((x) => x.id === bus);
  if (!bb) return null;
  const kv = bb.kvNom, w0 = 2 * Math.PI * f0, vpu = vPu(bus);
  if (vpu === undefined || !(vpu > 0)) return null;
  const grp = group(s, bus);
  const zOhm = kv * kv / S_BASE_MVA;
  const banks = s.shunts.filter((h) => h.kind === 'cap' && h.on > 0 && !h.blown && grp.has(h.bus));
  const orders = r.orders;
  const v1ph = vpu * kv * 1000 / Math.sqrt(3);
  const net = (h: number): Elem[] => {
    const e: Elem[] = [];
    const xs = kv * kv / r.sscMVA, rs = xs / r.xOverR;
    for (const u of s.units) if (u.online && grp.has(u.bus)) e.push({ kind: 'Z', id: `src-${u.id}`, a: u.bus, b: GROUND, z: cx(rs, h * xs) });
    for (const b of s.branches) if (b.inService && b.kind !== 'xfmr' && grp.has(b.from) && grp.has(b.to)) e.push({ kind: 'Z', id: `br-${b.id}`, a: b.from, b: b.to, z: cx(b.r * zOhm, h * b.x * zOhm) });
    for (const id of grp) {
      const p = s.loads.filter((l) => l.bus === id).reduce((a, l) => a + l.P * (1 - l.shedFrac), 0);
      if (p > 1e-9) e.push({ kind: 'R', id: `damp-${id}`, a: id, b: GROUND, r: kv * kv / (r.dampingShare * p) });
    }
    for (const k of banks) {
      const xc = kv * kv / (Math.abs(k.mvarStep) * k.on), p = (k.detunePct ?? 0) / 100;
      e.push({ kind: 'Z', id: `bank-${k.id}`, a: k.bus, b: GROUND, z: cx(ESR * xc, h * p * xc - xc / h) });
    }
    for (const d of drives) {
      const i1 = d.P * (1 - d.shedFrac) * 1e6 / (Math.sqrt(3) * kv * 1000 * vpu * r.vfdPf);
      e.push({ kind: 'I', id: `vfd-${d.id}`, a: GROUND, b: d.bus, i: cx(i1 / h) });
    }
    return e;
  };
  const vh: Record<number, number> = {}, ch: Record<string, Record<number, number>> = {};
  for (const k of banks) ch[k.id] = {};
  for (const h of orders) {
    const res = solveMna(net(h), w0 * h);
    if (!res.ok) return null;
    vh[h] = abs(res.V[bus] as Complex);
    for (const k of banks) ch[k.id]![h] = abs(res.I[`bank-${k.id}`] as Complex);
  }
  const thd = dmath.sqrt(Object.values(vh).reduce((a, v) => a + v * v, 0)) / v1ph * 100;
  const sscAt = (b: Shunt): number => kv * kv / (xBus(s, b.bus, kv, r, zOhm, grp));
  return {
    i1A: drives.reduce((a, d) => a + d.P * (1 - d.shedFrac) * 1e6 / (Math.sqrt(3) * kv * 1000 * vpu * r.vfdPf), 0), bus, v1PhV: v1ph, vhV: vh, thdPct: thd,
    banks: banks.map((k): BankStudy => {
      const q = Math.abs(k.mvarStep) * k.on, p = (k.detunePct ?? 0) / 100, xc = kv * kv / q;
      const rated = q * 1e6 / (Math.sqrt(3) * kv * 1000), vb = vPu(k.bus) ?? vpu;
      const fund = vb * kv * 1000 / Math.sqrt(3) / (xc * (1 - p));
      const rms = dmath.sqrt(fund * fund + Object.values(ch[k.id]!).reduce((a, c) => a + c * c, 0));
      return { sscMVA: sscAt(k), id: k.id, bus: k.bus, qNameplateMVAr: q, detunePct: p * 100, ratedA: rated, fundA: fund, harmA: ch[k.id]!, rmsA: rms, ratio: rms / rated, hParallel: dmath.sqrt(1 / (q / sscAt(k) + p)) };
    }),
  };
}

/** Reactance seen from `bus` back to the supply: the supply's X_s plus the line X between (radial case: the nearest supply bus, the lines of the group in series along the path). Used for the printed resonance order only. */
function xBus(s: StudyState, bus: string, kv: number, r: HarmonicRules, zOhm: number, grp: Set<string>): number {
  const src = s.units.find((u) => u.online && grp.has(u.bus));
  let x = kv * kv / r.sscMVA;
  if (!src || src.bus === bus) return x;
  const seen = new Set([bus]); let at = bus;
  for (let guard = 0; guard < 20 && at !== src.bus; guard++) {
    const b = s.branches.find((q) => q.inService && q.kind !== 'xfmr' && ((q.from === at && !seen.has(q.to)) || (q.to === at && !seen.has(q.from))));
    if (!b) break;
    x += b.x * zOhm; at = b.from === at ? b.to : b.from; seen.add(at);
  }
  return x;
}

/** Driving-point impedance |Z(h)| at the drives' bus, ohm, for the orders `hs` (any real h): the same network with the drives replaced by a 1 A probe. The parallel resonance is the peak. */
export function impedanceSweep(s: StudyState, r: HarmonicRules, f0: number, hs: number[]): { h: number; zOhm: number }[] {
  const drive = s.loads.find((l) => l.vfd) ?? s.loads[0];
  const bb = drive && s.buses.find((x) => x.id === drive.bus);
  if (!drive || !bb) return [];
  const kv = bb.kvNom, w0 = 2 * Math.PI * f0, grp = group(s, drive.bus), zOhm = kv * kv / S_BASE_MVA;
  const banks = s.shunts.filter((h) => h.kind === 'cap' && h.on > 0 && !h.blown && grp.has(h.bus));
  return hs.map((h) => {
    const e: Elem[] = [];
    const xs = kv * kv / r.sscMVA, rs = xs / r.xOverR;
    for (const u of s.units) if (u.online && grp.has(u.bus)) e.push({ kind: 'Z', id: `src-${u.id}`, a: u.bus, b: GROUND, z: cx(rs, h * xs) });
    for (const b of s.branches) if (b.inService && b.kind !== 'xfmr' && grp.has(b.from) && grp.has(b.to)) e.push({ kind: 'Z', id: `br-${b.id}`, a: b.from, b: b.to, z: cx(b.r * zOhm, h * b.x * zOhm) });
    for (const id of grp) { const p = s.loads.filter((l) => l.bus === id).reduce((a, l) => a + l.P * (1 - l.shedFrac), 0); if (p > 1e-9) e.push({ kind: 'R', id: `damp-${id}`, a: id, b: GROUND, r: kv * kv / (r.dampingShare * p) }); }
    for (const k of banks) { const xc = kv * kv / (Math.abs(k.mvarStep) * k.on), p = (k.detunePct ?? 0) / 100; e.push({ kind: 'Z', id: `bank-${k.id}`, a: k.bus, b: GROUND, z: cx(ESR * xc, h * p * xc - xc / h) }); }
    e.push({ kind: 'I', id: 'probe', a: GROUND, b: drive.bus, i: cx(1) });
    const res = solveMna(e, w0 * h);
    return { h, zOhm: res.ok ? abs(res.V[drive.bus] as Complex) : 0 };
  });
}
