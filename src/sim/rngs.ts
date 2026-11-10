// Per-system random streams (DESIGN 8.3): each system seeds its own generator from (seed, day, block, system id), so inserting a
// system or drawing more numbers in one system never reshuffles another's randomness, and a loaded save continues exactly.
import { Rng, seedState } from '@core/kit';

/** FNV-1a 32-bit hash of a string. */
export function fnv(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** Order-sensitive 32-bit mix of integers. */
export function mix(...xs: number[]): number {
  let h = 0x9e3779b9;
  for (const x of xs) { h = Math.imul(h ^ (x >>> 0), 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; }
  return h >>> 0;
}

/** The stream of system `id` for the block being computed. */
export function systemRng(seed: number, day: number, block: number, id: string): Rng {
  return new Rng(seedState(mix(seed, day, block, fnv(id))));
}
