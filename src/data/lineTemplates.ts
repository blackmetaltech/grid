// DESIGN §4.3 line templates, per km, positive sequence (physics data shared by all packs). R = R20*1.24/n; X and B from Glover ch. 4
// (`derived`); phase spacings are typical tower geometries (`game`, flagged). Thermal MVA = sqrt(3)*kV*I75*n. Z0 = 3*Z1 (S6).
// l400-twinmoose / l400-quadmoose: DESIGN Appendix A.3 (orig 4.3) table; tools/oracles/lines.py agrees (twin Moose r 0.0347, x 0.327, b 3.43).
import { weakest, type SourcedRow } from './types';

export interface LineTemplate extends SourcedRow {
  kv: number; conductor: string; nBundle: number; dM: number; rOhmKm: number; xOhmKm: number; bUsKm: number; zcOhm: number; silMw: number; thermalMva: number;
}
const S43 = 'DESIGN §4.3 line-template table (Glover ch. 4 formulas on [APAR] diameters; spacings typical-geometry game)';
const S43A = 'DESIGN Appendix A.3 (orig 4.3) line-template table, same derivation as §4.3; tools/oracles/lines.py';
const t = (id: string, kv: number, conductor: string, nBundle: number, dM: number, rOhmKm: number, xOhmKm: number, bUsKm: number, zcOhm: number, silMw: number, thermalMva: number, source = S43, note?: string): LineTemplate =>
  ({ id, kv, conductor, nBundle, dM, rOhmKm, xOhmKm, bUsKm, zcOhm, silMw, thermalMva, source, confidence: weakest('derived', 'game'), fieldConfidence: { dM: 'game' }, ...(note ? { note } : {}) });

export const LINE_TEMPLATES: LineTemplate[] = [
  t('l11-weasel', 11, 'acsr-weasel', 1, 1.0, 1.1255, 0.377, 3.02, 353, 0.3, 2.2),
  t('l11-rabbit', 11, 'acsr-rabbit', 1, 1.0, 0.6728, 0.360, 3.16, 337, 0.4, 3.0),
  t('l11-dog', 11, 'acsr-dog', 1, 1.0, 0.3389, 0.339, 3.37, 317, 0.4, 4.5),
  t('l33-dog', 33, 'acsr-dog', 1, 1.5, 0.3389, 0.364, 3.13, 341, 3.2, 13),
  t('l66-wolf', 66, 'acsr-wolf', 1, 3.0, 0.2267, 0.392, 2.90, 368, 11.8, 36),
  t('l132-panther', 132, 'acsr-panther', 1, 5.0, 0.1690, 0.415, 2.73, 390, 44.7, 86),
  t('l220-zebra', 220, 'acsr-zebra', 1, 7.0, 0.0836, 0.417, 2.72, 391, 124, 210),
  t('l220-twinzebra', 220, 'acsr-zebra', 2, 7.0, 0.0418, 0.302, 3.72, 285, 170, 420, 'DESIGN §4.3 (reviewer-derived with the same formulas; missing from the designer catalogue)'),
  t('l400-twinmoose', 400, 'acsr-moose', 2, 11.0, 0.0347, 0.327, 3.43, 309, 518, 848, S43A),
  t('l400-quadmoose', 400, 'acsr-moose', 4, 11.0, 0.0173, 0.266, 4.18, 252, 635, 1696, S43A),
];
