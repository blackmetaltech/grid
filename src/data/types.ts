// Shared types for the region-independent physics catalogues (DESIGN §4). Every row carries `source` + `confidence`.
import type { Confidence } from '../regions/data';
export type { Confidence };

export interface SourcedRow { id: string; source: string; confidence: Confidence; /** per-field tags where DESIGN splits them */ fieldConfidence?: Partial<Record<string, Confidence>>; note?: string }

/** Weakest first: the row-level confidence is the weakest tag among a row's fields. */
const ORDER: Confidence[] = ['recall', 'game', 'secondary', 'derived', 'report', 'datasheet', 'standard'];
export function weakest(...c: Confidence[]): Confidence {
  return c.reduce((a, b) => (ORDER.indexOf(b) < ORDER.indexOf(a) ? b : a));
}
