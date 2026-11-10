// Fuel prices, global pack: US$ per GJ of fuel (nuclear: US$ per electric MWh). Game constants; EIA Electric Power Monthly/Annual Table 7.4 (2025) is the cross-check.
import type { FuelRow } from '../../data';

const EIA74 = 'EIA Electric Power Annual Table 7.4 (weighted average cost of fossil fuels for the electric power industry, 2025), https://www.eia.gov/electricity/annual/html/epa_07_04.html';
export const FUELS: FuelRow[] = [
  { id: 'coal', unit: 'GJ', price: 2.6, source: `game 2.60 US$/GJ; cross-check ${EIA74}: all coal ranks 2.42 US$/MMBtu = 2.29 US$/GJ`, confidence: 'game', note: 'game: set about 13 % above the 2025 EIA average (delivered cost varies by rank and region)' },
  { id: 'gas', unit: 'GJ', price: 4, source: `game 4.00 US$/GJ; cross-check ${EIA74}: natural gas 3.85 US$/MMBtu = 3.65 US$/GJ (2025; 2.76 in 2024)`, confidence: 'game', note: 'game: rounded between the 2024 and 2025 EIA annual averages' },
  { id: 'diesel', unit: 'GJ', price: 25, source: `game 25 US$/GJ (about 0.96 US$/L at 38.3 MJ/L); ${EIA74} lists petroleum at 14.12 US$/MMBtu = 13.4 US$/GJ, but that is dominated by residual oil and coke, not distillate`, confidence: 'game', note: 'game: distillate priced well above the EIA petroleum average' },
  { id: 'biomass', unit: 'GJ', price: 4, source: 'game 4.00 US$/GJ; EIA Table 7.4 does not cover biomass', confidence: 'game', note: 'game' },
  { id: 'nuclear', unit: 'MWh_e', price: 7, source: 'game 7 US$ per electric MWh; EIA Table 7.4 does not cover nuclear fuel', confidence: 'game', note: 'game' },
];
