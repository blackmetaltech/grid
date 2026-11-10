// DESIGN Appendix A.3 (orig 4.5) compensation, `in` pack (INR per kVAr; svc/statcom priced in US$ per kVAr as the table prints). Draft pack: designer tags kept.
import type { CompensationRow } from '../../data';
import { tagged } from '../../catalogueKit';

const RC = 'recall' as const, G = 'game' as const, D = 'derived' as const;
const A = 'DESIGN Appendix A.3 orig 4.5';
const c = (row: Omit<CompensationRow, 'confidence' | 'fieldConfidence'>, fc: Record<string, 'recall' | 'game' | 'derived'>): CompensationRow => tagged(row, fc) as CompensationRow;

export const COMPENSATION: CompensationRow[] = [
  ...[25, 50, 100].map((u) => c({ id: `cap-lv-${u}uF`, kind: 'capacitor-lv', kv: 0.415, mvar: null, pricePerKvar: 400, uFPerPhase: u, source: `${A}: recall` }, { pricePerKvar: RC })),
  ...[300, 600, 900].map((k) => c({ id: `cap-11-${k}`, kind: 'capacitor-mv', kv: 11, mvar: k / 1000, pricePerKvar: 1500, autoCostFactor: 1.6, source: `${A}: recall` }, { pricePerKvar: RC, mvar: RC })),
  ...[7, 14].map((p) => c({ id: `cap-detuned-${p}`, kind: 'capacitor-detuned', mvar: null, pricePerKvar: null, detunePct: p, resonanceH: Math.round(100 / Math.sqrt(p / 100)) / 100, costFactor: 1.8, source: `${A}: resonance derived (G-04), cost factor recall` }, { resonanceH: D, costFactor: RC })),
  ...[['cap-33-5', 33, 5], ['cap-220-50', 220, 50], ['cap-400-50', 400, 50]].map(([id, kv, q]) => c({ id: id as string, kind: 'shunt-capacitor', kv: kv as number, mvar: q as number, pricePerKvar: 700, source: `${A}: 7 lakh/MVAr recall` }, { pricePerKvar: RC })),
  ...[50, 63, 80, 125].map((q) => c({ id: `reactor-400-${q}`, kind: 'shunt-reactor', kv: 400, mvar: q, pricePerKvar: 1800, source: `${A}: 18 lakh/MVAr; standard sizes recall (CEA)` }, { pricePerKvar: RC })),
  c({ id: 'svc-100', kind: 'svc', kv: 400, mvar: 100, pricePerKvar: 75 * 83, pricePerKvarUsd: 75, source: `${A}: 75 US$/kVAr recall`, note: 'the table prints US$ only; the pack-currency price is that US$ price at 83 INR per US$ (game, chapter 5 levels need a priced SVC)' }, { pricePerKvarUsd: RC, pricePerKvar: G }),
  ...[100, 200].map((q) => c({ id: `statcom-${q}`, kind: 'statcom', kv: 400, mvar: q, pricePerKvar: 120 * 83, pricePerKvarUsd: 120, source: `${A}: 120 US$/kVAr recall`, note: 'the table prints US$ only' }, { pricePerKvarUsd: RC, pricePerKvar: G })),
  ...[30, 50].map((p) => c({ id: `series-cap-${p}`, kind: 'series-capacitor', mvar: null, pricePerKvar: null, seriesPct: p, source: `${A}: INR per percent per km (game)`, note: 'no price entered: the table gives a unit, not a value' }, { seriesPct: G })),
];
