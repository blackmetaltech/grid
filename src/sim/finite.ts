// Finite-number guard: a NaN or Infinity anywhere in the state or a query result is always a bug (DESIGN P24).

/** Path of the first non-finite number inside `v` (arrays and plain objects), or null. */
export function findNonFinite(v: unknown, path = '$'): string | null {
  if (typeof v === 'number') return Number.isFinite(v) ? null : path;
  if (v === null || typeof v !== 'object') return null;
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) { const r = findNonFinite(v[i], `${path}[${i}]`); if (r) return r; }
    return null;
  }
  for (const k of Object.keys(v as object)) { const r = findNonFinite((v as Record<string, unknown>)[k], `${path}.${k}`); if (r) return r; }
  return null;
}

/** `x` when finite, else `fallback`: used where a pure function might emit a NaN into the state. */
export const fin = (x: number, fallback = 0): number => (Number.isFinite(x) ? x : fallback);
