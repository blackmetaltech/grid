// Game state -> pure network description for the load flow, cascade and frequency modules. Nothing here mutates the state.
import { S_BASE_MVA, tapTau, type Net, type NetUnit } from './network';
import type { GridState, Unit } from '../types';

export const SYNC_KINDS: ReadonlySet<string> = new Set(['coal', 'gas', 'diesel', 'biomass', 'nuclear', 'hydro', 'psp', 'synccon']);
export const RENEWABLE_KINDS: ReadonlySet<string> = new Set(['pv', 'wind']);
/** Units the economic dispatch moves (synchronous, producing power). */
export const isDispatchable = (u: Unit): boolean => SYNC_KINDS.has(u.kind) && u.kind !== 'synccon' && u.kind !== 'psp';

const pu = (mw: number): number => mw / S_BASE_MVA;

/** The network as the state describes it now: units at their present P, loads at P x (1 - shed), taps at their positions. */
export function toNet(s: Pick<GridState, 'buses' | 'branches' | 'units' | 'loads' | 'shunts' | 'storage'>): Net {
  const vSet = new Map(s.buses.map((b) => [b.id, b.vSet ?? 1]));
  const units: NetUnit[] = [];
  for (const u of s.units) {
    if (SYNC_KINDS.has(u.kind)) units.push({ id: u.id, bus: u.bus, kind: 'sync', online: u.online, p: pu(u.P), pMax: pu(u.pMax), vSet: vSet.get(u.bus) ?? 1, qMin: pu(u.qMin), qMax: pu(u.qMax) });
    else units.push({ id: u.id, bus: u.bus, kind: 'inverter', online: u.online, p: pu(u.P), pMax: pu(u.pMax), q: 0 });
  }
  for (const b of s.storage) units.push({ id: b.id, bus: b.bus, kind: 'inverter', online: b.mw > 0, p: pu(b.P), pMax: pu(b.mw), q: 0 });
  const shunts: Net['shunts'] = [];
  for (const h of s.shunts) {
    const mvar = h.mvarStep * h.on;
    if (h.kind === 'cap') shunts.push({ id: h.id, bus: h.bus, b: pu(mvar), inService: true });
    else if (h.kind === 'reactor') shunts.push({ id: h.id, bus: h.bus, b: -pu(Math.abs(mvar)), inService: true });
    else if (h.kind === 'statcom') units.push({ id: h.id, bus: h.bus, kind: 'statcom', online: h.on > 0, vSet: vSet.get(h.bus) ?? 1, iMax: pu(h.mvarStep * h.steps) });
    else units.push({ id: h.id, bus: h.bus, kind: 'svc', online: h.on > 0, vSet: vSet.get(h.bus) ?? 1, bMin: -pu(h.mvarStep * h.steps), bMax: pu(h.mvarStep * h.steps) });
  }
  return {
    buses: s.buses.map((b) => ({ id: b.id, kV: b.kvNom })),
    branches: s.branches.map((b) => ({ id: b.id, from: b.from, to: b.to, r: b.r, x: b.x, bc: b.bc, gc: b.gc, tau: b.tap ? tapTau(b.tap.pos) : 1, rateMVA: b.ratingMVA, inService: b.inService })),
    shunts,
    loads: s.loads.map((l) => ({ id: l.id, bus: l.bus, p: pu(l.P * (1 - l.shedFrac)), q: pu(l.Q * (1 - l.shedFrac)), zip: l.zip })),
    units,
  };
}
