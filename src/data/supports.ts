// DEPTH §4.3 support families: physical data only (prices live in the region pack). Heights/spans are typical practice (`recall`).
import type { SupportFamily } from '../sim/route/types';
import type { Confidence } from './types';

export type SupportRow = SupportFamily & { source: string; confidence: Confidence };
const SRC = 'DEPTH §4.3 table: typical distribution/transmission practice (recall); verify against utility catalogues';
const fam = (id: string, kvMax: number, attachM: number, maxSpanM: number, foundations: SupportFamily['foundations'], note = ''): SupportRow =>
  ({ id, kvMax, attachM, maxSpanM, foundations, source: SRC + note, confidence: 'recall' });

export const SUPPORT_FAMILIES: SupportRow[] = [
  fam('wood-9', 11, 7.5, 70, ['earth']),
  fam('pcc-11', 33, 9.0, 100, ['earth', 'pile']),
  fam('tubular-13', 33, 11.0, 130, ['earth', 'pile', 'rock']),
  fam('lattice-33', 66, 15, 300, ['earth', 'pile', 'rock']),
  fam('crossing-h', 33, 18, 300, ['earth', 'pile', 'rock'], '; H-frame crossing structure for distribution voltages (the DEPTH river-crossing tower is 45 m / 900 m, any kV)'),
];
