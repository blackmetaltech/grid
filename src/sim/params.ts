// Plain simulation parameters. game.ts maps the region pack onto this (src/sim never imports a region), so physics cannot
// branch on a region id: it only sees numbers.
import { BLOCKS_PER_DAY } from '../types';
export { BLOCKS_PER_DAY };

export interface SimParams {
  /** Nominal frequency, Hz, and latitude, degrees north. */
  f0: number;
  latitudeDeg: number;
  gridcode: {
    deadbandHz: number;
    ufls: { hz: number; shedPct: number; delayS: number }[];
    genUf: { hz: number; s: number };
    genOf: { hz: number; s: number };
    /** Load bus below `pu` for `s` seconds loses its motor share. */
    uvLoad: { pu: number; s: number };
    standardRangeHz: [number, number];
    /** Allowed governor droop, percent [min, max]. */
    droopRangePct: [number, number];
  };
  economy: { energyPricePerMWh: number; vollPerMWh: number };
  /** Voltage bands as pu fractions of the level's nominal kV. */
  bands: { levels: { kv: number; loPu: number; hiPu: number }[]; lvBandPct: number; mvBandPct: { learner: number; engineer: number } };
}

/** Allowed voltage band [lo, hi] (pu) of a bus of nominal `kv` in `mode` (learner/engineer/sandbox). */
export function voltageBand(p: SimParams, kv: number, mode: string): [number, number] {
  const exact = p.bands.levels.find((l) => Math.abs(l.kv - kv) < 1e-9);
  if (exact) return [exact.loPu, exact.hiPu];
  const pct = kv < 1 ? p.bands.lvBandPct : mode === 'engineer' ? p.bands.mvBandPct.engineer : p.bands.mvBandPct.learner;
  return [1 - pct / 100, 1 + pct / 100];
}

/** A neutral parameter set for tests and for sim code that runs without a region (50 Hz, +-6 %/5 % bands, generic UFLS). */
export const TEST_PARAMS: SimParams = {
  f0: 50, latitudeDeg: 23,
  gridcode: {
    deadbandHz: 0.01,
    ufls: [{ hz: 49.0, shedPct: 5, delayS: 0.2 }, { hz: 48.8, shedPct: 8, delayS: 0.2 }, { hz: 48.6, shedPct: 8, delayS: 0.2 }],
    genUf: { hz: 47.5, s: 0.5 }, genOf: { hz: 51.5, s: 2 }, uvLoad: { pu: 0.85, s: 2 }, standardRangeHz: [49.95, 50.05], droopRangePct: [2, 12],
  },
  economy: { energyPricePerMWh: 50, vollPerMWh: 10000 },
  bands: { levels: [], lvBandPct: 10, mvBandPct: { learner: 6, engineer: 5 } },
};
