// Pure rules: a draining tank (Torricelli's law with a discharge coefficient). No engine imports here: sim/ is pure functions.
//   q_out = Cd · a · √(2 g h)          (orifice flow, quasi-steady)
//   A · dh/dt = q_in − q_out            (mass balance, incompressible water)
//   steady state: h* = (q_in / (Cd a))² / (2 g)
import { rk4Step } from '@core/numerics';
import { RIG } from '../state';

type Rig = typeof RIG;

/** Orifice outflow, m³/s, for depth h (m). Zero for an empty tank. */
export function outflow(h: number, rig: Rig = RIG): number {
  return h <= 0 ? 0 : rig.Cd * rig.a * Math.sqrt(2 * rig.g * h);
}

/** Supply inflow, m³/s, for a valve opening in [0, 1]. */
export function inflow(valve: number, rig: Rig = RIG): number { return Math.min(1, Math.max(0, valve)) * rig.qMax; }

/** dh/dt, m/s. */
export function dhdt(h: number, valve: number, rig: Rig = RIG): number { return (inflow(valve, rig) - outflow(h, rig)) / rig.A; }

/** Depth that the tank settles at for a fixed valve. */
export function steadyDepth(valve: number, rig: Rig = RIG): number {
  const v = inflow(valve, rig) / (rig.Cd * rig.a);
  return (v * v) / (2 * rig.g);
}

/** Valve opening that holds depth h steady (may exceed 1: then the supply is too small). */
export function valveFor(h: number, rig: Rig = RIG): number { return outflow(h, rig) / rig.qMax; }

/** Advance the depth by `dt` seconds with RK4 sub-steps from core numerics (depth clamped at 0: an empty tank cannot go negative). */
export function advance(h: number, valve: number, dt: number, rig: Rig = RIG, substeps = 20): number {
  const k = dt / substeps; let y = h;
  const f = (_t: number, x: number[]) => [dhdt(Math.max(0, x[0]!), valve, rig)];
  for (let i = 0; i < substeps; i++) y = Math.max(0, rk4Step(f, i * k, [y], k)[0]!);
  return y;
}
