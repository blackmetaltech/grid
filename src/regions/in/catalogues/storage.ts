// DESIGN Appendix A.3 (orig 4.6) storage, `in` pack (INR per kW all-in; 1 crore/MW = 10,000 INR/kW). Draft pack: designer tags kept.
import type { StorageRow } from '../../data';
import { tagged } from '../../catalogueKit';

const RC = 'recall' as const, G = 'game' as const, R = 'report' as const;
const A = 'DESIGN Appendix A.3 orig 4.6';
const s = (row: Omit<StorageRow, 'confidence' | 'fieldConfidence'>, fc: Record<string, 'recall' | 'game' | 'report'>): StorageRow => tagged(row, fc) as StorageRow;

export const STORAGE: StorageRow[] = [
  s({ id: 'bess-2h-50', mw: 50, mwh: 100, capexPerKw: null, capexPerKwh: null, allInPerKw: 90000, allInUsdPerKw: 1270, etaRt: 0.86, responseMs: 200, socMinPct: 10, socMaxPct: 90, source: `${A}: EIA 1,270 US$/kW (duration not stated) -> game 9 cr/MW for 2 h; efficiency recall (NREL ATB about 85 %)` }, { allInPerKw: G, allInUsdPerKw: R, etaRt: RC }),
  s({ id: 'bess-4h-50', mw: 50, mwh: 200, capexPerKw: null, capexPerKwh: null, allInPerKw: 140000, etaRt: 0.86, responseMs: 200, socMinPct: 10, socMaxPct: 90, source: `${A}: 14 cr/MW recall` }, { allInPerKw: RC, etaRt: RC }),
  s({ id: 'bess-gfm-50', mw: 50, mwh: 50, capexPerKw: null, capexPerKwh: null, allInPerKw: 100000, etaRt: 0.86, responseMs: 50, socMinPct: 10, socMaxPct: 90, hVs: 4, source: `${A}: 10 cr/MW recall; H_v game` }, { allInPerKw: RC, etaRt: RC, hVs: G }),
  s({ id: 'psp-250', mw: 250, mwh: null, capexPerKw: null, capexPerKwh: null, allInPerKw: 65000, etaRt: 0.75, source: `${A}: recall (see the generator row)` }, { allInPerKw: RC, etaRt: RC }),
];

// L30 island batteries (the `global` rows at the pack's price factor x 8, as the route prices: INR 1,200 per kW of inverter + 3,200 per kWh of cells).
const isl = (kw: number, kwh: number): StorageRow => s({ id: `isl-${kw}kw-${kwh}kwh`, mw: kw / 1000, mwh: kwh / 1000, capexPerKw: 1200, capexPerKwh: 3200, allInPerKw: 1200 + (3200 * kwh) / kw, etaRt: 0.86, responseMs: 50, socMinPct: 10, socMaxPct: 90, source: 'game: the global island battery prices x 8 (the pack\'s like-for-like factor); round-trip 0.86, SoC 10-90 %' },
  { capexPerKw: G, capexPerKwh: G, allInPerKw: G, etaRt: G, responseMs: G, socMinPct: G });
STORAGE.push(isl(25, 50), isl(50, 100), isl(50, 125), isl(50, 150), isl(100, 200));
