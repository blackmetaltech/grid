// DESIGN §4.7 protection devices, global pack. IEC 60255-151 constants are `standard` ([PROT] Protecta relay manual Table 1-1); setting ranges,
// breaker ratings, distance zones and the fuse are game (typical practice); THD limits `secondary`. Capacitor limits are `game` (IEC 60871-1 Clause 20 not opened).
import type { ProtectionRow } from '../../data';

const PROT = 'IEC 60255-151 inverse-time constants via Protecta relay manual Table 1-1, https://www.protecta.hu/files/files/41666/toc51_v3.1.pdf';
const curve = (id: string, name: string, k: number, alpha: number): ProtectionRow => ({ id, kind: 'idmt-curve', price: null, params: { name, k, alpha, c: 0 }, source: PROT, confidence: 'standard' });

export const PROTECTION: ProtectionRow[] = [
  curve('idmt-si', 'standard inverse', 0.14, 0.02), curve('idmt-vi', 'very inverse', 13.5, 1), curve('idmt-ei', 'extremely inverse', 80, 2), curve('idmt-lti', 'long-time inverse', 120, 1),
  { id: 'idmt-ranges', kind: 'idmt-settings', price: null, params: { isMinPctCt: 50, isMaxPctCt: 200, isStepPct: 5, tmsMin: 0.025, tmsMax: 1.2, tmsStep: 0.025, ctiS: 0.3 }, source: 'game: typical relay setting ranges and a 0.3 s coordination time interval', confidence: 'game' },
  { id: 'breaker-r10', kind: 'breaker', price: null, params: { ratingsKa: [25, 31.5, 40, 50, 63], interruptCycles: [2, 3, 5] },
    source: 'game: breaking currents are the 25-63 kA members of the R10 preferred-number series (ISO 3: 10, 12.5, 16, 20, 25, 31.5, 40, 50, 63, 80, 100); IEC 62271-100 was not openable, so the selection and the 2/3/5-cycle break times are game values', confidence: 'game', note: 'game: IEC 62271-100 text not opened' },
  { id: 'distance-relay', kind: 'distance', price: null, params: { z1Pct: 80, z1S: 0.03, z2Pct: 120, z2S: 0.35, z3S: 1.0 }, source: 'game: common three-zone setting practice (Z1 80 % instantaneous, Z2 120 % at 350 ms, Z3 at 1.0 s)', confidence: 'game' },
  { id: 'fuse-11kv', kind: 'fuse', price: null, params: { curve: 'idmt-ei', tms: 'fixed' }, source: 'game: K-link fuse simplified to an extremely-inverse curve with fixed TMS', confidence: 'game' },
  { id: 'capacitor-limits', kind: 'capacitor-limits', price: null, params: { overcurrentPu: 1.3, overvoltagePu: 1.1 }, source: 'game: 1.3 x rated current and 1.10 x rated voltage as the fuse-rule limits (IEC 60871-1 Clause 20 covers overloads; its numbers were not opened)', confidence: 'game', note: 'game: standard text not opened' },
  { id: 'thd-limits', kind: 'harmonic-limits', price: null, params: { thdVPct: [{ maxKv: 1, pct: 8 }, { maxKv: 69, pct: 5 }, { maxKv: 161, pct: 2.5 }, { maxKv: 1000, pct: 1.5 }] }, source: 'IEEE 519-2014 Table 1 via the Mirus white paper (secondary copy)', confidence: 'secondary' },
];
