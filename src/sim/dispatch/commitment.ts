// Unit commitment (DESIGN 3.11): priority list, min up/down, start times, N-1-style reserve, player override.

/** Commitment-side description of a thermal unit. Times are in 15-minute blocks. */
export interface CommitUnit {
  id: string;
  pMin: number; pMax: number;
  /** Full-load average cost (currency/MWh): the priority-list key. */
  fullLoadAvgCost: number;
  minUpBlocks: number; minDownBlocks: number;
  /** Blocks from the start command to synchronisation. */
  startBlocks: number;
  /** Initial state. */
  initialOnline: boolean;
  /** Blocks already spent in the initial state (to honour remaining min up/down). */
  blocksInState: number;
}

export interface CommitmentViolation { unit: string; block: number; code: 'min_up' | 'min_down' }

export interface CommitmentResult {
  /** online[unit][block]: synchronised and dispatchable. */
  online: boolean[][];
  /** startCommand[unit][block]: true on the block the start command is issued (start-up cost incurred). */
  startCommand: boolean[][];
  starts: number;
  /** Blocks where capacity minus the largest online unit is below demand (reserve requirement unmet). */
  reserveShortBlocks: number[];
  violations: CommitmentViolation[];
}

/** Indices sorted by full-load average cost (cheapest first), ties by id. */
export function priorityList(units: CommitUnit[]): number[] {
  return units.map((_, i) => i).sort((i, j) => units[i]!.fullLoadAvgCost - units[j]!.fullLoadAvgCost || (units[i]!.id < units[j]!.id ? -1 : 1));
}

/** Smallest priority-list prefix whose capacity minus its largest unit covers demand (reserve = largest online unit). */
export function neededSet(units: CommitUnit[], order: number[], demandMW: number): boolean[] {
  const on: boolean[] = units.map(() => false);
  let cap = 0, big = 0;
  if (demandMW <= 0) return on;
  for (const i of order) {
    if (cap - big >= demandMW && cap > 0) break;
    on[i] = true; cap += units[i]!.pMax; big = Math.max(big, units[i]!.pMax);
  }
  return on;
}

/**
 * Auto commitment over a horizon. 1) per block take the priority-list prefix meeting demand + reserve; 2) start units
 * `startBlocks` ahead; 3) enforce min up/down by extending short on-runs and filling short off-gaps (initial remaining
 * times honoured); 4) apply `override[unit][block]` (true/false forces, null/undefined leaves auto) and report
 * min up/down violations that the override creates.
 */
export function commit(units: CommitUnit[], demandMW: number[], override?: Array<Array<boolean | null | undefined>>): CommitmentResult {
  const T = demandMW.length, U = units.length;
  const order = priorityList(units);
  const want: boolean[][] = units.map(() => new Array(T).fill(false));
  for (let t = 0; t < T; t++) { const s = neededSet(units, order, demandMW[t]!); for (let u = 0; u < U; u++) want[u]![t] = s[u]!; }

  const online: boolean[][] = [];
  for (let u = 0; u < U; u++) {
    const un = units[u]!, w = want[u]!;
    // online[t] is the synchronised state; the start command is issued startBlocks earlier (see startCommand below).
    const on = w.slice();
    // min-up/min-down on the on/off series
    const prevOn = un.initialOnline;
    const lockedFor = prevOn ? Math.max(0, un.minUpBlocks - un.blocksInState) : Math.max(0, un.minDownBlocks - un.blocksInState);
    for (let t = 0; t < lockedFor && t < T; t++) on[t] = prevOn;
    // fill short gaps, extend short runs (runs touching the horizon edges keep their initial context)
    let t = 0;
    let state = prevOn, runStart = prevOn ? -un.blocksInState : -un.blocksInState;
    while (t < T) {
      if (on[t] !== state) {
        const len = t - runStart;
        const need = state ? un.minUpBlocks : un.minDownBlocks;
        if (len < need) { const end = Math.min(T, runStart + need); for (let k = t; k < end; k++) on[k] = state; t = end; continue; }
        state = on[t]!; runStart = t;
      }
      t++;
    }
    online.push(on);
  }
  const apply = (): void => {
    if (!override) return;
    for (let u = 0; u < U; u++) for (let t = 0; t < T; t++) { const o = override[u]?.[t]; if (o === true || o === false) online[u]![t] = o; }
  };
  apply();

  const startCommand: boolean[][] = [];
  let starts = 0;
  const violations: CommitmentViolation[] = [];
  for (let u = 0; u < U; u++) {
    const un = units[u]!, on = online[u]!;
    const cmd = new Array<boolean>(T).fill(false);
    let prev = un.initialOnline, since = un.blocksInState;
    for (let t = 0; t < T; t++) {
      if (on[t] !== prev) {
        if (prev && since < un.minUpBlocks) violations.push({ unit: un.id, block: t, code: 'min_up' });
        if (!prev && since < un.minDownBlocks) violations.push({ unit: un.id, block: t, code: 'min_down' });
        if (on[t]) { const c = Math.max(0, t - un.startBlocks); cmd[c] = true; starts++; }
        prev = on[t]!; since = 0;
      }
      since++;
    }
    startCommand.push(cmd);
  }
  const reserveShortBlocks: number[] = [];
  for (let t = 0; t < T; t++) {
    let cap = 0, big = 0;
    for (let u = 0; u < U; u++) if (online[u]![t]) { cap += units[u]!.pMax; big = Math.max(big, units[u]!.pMax); }
    if (demandMW[t]! > 0 && cap - big < demandMW[t]!) reserveShortBlocks.push(t);
  }
  return { online, startCommand, starts, reserveShortBlocks, violations };
}
