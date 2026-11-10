// DESIGN §4.6 storage, global pack (US$). BESS cost = power part + energy part (MISO24 Table 2.3-8: 71.5 US$/kW + 236 US$/kWh); everything else is game.
import type { StorageRow } from '../../data';
import { tagged } from '../../catalogueKit';
import { MISO24 } from './sources';

const G = 'game' as const, R = 'report' as const, D = 'derived' as const;
const s = (row: Omit<StorageRow, 'confidence' | 'fieldConfidence'>, fc: Record<string, 'game' | 'report' | 'derived'>): StorageRow => tagged(row, fc) as StorageRow;
const ETA = 'round-trip efficiency 0.86: game (NREL ATB lists about 85 %, not opened)';

export const STORAGE: StorageRow[] = [
  s({ id: 'bess-2h-50', mw: 50, mwh: 100, capexPerKw: 71.5, capexPerKwh: 236, allInPerKw: 71.5 + 2 * 236, allInUsdPerKw: 71.5 + 2 * 236, etaRt: 0.86, responseMs: 200, socMinPct: 10, socMaxPct: 90,
    source: `${MISO24} Table 2.3-8 (71.5 US$/kW + 236 US$/kWh, reviewer-opened); all-in = 71.5 + 2 x 236 = 543.5 US$/kW; ${ETA}` }, { capexPerKw: R, capexPerKwh: R, allInPerKw: D, etaRt: G, responseMs: G, socMinPct: G }),
  s({ id: 'bess-4h-50', mw: 50, mwh: 200, capexPerKw: 71.5, capexPerKwh: 236, allInPerKw: 71.5 + 4 * 236, allInUsdPerKw: 71.5 + 4 * 236, etaRt: 0.86, responseMs: 200, socMinPct: 10, socMaxPct: 90,
    source: `${MISO24} Table 2.3-8 (same formula, 4 h: 1,015.5 US$/kW); cross-reference EIA AEO2023 battery storage 1,270 US$/kW; ${ETA}` }, { capexPerKw: R, capexPerKwh: R, allInPerKw: D, etaRt: G, responseMs: G, socMinPct: G }),
  s({ id: 'bess-gfm-50', mw: 50, mwh: 50, capexPerKw: null, capexPerKwh: null, allInPerKw: 500, allInUsdPerKw: 500, etaRt: 0.86, responseMs: 50, socMinPct: 10, socMaxPct: 90, hVs: 4,
    source: 'game: 500 US$/kW (1 h plus inverter premium); virtual inertia H_v = 4 s on rating; 50 ms response', note: 'game' }, { allInPerKw: G, etaRt: G, responseMs: G, hVs: G }),
  s({ id: 'psp-250', mw: 250, mwh: null, capexPerKw: null, capexPerKwh: null, allInPerKw: 2500, allInUsdPerKw: 2500, etaRt: 0.75, responseMs: null, socMinPct: null, socMaxPct: null,
    source: 'game: 2,500 US$/kW (same as the generator row), round-trip efficiency 0.75, response in minutes, reservoir-limited', note: 'game' }, { allInPerKw: G, etaRt: G }),
];
