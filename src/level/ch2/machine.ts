// L04 Spin the Alternator, the physics (DESIGN 3.5 machine bench; oracle: tools/oracles/ch2_oracles.py, formula AC-17): a micro-hydro set on the waterfall turns at
// the speed the head gives it. f = p N / 120 (poles p, shaft rpm N), e0 = N B A w with w = 2 pi f, E_rms = e0 / sqrt 2. Closed form, no solver. The coil's copper
// is the cost: three phase windings of `turns` turns, each turn the perimeter 4 sqrt(A) of a square coil, on a conductor sized for the set's rated current.
import type { MachineState } from '../../types';

/** The set the River Line will carry: 300 kVA, three phases of 230 V (the 0.4 kV bus of L05 is 230 V x sqrt 3). */
export const MACHINE = {
  ratedKva: 300, phases: 3, ampsPerMm2: 3, copperKgPerM3: 8960,
  voltageRms: 230, voltageTolPct: 2, freqTolPct: 0.5, rpmPerHz: 10,
  poles: { min: 2, max: 24 }, turns: { min: 10, max: 400 }, fieldT: { min: 0.3, max: 0.9 }, areaM2: { min: 0.02, max: 0.2 },
  /** Where a fresh bench starts: a plain 4-pole winding the player will find wrong at once. */
  start: { poles: 4, turns: 30, fieldT: 0.5, areaM2: 0.05 },
} as const;

export interface MachineNumbers {
  fHz: number; omega: number; nba: number; e0V: number; eRmsV: number;
  /** Limits of the village: rms volts, hertz. */
  vLoV: number; vHiV: number; fLoHz: number; fHiHz: number; vPeakTargetV: number;
  /** How much of the tolerance the machine uses: 1 = at the edge, over 1 = out. */
  bandUsed: number; vErrPct: number; fErrPct: number;
  /** Conductor section (mm2), one turn's length (m), winding copper (kg) and its price. */
  sectionMm2: number; turnM: number; copperKg: number; cost: number;
  ok: boolean; vOk: boolean; fOk: boolean;
}

export const freshMachine = (f0: number, copperPerMm2PerM: number): MachineState => ({
  ...MACHINE.start, rpm: f0 * MACHINE.rpmPerHz, vTargetRms: MACHINE.voltageRms, vTolPct: MACHINE.voltageTolPct, fTargetHz: f0, fTolPct: MACHINE.freqTolPct, copperPerMm2PerM,
});

export const frequencyOf = (m: Pick<MachineState, 'poles' | 'rpm'>): number => (m.poles * m.rpm) / 120;
/** The conductor section the winding needs: rated phase current over the current density, rounded to whole mm2. */
export const sectionMm2 = (): number => Math.round((MACHINE.ratedKva * 1000) / (MACHINE.phases * MACHINE.voltageRms) / MACHINE.ampsPerMm2);

export function machineNumbers(m: MachineState): MachineNumbers {
  const fHz = frequencyOf(m), omega = 2 * Math.PI * fHz, nba = m.turns * m.fieldT * m.areaM2, e0V = nba * omega, eRmsV = e0V / Math.sqrt(2);
  const vErrPct = (100 * (eRmsV - m.vTargetRms)) / m.vTargetRms, fErrPct = (100 * (fHz - m.fTargetHz)) / m.fTargetHz;
  const vOk = Math.abs(vErrPct) <= m.vTolPct, fOk = Math.abs(fErrPct) <= m.fTolPct;
  const turnM = 4 * Math.sqrt(m.areaM2), sec = sectionMm2(), lengthM = MACHINE.phases * m.turns * turnM;
  return {
    fHz, omega, nba, e0V, eRmsV,
    vLoV: m.vTargetRms * (1 - m.vTolPct / 100), vHiV: m.vTargetRms * (1 + m.vTolPct / 100), fLoHz: m.fTargetHz * (1 - m.fTolPct / 100), fHiHz: m.fTargetHz * (1 + m.fTolPct / 100),
    vPeakTargetV: m.vTargetRms * Math.sqrt(2),
    bandUsed: Math.max(Math.abs(vErrPct) / m.vTolPct, Math.abs(fErrPct) / m.fTolPct), vErrPct, fErrPct,
    sectionMm2: sec, turnM, copperKg: (lengthM * sec * 1e-6 * MACHINE.copperKgPerM3), cost: lengthM * sec * m.copperPerMm2PerM,
    ok: vOk && fOk, vOk, fOk,
  };
}
