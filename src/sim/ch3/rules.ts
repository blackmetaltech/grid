// Chapter 3 level rules (L07-L09), carried in `state.rules.ch3` (absent in every other level, so their states and goldens do not change).
/** L08: the harmonic study of the factory's drives at the feeder (DESIGN 3.5, 3.13 S12). */
export interface HarmonicRules {
  /** Short-circuit level of the supply behind the substation bus, MVA, and its X/R. */
  sscMVA: number; xOverR: number;
  /** Share of the linear load's P that damps the harmonics as a resistor (motors are mostly inductive at h x f0, so only part of the load damps). */
  dampingShare: number;
  /** Harmonic orders of a 6-pulse drive injected as I1/h. */
  orders: number[];
  /** IEEE 519 voltage THD limit at the 11 kV bus, percent; IEC 60871 capacitor rms current limit as a multiple of rated; power factor wanted at the evening peak. */
  thdMaxPct: number; capRmsMax: number; pfPeakMin: number;
  /** Power factor of the drives' fundamental current (displacement). */
  vfdPf: number;
}
/** L09: the scripted 3-phase fault at the end of the radial feeder. */
export interface FaultRules {
  /** Block of the day of the fault, the bus it hits, the supply behind the line's sending bus (MVA, X/R) and the feeder breaker's rated breaking current, kA. */
  block: number; bus: string; sscMVA: number; xOverR: number; breakerKA: number;
  /** Capacitor protective level, multiples of its rated voltage (the MOV bypass, reported not applied: see series.ts). */
  movPu: number;
}
export interface Ch3Rules {
  /** Record the supply-point numbers of the evening peak and of the lunch hour (pfAtPeak, peakAmps, peakMW, noonAmps, noonMW, noonPf) and the lowest voltage a loaded bus saw (loadVMinPu). */
  track?: boolean;
  harmonics?: HarmonicRules;
  fault?: FaultRules;
  /** The power factor at the evening peak that wins (L08), or null. */
  pfPeakMin?: number | null;
  /** The lowest voltage (pu) any loaded bus may see (L09: the far end of the long feeder), or null. */
  loadVMinPu?: number | null;
}
