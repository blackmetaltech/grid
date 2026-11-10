// DESIGN §4.5 reactive compensation, global pack (US$ per kVAr). MISO24 Table 2.3-8 unit costs are `report`; LV/MV capacitors and series capacitors are game.
import type { CompensationRow } from '../../data';
import { tagged } from '../../catalogueKit';
import { MISO24 } from './sources';

const G = 'game' as const, R = 'report' as const, D = 'derived' as const;
const c = (row: Omit<CompensationRow, 'confidence' | 'fieldConfidence'>, fc: Record<string, 'game' | 'report' | 'derived'>): CompensationRow => tagged(row, fc) as CompensationRow;
const lv = (uF: number): CompensationRow => c({ id: `cap-lv-${uF}uF`, kind: 'capacitor-lv', kv: 0.4, mvar: null, pricePerKvar: 25, uFPerPhase: uF, source: 'game: LV capacitor unit (L11), price 25 US$/kVAr; kVAr depends on the Y/delta connection chosen', note: 'game' }, { pricePerKvar: G, uFPerPhase: G });
const mv = (k: number): CompensationRow => c({ id: `cap-11-${k}`, kind: 'capacitor-mv', kv: 11, mvar: k / 1000, pricePerKvar: 15, autoCostFactor: 1.6, source: 'game: 11 kV capacitor bank, 15 US$/kVAr, automatic switching x1.6', note: 'game' }, { pricePerKvar: G, autoCostFactor: G, mvar: G });
const det = (p: number): CompensationRow => c({ id: `cap-detuned-${p}`, kind: 'capacitor-detuned', mvar: null, pricePerKvar: null, detunePct: p, resonanceH: Math.round(100 / Math.sqrt(p / 100)) / 100, costFactor: 1.8, source: 'derived: series resonance h = 1/sqrt(p) (DESIGN G-04); cost x1.8 of the plain bank: game' }, { detunePct: G, resonanceH: D, costFactor: G });
const m = (id: string, kind: string, kv: number, mvar: number, usdPerMvar: number, src: string): CompensationRow => c({ id, kind, kv, mvar, pricePerKvar: usdPerMvar / 1000, source: `${MISO24} Table 2.3-8, ${src}` }, { pricePerKvar: R, mvar: G });

export const COMPENSATION: CompensationRow[] = [
  lv(25), lv(50), lv(100), mv(300), mv(600), mv(900), det(7), det(14),
  m('cap-33-5', 'shunt-capacitor', 33, 5, 11873, 'shunt capacitor 11,873 US$/MVAr'),
  m('cap-220-50', 'shunt-capacitor', 220, 50, 11873, 'shunt capacitor 11,873 US$/MVAr'),
  m('cap-400-50', 'shunt-capacitor', 400, 50, 11873, 'shunt capacitor 11,873 US$/MVAr (the same unit price as the 220 kV bank: the table prints one shunt-capacitor row; L15)'),
  ...[50, 63, 80, 125].map((q) => m(`reactor-400-${q}`, 'shunt-reactor', 400, q, 19950, '345 kV class shunt reactor 19,950 US$/MVAr')),
  m('svc-100', 'svc', 400, 100, 114185, 'SVC 114,185 US$/MVAr'),
  m('statcom-100', 'statcom', 400, 100, 226013, 'STATCOM 226,013 US$/MVAr'),
  m('statcom-200', 'statcom', 400, 200, 226013, 'STATCOM 226,013 US$/MVAr'),
  ...[30, 50].map((p) => c({ id: `series-cap-${p}`, kind: 'series-capacitor', mvar: null, pricePerKvar: 15, seriesPct: p, source: `game: series capacitor ${p} % of line X, 15 US$/kVAr of rating (above shunt capacitors)`, note: 'game' }, { pricePerKvar: G, seriesPct: G })),
];
