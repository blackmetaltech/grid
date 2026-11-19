// L36 Exam Bridge: Feeder Numbers. The givens are on screen; the player predicts the far-end voltage drop (textbook formula (R P + X Q)/V^2 summed over the sections, percent),
// SAIFI and SAIDI (min/yr, IEEE 1366) of a small feeder before the engine runs it. The answers are the engine's: the same formula and the analytical reliability.
import { CONDUCTORS, reliability, type ReliabilitySection } from '../distrib';
import { L36 } from './data';

export interface ExamAnswers { dropPct: number; saifi: number; saidi: number; caidi: number; vFarPu: number }
export function examSections(): ReliabilitySection[] {
  return L36.sections.map((s) => ({ id: s.id, parent: s.parent, lengthKm: s.km, lambdaPerKm: L36.lambdaPerKm, repairH: L36.repairH, customers: s.customers, avgLoadKw: s.kw, ...(s.device !== 'none' ? { device: s.device } : {}) }));
}
export function examAnswers(): ExamAnswers {
  const c = CONDUCTORS.find((x) => x.id === L36.conductor)!;
  let drop = 0;
  L36.sections.forEach((s, i) => {
    const p = L36.sections.slice(i).reduce((a, m) => a + m.kw, 0) * 1000, q = L36.sections.slice(i).reduce((a, m) => a + m.kvar, 0) * 1000;
    drop += (c.rOhmKm * s.km * p + c.xOhmKm * s.km * q) / (L36.kV * L36.kV * 1e6);
  });
  const r = reliability(examSections(), { manualH: L36.manualH, remoteH: 0.05, fuseH: 1 });
  return { dropPct: drop * 100, saifi: r.saifi, saidi: r.saidi, caidi: r.caidi, vFarPu: 1 - drop };
}
export const EXAM_IDS = ['dropPct', 'saifi', 'saidi'] as const;
