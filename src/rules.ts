// Level plumbing for the pipeline's verdict: core calls Level.goal / Level.fail after every tick and action; both just read the
// verdict the `levelRules` system stored in `state.block`. A level sets `state.rules` in its `setup`.
import type { GridState, Rules } from './types';
import { t } from './i18n';
import { formatMoney } from '@core/regions';
import { REGIONS } from './regions';

export const NO_RULES: Rules = { horizonBlocks: null, maxEnsMWh: null, maxCost: null, minNadirHz: null, maxPoorSupplyMin: null, blackoutLoses: false, flashoverBlock: null, starCost: null, starBasis: 'operating', star3: [] };

export const ruleGoal = (s: Readonly<GridState>): boolean => s.block.verdict === 'won';
export function ruleFail(s: Readonly<GridState>): string | null {
  if (s.block.verdict !== 'lost' || !s.block.verdictKey) return null;
  const k = s.block.verdictKey, vp = s.block.verdictParams;
  // the budget message shows money like the rest of the UI ($452,353), in the state's region
  if (k === 'level.lost.budget') return t(k, { spent: formatMoney(Number(vp.spent), REGIONS.get(s.region), { decimals: 0 }), max: formatMoney(Number(vp.max), REGIONS.get(s.region), { decimals: 0 }) });
  return t(k, vp);
}
