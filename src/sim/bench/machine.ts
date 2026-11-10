// Machine bench (DESIGN 3.5 / L04): e0 = N B A omega, E_rms = e0/sqrt(2), f = p N_rpm / 120.
import { cx, dmath, type Complex } from '@core/numerics';
import { GROUND, solveMna, type BenchResult } from './mna';

/** Peak EMF e0 = N B A w (V; B in tesla, A in m^2, w in rad/s). */
export const emfPeak = (turns: number, bTesla: number, areaM2: number, omega: number): number => turns * bTesla * areaM2 * omega;
/** E_rms = e0 / sqrt(2) (V). */
export const emfRms = (e0: number): number => e0 / dmath.sqrt(2);
/** Electrical frequency f = p N / 120 (Hz; p poles, N rpm). */
export const frequencyHz = (poles: number, rpm: number): number => (poles * rpm) / 120;
/** Speed for a frequency, N = 120 f / p (rpm). */
export const speedRpm = (poles: number, fHz: number): number => (120 * fHz) / poles;
/** Poles needed, p = 120 f / N. */
export const polesFor = (fHz: number, rpm: number): number => (120 * fHz) / rpm;
/** Area of a circular coil, A = pi r^2 (m^2). */
export const circleArea = (rM: number): number => Math.PI * rM * rM;
/** Samples e(t) = e0 sin(2 pi f t) at `perPeriod` points per period over `periods` periods (V). */
export function emfSamples(e0: number, fHz: number, perPeriod = 64, periods = 2): { t: number; e: number }[] {
  const out: { t: number; e: number }[] = [];
  for (let k = 0; k < perPeriod * periods; k++) { const t = k / (perPeriod * fHz); out.push({ t, e: e0 * dmath.sin(2 * Math.PI * fHz * t) }); }
  return out;
}
/** Generator into a resistor via MNA at w; source amplitude is the PEAK phasor, so |I| is the peak current. */
export function alternatorCircuit(e0: number, rLoad: number, w: number, rCoil = 0): BenchResult {
  const emf: Complex = cx(e0);
  return solveMna([
    { kind: 'V', id: 'emf', a: 'g', b: GROUND, e: emf, z: cx(rCoil) },
    { kind: 'R', id: 'load', a: 'g', b: GROUND, r: rLoad },
  ], w);
}
