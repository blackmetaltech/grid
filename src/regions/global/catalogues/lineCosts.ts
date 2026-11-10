// DESIGN §4.3 line costs, global pack (US$ per km per circuit). MISO24 Table 4.1-1 ($/mile / 1.609, includes 30 % contingency and AFUDC) mapped to the nearest class.
import type { LineCostRow } from '../../data';
import { tagged } from '../../catalogueKit';
import { MISO24 } from './sources';

const G = 'game' as const, R = 'report' as const, D = 'derived' as const;
const l = (id: string, kv: number, costPerKm: number, src: string, fc: Record<string, 'game' | 'report' | 'derived'>, variant?: string): LineCostRow =>
  tagged({ id, kv, costPerKm, doubleCircuitFactor: 1.6, ...(variant ? { variant } : {}), source: `${src}; double-circuit factor 1.6: game` }, { ...fc, doubleCircuitFactor: G }) as LineCostRow;
const M = `${MISO24} Table 4.1-1 new single-circuit line (Arkansas/Iowa/Missouri column)`;

export const LINE_COSTS: LineCostRow[] = [
  l('line-11', 11, 120000, 'game: distribution lines are outside the MISO guide', { costPerKm: G }),
  l('line-33', 33, 250000, 'game: distribution lines are outside the MISO guide', { costPerKm: G }),
  l('line-66', 66, 1060000, `${M}, 69 kV class`, { costPerKm: R }),
  l('line-132', 132, 1240000, `${M}, 138 kV class`, { costPerKm: R }),
  l('line-220', 220, 1370000, `${M}, 230 kV class`, { costPerKm: R }),
  l('line-400-twin', 400, 2400000, `interpolated between ${MISO24} 345 kV (3.5 M$/mile) and 500 kV (4.4 M$/mile)`, { costPerKm: D }, 'twin'),
  l('line-400-quad', 400, 3100000, 'game: 1.3 x the twin-bundle cost', { costPerKm: G }, 'quad'),
];
