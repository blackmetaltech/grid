// L10 Balance the Phases (DESIGN 2.6, chapter 4, bench): a 230/400 V four-wire street, 18 houses (0.5-4 kW, pf 0.8-1.0) built in a hurry on phase a. The player
// re-connects service drops to phase a, b or c (a crew visit each) and may thicken the neutral. Oracles: tools/oracles/ch4_oracles.py (G-05, the street's
// currents and voltages). Decisive quantity: I_N as a share of the largest phase current (<= 20 % passes).
import type { Action } from '@core/kit';
import type { GridLevelSpec } from '../spec';
import { freshL10 } from '../ch4/state';
import { solveFeeder } from '../../sim/ch4/feeder';
import { NEUTRAL_STD, type Phase } from '../../sim/ch4/data';
import type { GridState } from '../../types';

/** Assignments (house 1..18, one letter each) of the bot population and of the lesson and reference builds; tools/oracles/ch4_oracles.py derives the same strings. */
export const ASSIGN = {
  none: 'a'.repeat(18), rr: 'abcabcabcabcabcabc', ab: 'ab'.repeat(9), kw: 'ccabaccababbabcbac', kva: 'bbaaabcbcaccaccbab', min: 'cabacacaaabacaabaa',
  top6: 'babaaabaaacacaacaa', top8: 'babacababacacaacaa', bypole: 'bcacabacbbacabcacb', revrr: 'cbacbacbacbacbacba',
  // the kVA greedy over only the heaviest N houses (the small ones stay on a): 8 to 11 crew visits, the designs a player reaches by hand
  k9: 'babacacaaabacaacab', k11: 'aabaaacacababbacac', k12: 'aabaabcacbbabaacac', k16: 'babbcaaaabccacacbb', k17: 'cabbcaaabbacbcacba',
} as const;
export const assignActions = (a: string): Action[] => [...a].flatMap((p, i) => (p === 'a' ? [] : [{ name: 'assignPhase', args: [`H${i + 1}`, p] }]));
const run = (s: Readonly<GridState>): boolean => s.tick > s.levelStart;
const phases = (s: Readonly<GridState>): Phase[] => s.ch4?.l10?.phase ?? [];
const live = (s: Readonly<GridState>) => { const l = s.ch4?.l10; return l ? solveFeeder(l.phase, l.neutralMm2, 1) : null; };

export const L10: GridLevelSpec = {
  id: 'L10', kind: 'bench', chapter: 4, titleKey: 'level.L10.title', briefKey: 'level.L10.brief', concepts: ['three-phase', 'neutral-current', 'phasor-sum', 'load-balancing'],
  startBlock: 76, horizonBlocks: 16, maxTicks: 20,
  allowed: { actions: ['assignPhase', 'setNeutral'], parts: { setNeutral: [54.6, 70, 95] } },
  sites: [
    { id: 'balance', options: Object.entries(ASSIGN).map(([id, a]) => ({ id, actions: assignActions(a) })) },
    { id: 'neutral', options: [{ id: 'n54', actions: [] }, { id: 'n70', actions: [{ name: 'setNeutral', args: [70] }] }, { id: 'n95', actions: [{ name: 'setNeutral', args: [95] }] }] },
  ],
  thresholds: { neutralMaxPct: 20, vBandLoPu: { symbol: 'busBandLoPu', kv: 0.4 }, vBandHiPu: { symbol: 'busBandHiPu', kv: 0.4 }, vDevStarPct: 5, lossStar3Pct: 3 },
  decisive: { key: 'neutralPct', limit: 'neutralMaxPct', dir: 'max' },
  star3: [{ key: 'vDevPct', max: 'vDevStarPct' }, { key: 'lossPct', max: 'lossStar3Pct' }],
  story: { placeKey: 'level.L10.place', lineKeys: ['level.L10.story1', 'level.L10.story2'], lessonKey: 'level.L10.lesson' },
  brownoutLoses: false, blackoutLoses: false, stars: true, histogram: 'capex',
  // naive: leave the street as built, every house on phase a
  naive: { actions: [], failKind: 'machine' },
  // lesson: balance by apparent power (kW and pf together): the greedy longest-first fill
  lesson: assignActions(ASSIGN.kva),
  // reference: the fewest crew visits that keep the neutral under 15 % and every far-pole phase within 5 %
  reference: assignActions(ASSIGN.min),
  // frozen from the bot population (src/level/population.ts); tools/oracles/ch4_oracles.py replays the street independently; level.test.ts fails on drift > 2 %
  // frozen from the bot population (src/level/population.ts); tools/oracles/ch4_oracles.py replays the circuit independently; level.test.ts fails on drift > 2 %
  frozen: { global: { budget: 1200, starA: 765, starB: 680 }, in: { budget: 11000, starA: 6885, starB: 6120 } },
  coach: [
    { id: 'read', textKey: 'coach.L10.read', whyKey: 'coach.L10.read.why', done: (s) => phases(s).some((p) => p !== 'a') },
    { id: 'balance', textKey: 'coach.L10.balance', whyKey: 'coach.L10.balance.why', done: (s) => (live(s)?.iNpct ?? 100) <= (s.ch4?.limits.neutralMaxPct ?? 20) },
    { id: 'run', textKey: 'coach.L10.run', whyKey: 'coach.L10.run.why', done: run },
    { id: 'done', textKey: 'coach.L10.done', whyKey: 'coach.L10.done.why', done: (s) => s.status !== 'playing' },
  ],
  place: (s, sc) => { s.ch4 = freshL10(sc); },
};
void NEUTRAL_STD;
