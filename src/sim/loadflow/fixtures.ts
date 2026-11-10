// Small textbook networks used by the oracle tests (and handy for other lanes' tests).
import { emptyNet, type Net, type NetBranch } from '../network';

const br = (id: string, from: string, to: string, r: number, x: number, bc = 0, tau = 1): NetBranch => ({ id, from, to, r, x, bc, tau, inService: true });
const bus = (id: string) => ({ id, kV: 138 });

/** DESIGN 9.1 3-bus data (PS-14/15/16): slack 1.05, PQ load 256.6 + j110.2 MVA at bus 2, PV 200 MW at 1.05 on bus 3 (100 MVA base). */
export function threeBusSaadat(): Net {
  return {
    ...emptyNet(), buses: ['1', '2', '3'].map(bus),
    branches: [br('l12', '1', '2', 0.02, 0.04), br('l13', '1', '3', 0.01, 0.03), br('l23', '2', '3', 0.0125, 0.025)],
    loads: [{ id: 'ld2', bus: '2', p: 2.566, q: 1.102 }],
    units: [
      { id: 'g1', bus: '1', kind: 'sync', online: true, p: 0, pMax: 10, vSet: 1.05, qMin: -10, qMax: 10 },
      { id: 'g3', bus: '3', kind: 'sync', online: true, p: 2.0, pMax: 2.0, vSet: 1.05, qMin: -10, qMax: 10 },
    ],
  };
}

/** Slack at bus 1 (V = 1) feeding one load through a single branch (PS-13 / G-17 style). */
export function twoBus(r: number, x: number, p: number, q: number, tau = 1, bc = 0): Net {
  return {
    ...emptyNet(), buses: ['1', '2'].map(bus),
    branches: [br('l12', '1', '2', r, x, bc, tau)],
    loads: [{ id: 'ld2', bus: '2', p, q }],
    units: [{ id: 'g1', bus: '1', kind: 'sync', online: true, p: 0, pMax: 100, vSet: 1, qMin: -100, qMax: 100 }],
  };
}
