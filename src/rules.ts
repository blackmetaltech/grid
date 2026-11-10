// Level plumbing for the pipeline's verdict: core calls Level.goal / Level.fail after every tick and action; both just read the
// verdict the `levelRules` system stored in `state.block`. A level sets `state.rules` in its `setup`.
import type { GridState, Rules } from './types';
import { t } from './i18n';

export const NO_RULES: Rules = { horizonBlocks: null, maxEnsMWh: null, maxCost: null, minNadirHz: null, maxPoorSupplyMin: null, blackoutLoses: false, flashoverBlock: null, starCost: null, starBasis: 'operating', star3: [] };

export const ruleGoal = (s: Readonly<GridState>): boolean => s.block.verdict === 'won';
export function ruleFail(s: Readonly<GridState>): string | null {
  if (s.block.verdict !== 'lost' || !s.block.verdictKey) return null;
  return t(s.block.verdictKey, s.block.verdictParams);
}
