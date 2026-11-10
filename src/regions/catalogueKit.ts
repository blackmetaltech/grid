// Helpers for entering catalogue rows: the row `confidence` is always the weakest of its per-field tags (DESIGN §4).
import { weakest } from '../data/types';
import type { Confidence, FieldConf } from './data';

/** Build a row from per-field tags: row.confidence = weakest tag (and the tags are kept in fieldConfidence when more than one distinct). */
export function tagged<T extends object>(row: T, fc: FieldConf): T & { confidence: Confidence; fieldConfidence?: FieldConf } {
  const tags = Object.values(fc) as Confidence[];
  const confidence = weakest(...tags);
  const out: any = { ...row, confidence, ...(new Set(tags).size > 1 ? { fieldConfidence: fc } : {}) };
  // a row that is `game` because of some of its fields says which ones (honest note)
  if (confidence === 'game' && !/game/i.test(`${out.source ?? ''} ${out.note ?? ''}`)) out.source = `${out.source}; game fields: ${Object.entries(fc).filter(([, c]) => c === 'game').map(([k]) => k).join(', ')}`;
  return out;
}
