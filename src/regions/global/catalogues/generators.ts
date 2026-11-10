// DESIGN §4.1 generators and sources, global pack (US$ per kW). Times in seconds, heat rate MJ/kWh (1 Btu/kWh = 0.001055056 MJ/kWh).
// Per-field tags: where DESIGN says `game` or the value is not in an opened source, the tag is `game` (honest), never `recall`.
import type { GeneratorRow } from '../../data';
import { tagged } from '../../catalogueKit';
import { AGORA, EIA23, HREV, MISO24 } from './sources';

const D = 'derived' as const, G = 'game' as const, R = 'report' as const, S = 'secondary' as const;
const g = (row: Omit<GeneratorRow, 'confidence' | 'fieldConfidence'>, fc: Record<string, 'game' | 'report' | 'secondary' | 'derived'>): GeneratorRow => tagged(row, fc) as GeneratorRow;

export const GENERATORS: GeneratorRow[] = [
  g({ id: 'diesel-1500', kind: 'diesel', unit: '1.5 MW genset', capexPerKw: 800, pMinPct: 30, heatRateMJkWh: 9.5, rampPctMin: 20, startHotS: 10, startColdS: 10, hS: 1.0, droopPct: 5, co2tPerMWh: 0.70,
    source: 'game values anchored to typical genset datasheets (not opened); heat rate 9.5 MJ/kWh = 0.26 L/kWh x 36 MJ/L; CO2 = heat rate x about 74 kgCO2/GJ', note: 'game: no manufacturer datasheet was opened; the H range 0.5-1.5 s is a typical genset spread' },
    { capexPerKw: G, pMinPct: G, heatRateMJkWh: G, rampPctMin: G, startHotS: G, hS: G, droopPct: G, co2tPerMWh: G }),
  g({ id: 'microhydro-250k', kind: 'hydro', unit: '0.25 MW Francis, 500 rpm', capexPerKw: 4000, pMinPct: 30, heatRateMJkWh: null, rampPctMin: 50, startHotS: 60, startColdS: 60, hS: 2.0, droopPct: 5, co2tPerMWh: 0,
    source: 'game: capex set above the EIA conventional-hydro row for small scale; H in the range of the hydro review table', note: 'game' },
    { capexPerKw: G, pMinPct: G, rampPctMin: G, startHotS: G, hS: G, droopPct: G, co2tPerMWh: D }),
  g({ id: 'smallhydro-10', kind: 'hydro', unit: '10 MW', capexPerKw: 3421, pMinPct: 30, heatRateMJkWh: null, rampPctMin: 50, startHotS: 180, startColdS: 180, hS: 2.5, droopPct: 5, co2tPerMWh: 0,
    source: `capex: ${EIA23} conventional hydropower; H: ${HREV} (hydro 10-65 MW, 2-4.3 s); P_min/ramp/start: game` },
    { capexPerKw: R, pMinPct: G, rampPctMin: G, startHotS: G, hS: S, droopPct: G, co2tPerMWh: D }),
  g({ id: 'coal-sub-500', kind: 'coal', unit: '500 MW subcritical', capexPerKw: 3600, pMinPct: 40, heatRateMJkWh: 10.0, rampPctMin: 1.5, startHotS: 9000, startColdS: 28800, hS: 3.5, droopPct: 5, co2tPerMWh: 0.95,
    source: `ramp/start: ${AGORA} (common hard coal 1.5 %/min, hot 2.5 h, cold 8 h); H: ${HREV}; heat rate, capex, P_min, CO2: game`, note: 'capex 3,600 US$/kW is a game value set below the EIA ultra-supercritical row (4,507)' },
    { capexPerKw: G, pMinPct: G, heatRateMJkWh: G, rampPctMin: R, startHotS: R, hS: S, droopPct: G, co2tPerMWh: G }),
  g({ id: 'coal-sc-660', kind: 'coal', unit: '660 MW (ultra)supercritical', capexPerKw: 4507, pMinPct: 40, heatRateMJkWh: 9.11, rampPctMin: 3, startHotS: 5400, startColdS: 18000, hS: 4.0, droopPct: 5, co2tPerMWh: 0.86,
    source: `heat rate 8,638 Btu/kWh and capex: ${EIA23} ultra-supercritical coal (verified against the opened table); ramp/start: ${AGORA} state of the art; H: ${HREV}` },
    { capexPerKw: R, pMinPct: G, heatRateMJkWh: R, rampPctMin: R, startHotS: R, hS: S, droopPct: G, co2tPerMWh: G }),
  g({ id: 'ccgt-418', kind: 'gas', unit: '418 MW single-shaft CCGT', capexPerKw: 1330, pMinPct: 45, heatRateMJkWh: 6.785, rampPctMin: 3, startHotS: 4500, startColdS: 12600, hS: 5.0, droopPct: 5, co2tPerMWh: 0.37,
    source: `heat rate 6,431 Btu/kWh and capex: ${EIA23} combined-cycle single-shaft (verified against the opened table); ramp/start/min load: ${AGORA}; H: ${HREV} (gas 90-120 MW: 5 s)` },
    { capexPerKw: R, pMinPct: R, heatRateMJkWh: R, rampPctMin: R, startHotS: R, hS: S, droopPct: G, co2tPerMWh: G }),
  g({ id: 'ocgt-105', kind: 'gas', unit: '105 MW aeroderivative', capexPerKw: 1428, pMinPct: 45, heatRateMJkWh: 9.626, rampPctMin: 10, startHotS: 480, startColdS: 480, hS: 3.0, droopPct: 4, co2tPerMWh: 0.54,
    source: `heat rate 9,124 Btu/kWh and capex: ${EIA23} combustion turbine, aeroderivative (verified); ramp/start: ${AGORA}; H 3.0 s: game (review table lists 5 s for 90-120 MW gas units)` },
    { capexPerKw: R, pMinPct: G, heatRateMJkWh: R, rampPctMin: R, startHotS: R, hS: G, droopPct: G, co2tPerMWh: G }),
  g({ id: 'hydro-250', kind: 'hydro', unit: '250 MW unit, Francis', capexPerKw: 3421, pMinPct: 30, heatRateMJkWh: null, rampPctMin: 50, startHotS: 180, startColdS: 180, hS: 3.0, droopPct: 4, co2tPerMWh: 0,
    source: `capex: ${EIA23} conventional hydropower (verified); H: ${HREV}; P_min/ramp/start: game; T_W: see src/data/governors.ts` },
    { capexPerKw: R, pMinPct: G, rampPctMin: G, startHotS: G, hS: S, droopPct: G, co2tPerMWh: D }),
  g({ id: 'psp-250', kind: 'psp', unit: '250 MW pumped-storage unit', capexPerKw: 2500, pMinPct: 40, heatRateMJkWh: null, rampPctMin: 50, startHotS: 180, startColdS: 300, hS: 3.0, droopPct: 4, co2tPerMWh: 0,
    source: 'game: capex, P_min, start times (gen 3 min, pump 5 min); H as hydro (review table); round-trip efficiency in the storage catalogue', note: 'game; pump-mode trip before UFLS stage 1 is a pack grid-code rule' },
    { capexPerKw: G, pMinPct: G, rampPctMin: G, startHotS: G, hS: S, droopPct: G, co2tPerMWh: G }),
  g({ id: 'nuclear-1100', kind: 'nuclear', unit: '1,100 MW LWR', capexPerKw: 7406, pMinPct: 80, heatRateMJkWh: 11.02, rampPctMin: 0.5, startHotS: 86400, startColdS: 259200, hS: 4.0, droopPct: 5, co2tPerMWh: 0,
    source: `heat rate 10,447 Btu/kWh and capex: ${EIA23} nuclear light water reactor (verified); H: ${HREV} (thermal 1,000 MW: 4-5 s); must-run 80 %, ramp, start 'days': game`, note: 'start times of 1 day (hot) and 3 days (cold) are game values for "days"' },
    { capexPerKw: R, pMinPct: G, heatRateMJkWh: R, rampPctMin: G, startHotS: G, hS: S, droopPct: G, co2tPerMWh: D }),
  g({ id: 'pv-100', kind: 'pv', unit: '100 MW_ac utility PV, DC/AC 1.25, single-axis tracking', capexPerKw: 1448, pMinPct: 0, heatRateMJkWh: null, rampPctMin: null, hS: 0, droopPct: null, co2tPerMWh: 0,
    source: `capex: ${EIA23} solar PV with tracking (verified; AEO2023 input value 1,443)`, note: 'curtailable; irradiance model in DESIGN §3.10' },
    { capexPerKw: R, pMinPct: G, hS: D, co2tPerMWh: D }),
  g({ id: 'wind-50', kind: 'wind', unit: '50 MW farm of 3 MW turbines (3/12/25 m/s)', capexPerKw: 2098, pMinPct: 0, heatRateMJkWh: null, rampPctMin: null, hS: 0, droopPct: null, co2tPerMWh: 0,
    source: `capex: ${EIA23} wind (table value; regional-weighted input 1,566); power curve: game (DESIGN S35)` },
    { capexPerKw: R, pMinPct: G, hS: D, co2tPerMWh: D }),
  g({ id: 'biomass-10', kind: 'biomass', unit: '10 MW Rankine', capexPerKw: 4996, pMinPct: 60, heatRateMJkWh: 14.24, rampPctMin: 1, startHotS: 28800, startColdS: 28800, hS: 2.5, droopPct: 5, co2tPerMWh: 0,
    source: `heat rate 13,500 Btu/kWh and capex: ${EIA23} biomass (verified); P_min, ramp, start, H: game`, note: 'net CO2 taken as 0 (biogenic); H 2.5 s is game (review table lists 4 s for a 10 MW thermal unit)' },
    { capexPerKw: R, pMinPct: G, heatRateMJkWh: R, rampPctMin: G, startHotS: G, hS: G, droopPct: G, co2tPerMWh: G }),
  g({ id: 'synccon-100', kind: 'synccon', unit: '100 MVA synchronous condenser (capex per kVA)', capexPerKw: 169.5, pMinPct: null, heatRateMJkWh: null, rampPctMin: null, startHotS: 900, startColdS: 900, hS: 1.75, droopPct: null, co2tPerMWh: 0,
    source: `capex: ${MISO24} Table 2.3-8 169.5 US$/kVAr (reviewer-opened; not re-opened in the M1.9 pass); H 1.75 s, aux losses 1.5 %, start: game` , note: 'capexPerKw is US$ per kVA for this row' },
    { capexPerKw: R, hS: G, startHotS: G, co2tPerMWh: D }),
];
