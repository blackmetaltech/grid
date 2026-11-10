// DESIGN Appendix A.3 (orig 4.7) protection devices, `in` pack. Draft pack: designer tags kept (breakers, distance relay, droop: recall).
import type { ProtectionRow } from '../../data';

const PROT = 'IEC 60255-151 constants via Protecta relay manual Table 1-1';
const curve = (id: string, name: string, k: number, alpha: number): ProtectionRow => ({ id, kind: 'idmt-curve', price: null, params: { name, k, alpha, c: 0 }, source: PROT, confidence: 'standard' });

export const PROTECTION: ProtectionRow[] = [
  curve('idmt-si', 'standard inverse', 0.14, 0.02), curve('idmt-vi', 'very inverse', 13.5, 1), curve('idmt-ei', 'extremely inverse', 80, 2), curve('idmt-lti', 'long-time inverse', 120, 1),
  { id: 'idmt-ranges', kind: 'idmt-settings', price: null, params: { isMinPctCt: 50, isMaxPctCt: 200, isStepPct: 5, tmsMin: 0.025, tmsMax: 1.2, tmsStep: 0.025, ctiS: 0.3 }, source: 'DESIGN A.3 orig 4.7: typical practice (game)', confidence: 'game' },
  { id: 'breaker-r10', kind: 'breaker', price: null, params: { ratingsKa: [25, 31.5, 40, 50, 63], interruptCycles: [2, 3, 5] }, source: 'DESIGN A.3 orig 4.7: IEC 62271-100 R10 series, standard not openable', confidence: 'recall' },
  { id: 'distance-relay', kind: 'distance', price: null, params: { z1Pct: 80, z1S: 0.03, z2Pct: 120, z2S: 0.35, z3S: 1.0 }, source: 'DESIGN A.3 orig 4.7: POWERGRID practice', confidence: 'recall' },
  { id: 'fuse-11kv', kind: 'fuse', price: null, params: { curve: 'idmt-ei', tms: 'fixed' }, source: 'DESIGN A.3 orig 4.7: K-link simplified to EI with fixed TMS (game)', confidence: 'game' },
  { id: 'capacitor-limits', kind: 'capacitor-limits', price: null, params: { overcurrentPu: 1.3, overvoltagePu: 1.1 }, source: 'DESIGN A.3 orig 4.5: IEC 60871-1, clause text not openable', confidence: 'recall' },
  { id: 'thd-limits', kind: 'harmonic-limits', price: null, params: { thdVPct: [{ maxKv: 1, pct: 8 }, { maxKv: 69, pct: 5 }, { maxKv: 161, pct: 2.5 }, { maxKv: 1000, pct: 1.5 }] }, source: 'IEEE 519-2014 Table 1 via the Mirus white paper (secondary copy)', confidence: 'secondary' },
];
