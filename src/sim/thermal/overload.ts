// Overload timers (DESIGN 3.9, S8): t_trip = 600 s / (L^2 - 1) for lines (1800 s transformers) when 1 < L <= 1.5, 5 s above 1.5.

export type ElementKind = 'line' | 'xfmr';
/** Time constants of the timer curve (s): lines 600, transformers 1800. */
export const TAU_S: Record<ElementKind, number> = { line: 600, xfmr: 1800 };
/** Timer resets after this long below RESET_LOADING (one 15-minute block). */
export const BLOCK_S = 900;
export const RESET_LOADING = 0.95;
export const FAST_TRIP_LOADING = 1.5;
export const FAST_TRIP_S = 5;

/** Trip time at constant loading L = max(|S_from|, |S_to|)/S_rating (s): tau/(L^2-1) for 1 < L <= 1.5, 5 s above, Infinity at L <= 1. */
export function tripTimeS(loading: number, kind: ElementKind = 'line'): number {
  if (!(loading > 1)) return Infinity;
  if (loading > FAST_TRIP_LOADING) return FAST_TRIP_S;
  return TAU_S[kind] / (loading * loading - 1);
}

/** Timer of one element: accumulated fraction of the trip time (0..1, trips at 1) and continuous seconds spent below 0.95. */
export interface OverloadTimer { frac: number; belowS: number }
/** Plain JSON countdown state, keyed by element id; absent = fresh. */
export type OverloadState = Record<string, OverloadTimer>;

export interface LoadingInput { loading: number; kind: ElementKind }
export interface OverloadTrip { id: string; /** Seconds after the start of the step. */ atS: number; loading: number }

/** Remaining seconds until a timer trips at constant loading (Infinity when not overloaded). */
export function remainingS(t: OverloadTimer | undefined, loading: number, kind: ElementKind = 'line'): number {
  const tt = tripTimeS(loading, kind);
  return tt === Infinity ? Infinity : Math.max(0, (1 - (t?.frac ?? 0)) * tt);
}

/**
 * Advance every timer by dt seconds at constant loadings: frac += dt / t_trip(L) while L > 1 (persists across blocks);
 * 0.95 <= L <= 1 holds; below 0.95 for a full block (900 s) resets. Returns a new state and the trips inside the step, earliest first.
 */
export function stepOverload(state: OverloadState, loads: Record<string, LoadingInput>, dtS: number): { state: OverloadState; trips: OverloadTrip[] } {
  const next: OverloadState = {};
  const trips: OverloadTrip[] = [];
  const ids = [...new Set([...Object.keys(state), ...Object.keys(loads)])].sort();
  for (const id of ids) {
    const cur = state[id] ?? { frac: 0, belowS: 0 };
    const inp = loads[id];
    if (!inp) { next[id] = { ...cur }; continue; }
    const L = inp.loading;
    if (L > 1) {
      const tt = tripTimeS(L, inp.kind);
      const need = (1 - cur.frac) * tt;
      if (need <= dtS) { trips.push({ id, atS: Math.max(0, need), loading: L }); continue; } // tripped: timer leaves the state
      next[id] = { frac: cur.frac + dtS / tt, belowS: 0 };
    } else if (L < RESET_LOADING) {
      const b = cur.belowS + dtS;
      if (b >= BLOCK_S) continue; // reset
      if (cur.frac > 0) next[id] = { frac: cur.frac, belowS: b };
    } else if (cur.frac > 0) next[id] = { frac: cur.frac, belowS: 0 };
  }
  trips.sort((a, b) => a.atS - b.atS || (a.id < b.id ? -1 : 1));
  return { state: next, trips };
}
