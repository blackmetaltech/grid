// GRID's cobanana-scores manifest (see cobanana-scores/docs/INTEGRATION.md, the low-level path): the weekly Career district's
// leaderboard. A board per ISO week, level id `career.<YYYY>-W<ww>`, one metric `score` (higher is better). The server replays
// the career code on this pure engine: the code's seed and charter must be that week's district, every action must be legal,
// and the career must be finished. The game submits `careerScore` of the same state, so the numbers match bit for bit.
// Pure: no clock, no I/O (verify.test.ts guards the import graph). `pnpm vendor:verifier ../grid/src/scores.ts` freezes it.
import { careerScore, decodeCareer, replayCareer, weeklyDistrict } from './career';
import { WEEKLY_SAMPLES } from './scores-samples';

interface MetricSpec { id: string; label: string; unit: string; better: 'lower' | 'higher'; integer?: boolean }
interface VerifyContext { regionRuleset: string; budget(): void }
type VerifyResult = { ok: true; metrics: Record<string, number> } | { ok: false; reason: string };

/** The weeks with a board in this rules version (each later release vendors a bundle that extends the window). */
export const WEEKLY_BOARD_WEEKS: { year: number; week: number }[] = [
  ...Array.from({ length: 52 - 47 + 1 }, (_, i) => ({ year: 2026, week: 47 + i })),
  ...Array.from({ length: 13 }, (_, i) => ({ year: 2027, week: 1 + i })),
];
export const weeklyLevelId = (year: number, week: number): string => `career.${year}-W${String(week).padStart(2, '0')}`;
const METRICS: MetricSpec[] = [{ id: 'score', label: 'score', unit: 'points', better: 'higher', integer: true }];

/** Verify a weekly career: the metrics are exactly what the game shows on the ending sheet. */
export function verifyWeekly(levelId: string, code: string, budget: () => void = () => {}): VerifyResult {
  const m = /^career\.(\d{4})-W(\d{2})$/.exec(levelId);
  if (!m) return { ok: false, reason: 'not a weekly career board' };
  const wd = weeklyDistrict(Number(m[1]), Number(m[2]));
  const d = decodeCareer(code);
  if (!d) return { ok: false, reason: 'undecodable career code' };
  if (d.seed !== wd.seed || d.charter !== wd.charter) return { ok: false, reason: `not ${wd.key}'s district` };
  budget();
  const { state, rejected } = replayCareer(d.seed, d.actions, d.charter);
  budget();
  if (rejected > 0) return { ok: false, reason: `${rejected} illegal actions` };
  if (state.phase !== 'over' || !state.ending) return { ok: false, reason: 'career not finished' };
  return { ok: true, metrics: { score: Math.round(careerScore(state)) } };   // the board is in whole points (the game sends career.boardScore)
}

const levels: Record<string, { metrics: MetricSpec[]; epoch: string }> = {};
for (const w of WEEKLY_BOARD_WEEKS) levels[weeklyLevelId(w.year, w.week)] = { metrics: METRICS, epoch: '5' };   // 1.5 changed scoring (storm levers, target glide); 1.9 the story's answers move cash, crews and outages: a fresh board each time

export const verifier = {
  game: 'grid',
  rulesVersion: '1.12.0',
  gameVersions: ['1.12.0'],   // 1.12 owners' dividends, overload shedding, cable rules and the moor trunk change outcomes (epoch 5); 1.11 same outcomes as 1.10 (epoch 4), its own bundle so the shipped 1.11.0 is scorable; 1.9 the story's answers changed outcomes (epoch 3); 1.10 district beats and flag follow-ups change them again (epoch 4); older bundles keep serving older clients
  regionRulesets: ['global'],
  levels: { global: levels },
  maxSolutionBytes: 65536,
  samples: WEEKLY_SAMPLES,
  verify(levelId: string, solutionCode: string, ctx: VerifyContext): VerifyResult {
    if (ctx.regionRuleset !== 'global') return { ok: false, reason: `region ruleset '${ctx.regionRuleset}' has no career boards` };
    try { return verifyWeekly(levelId, solutionCode, () => ctx.budget()); } catch (e) { if (e instanceof Error && e.name === 'VerifyBudgetExceeded') throw e; return { ok: false, reason: 'replay failed' }; }
  },
};
