// DESIGN Appendix A.3 (orig 4.4) transformers, `in` pack (INR). 1 crore = 1e7, 1 lakh = 1e5. Draft pack: designer tags kept.
import type { TransformerRow } from '../../data';
import { tagged } from '../../catalogueKit';

const RC = 'recall' as const, G = 'game' as const, D = 'derived' as const;
const A = 'DESIGN Appendix A.3 orig 4.4';
const s075 = (x: number): number => Math.sqrt(x) * Math.sqrt(Math.sqrt(x));   // x^0.75 without pow (determinism rule)
const t = (row: Omit<TransformerRow, 'confidence' | 'fieldConfidence'>, fc: Record<string, 'recall' | 'game' | 'derived'>): TransformerRow => tagged(row, fc) as TransformerRow;
const dt = (kva: number): TransformerRow => t({ id: `dt-${kva}`, mva: kva / 1000, kvHv: 11, kvLv: 0.433, price: Math.round((300000 + ((kva - 100) * 900000) / 530) / 1000) * 1000, zPct: 4.5, xr: 3, noLoadKw: Math.round(0.2 * s075(kva / 100) * 1000) / 1000, loadKw: Math.round(1.8 * s075(kva / 100) * 1000) / 1000, vector: 'Dyn11', oltc: 'off-circuit +-5 % (2.5 % steps)',
  source: `${A}: IS 1180 (not opened); 0.2/1.8 kW at 100 kVA scaled by S^0.75; price 3-12 lakh over the family`, note: 'the source table gives a range (3-12 lakh for the family); game: the price per row is interpolated linearly in kVA from 3 lakh at 100 kVA to 12 lakh at 630 kVA (L05 buys these)' }, { price: G, zPct: RC, xr: RC, noLoadKw: kva === 100 ? RC : D, loadKw: kva === 100 ? RC : D, oltc: RC });
const pm = (id: string, mva: number, kvHv: number, kvLv: number, price: number, z: number, xr: number, nl: number, ld: number, vector: string, oltc: string, note?: string): TransformerRow =>
  t({ id, mva, kvHv, kvLv, price, zPct: z, xr, noLoadKw: nl, loadKw: ld, vector, oltc, source: `${A}: recall`, ...(note ? { note } : {}) }, { price: RC, zPct: RC, xr: RC, noLoadKw: RC, loadKw: RC, oltc: RC });

export const TRANSFORMERS: TransformerRow[] = [
  ...[100, 160, 250, 400, 630].map(dt),
  pm('pt-33-11-10', 10, 33, 11, 13_000_000, 8.35, 15, 10, 55, 'Dyn11', '+-10 % / 1.25 % (16 steps)', 'CEA specification, not opened'),
  pm('pt-132-33-50', 50, 132, 33, 50_000_000, 12.5, 30, 25, 180, 'YNyn0 (+ delta tertiary)', '+-10 % / 1.25 %'),
  pm('ict-220-132-160', 160, 220, 132, 100_000_000, 12.5, 40, 50, 350, 'YNa0 auto', '+-10 % / 1.25 %'),
  pm('ict-400-220-315', 315, 400, 220, 200_000_000, 12.5, 50, 120, 600, 'YNa0 auto', '+-10 % / 1.25 %', '315 MVA is a CEA standard rating (confirmed by the designer); the rest recall'),
  pm('gsu-500', 500, 400, 21, 300_000_000, 15, 60, 150, 1500, 'YNd1', 'none (off-circuit +-5 %)', 'also offered at 600 and 800 MVA'),
  t({ id: 'conv-dcdc-48-380', mva: 0.01, kvHv: 0.38, kvLv: 0.048, price: 60_000, etaPct: 97, source: `${A}: game (0.6 lakh)` }, { price: G, etaPct: G }),
];
