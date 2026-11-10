// DESIGN §4.4 transformers, global pack (US$). Distribution losses are the EU Ecodesign Tier-1 maxima (a published regulation);
// %Z, X/R, tap ranges and power-transformer losses are typical-practice game values (no datasheet opened); MISO unit costs are `report`.
import type { TransformerRow } from '../../data';
import { tagged } from '../../catalogueKit';
import { ECODESIGN, MISO24 } from './sources';

const G = 'game' as const, R = 'report' as const, ST = 'standard' as const;
const t = (row: Omit<TransformerRow, 'confidence' | 'fieldConfidence'>, fc: Record<string, 'game' | 'report' | 'standard'>): TransformerRow => tagged(row, fc) as TransformerRow;

// kVA -> [no-load W, load W] from Ecodesign Tier 1 Table I.1
const ECO: Record<number, [number, number]> = { 100: [145, 1750], 160: [210, 2350], 250: [300, 3250], 400: [430, 4600], 630: [600, 6500] };
const dt = (kva: number): TransformerRow => t({
  id: `dt-${kva}`, mva: kva / 1000, kvHv: 11, kvLv: 0.42, price: 20 * kva, zPct: 4, xr: 3, noLoadKw: ECO[kva]![0] / 1000, loadKw: ECO[kva]![1] / 1000, vector: 'Dyn11', oltc: 'off-circuit +-5 % (2.5 % steps)',
  source: `losses: ${ECODESIGN}; %Z 4 % (<= 630 kVA), X/R 3, taps, price 20 US$/kVA: game (typical practice, no datasheet opened)`,
  note: 'DESIGN printed 0.2/1.8 kW at 100 kVA scaled by S^0.75; the opened regulation gives the Tier-1 ceiling (0.145/1.75 kW), which replaces it',
}, { price: G, zPct: G, xr: G, noLoadKw: ST, loadKw: ST, oltc: G });
const pm = (id: string, mva: number, kvHv: number, kvLv: number, pricePerMva: number | null, price: number, zPct: number, xr: number, nl: number, ld: number, vector: string, oltc: string, costSrc: string): TransformerRow => t({
  id, mva, kvHv, kvLv, price, pricePerMva, zPct, xr, noLoadKw: nl, loadKw: ld, vector, oltc,
  source: `${costSrc}; %Z, X/R, losses, vector group, taps: game (typical large-transformer practice, no datasheet opened)`,
}, { price: pricePerMva === null ? G : R, zPct: G, xr: G, noLoadKw: G, loadKw: G, oltc: G });

export const TRANSFORMERS: TransformerRow[] = [
  ...[100, 160, 250, 400, 630].map(dt),
  pm('pt-33-11-10', 10, 33, 11, null, 600000, 8.35, 15, 10, 55, 'Dyn11', '+-10 % / 1.25 % (16 steps)', 'price 0.6 M US$: game'),
  pm('pt-132-33-50', 50, 132, 33, 5050, 5050 * 50, 12.5, 30, 25, 180, 'YNyn0 (+ delta tertiary)', '+-10 % / 1.25 %', `price 5,050 US$/MVA: ${MISO24} Table 2.3-7, 138/69 kV class`),
  pm('ict-220-132-160', 160, 220, 132, 5896, 5896 * 160, 12.5, 40, 50, 350, 'YNa0 auto', '+-10 % / 1.25 %', `price 5,896 US$/MVA: ${MISO24} Table 2.3-7, 230/138 kV class`),
  pm('ict-400-220-315', 315, 400, 220, 7239, 7239 * 315, 12.5, 50, 120, 600, 'YNa0 auto', '+-10 % / 1.25 %', `price 7,239 US$/MVA: ${MISO24} Table 2.3-7, 345/230 kV class`),
  pm('gsu-500', 500, 400, 21, 7239, 7239 * 500, 15, 60, 150, 1500, 'YNd1', 'none (off-circuit +-5 %)', `price 7,239 US$/MVA: ${MISO24} Table 2.3-7, nearest class; also offered at 600 and 800 MVA`),
  t({ id: 'conv-dcdc-48-380', mva: 0.01, kvHv: 0.38, kvLv: 0.048, price: 800, etaPct: 97, source: 'game: 10 kW 48 V <-> 380 V DC converter, efficiency 97 %, price 800 US$' }, { price: G, etaPct: G }),
];
