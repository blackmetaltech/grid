// Seeded cloud field (DESIGN 3.10): blobs advected per block; the same field is drawn on the map and dims PV.
import type { Rng } from '@core/kit';
import { dmath } from '@core/numerics';

export interface Cloud {
  /** Centre, tile units. */
  x: number; y: number;
  /** Radius, tile units. */
  radius: number;
  /** Peak opacity in [0,1]. */
  opacity: number;
  /** Velocity, tile units per block. */
  vx: number; vy: number;
}

/** Seeded cloud field: n blobs over a w*h area; coverage scales the count. Deterministic given rng. */
export function generateClouds(rng: Rng, o: { width: number; height: number; count: number; maxSpeed?: number; minRadius?: number; maxRadius?: number }): Cloud[] {
  const out: Cloud[] = [];
  const vmax = o.maxSpeed ?? 0.05;
  for (let i = 0; i < o.count; i++) {
    out.push({
      x: rng.range(0, o.width), y: rng.range(0, o.height),
      radius: rng.range(o.minRadius ?? 0.05 * o.width, o.maxRadius ?? 0.2 * o.width),
      opacity: rng.range(0.3, 0.95),
      vx: rng.range(-vmax, vmax) * o.width, vy: rng.range(-vmax, vmax) * o.height,
    });
  }
  return out;
}

/** Advect by `blocks` blocks (x += vx*blocks), wrapping on the w*h torus so the field stays populated. Pure. */
export function advectClouds(clouds: ReadonlyArray<Cloud>, blocks: number, width: number, height: number): Cloud[] {
  const wrap = (v: number, m: number) => v - m * dmath.floor(v / m);
  return clouds.map((c) => ({ ...c, x: wrap(c.x + c.vx * blocks, width), y: wrap(c.y + c.vy * blocks, height) }));
}

/** Transmittance at (x,y) = prod_i (1 - opacity_i * exp(-(d/r)^2)), in [0,1]. */
export function transmittance(clouds: ReadonlyArray<Cloud>, x: number, y: number): number {
  let t = 1;
  for (const c of clouds) {
    const dx = x - c.x, dy = y - c.y;
    const q = (dx * dx + dy * dy) / (c.radius * c.radius);
    if (q > 16) continue;
    t *= 1 - Math.max(0, Math.min(1, c.opacity)) * dmath.exp(-q);
  }
  return Math.max(0, Math.min(1, t));
}
