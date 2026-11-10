// DESIGN Appendix A.3 (orig 4.3) line costs, `in` pack: INR per km per circuit (lakh/km x 100,000). `recall`: verify against CEA/PGCIL cost data.
import type { LineCostRow } from '../../data';

const l = (id: string, kv: number, lakh: number, variant?: string): LineCostRow => ({ id, kv, costPerKm: lakh * 100_000, doubleCircuitFactor: 1.6, ...(variant ? { variant } : {}), source: `DESIGN Appendix A.3 orig 4.3: ${lakh} lakh/km per circuit; double circuit x1.6`, confidence: 'recall' });
export const LINE_COSTS: LineCostRow[] = [l('line-11', 11, 6), l('line-33', 33, 12), l('line-66', 66, 25), l('line-132', 132, 60), l('line-220', 220, 100), l('line-400-twin', 400, 180, 'twin'), l('line-400-quad', 400, 250, 'quad')];
