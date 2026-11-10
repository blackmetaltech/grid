// What an action would cost before the player commits to it: run it on a copy of the state and read the budget's difference.
// The trays use it for honest price captions (a battery, a bank, a cable, a transformer) without a second price table in the UI.
import type { GameDef, QueryFn } from '@core/kit';
import type { GridState } from './types';

export function buildCostQueries(game: () => GameDef<GridState>): Record<string, QueryFn<GridState>> {
  return {
    /** actionCost(name, args): {ok, cost, message}. cost = budget.spent after - before (negative for a refund); the real state is never touched. */
    actionCost: (s, name: unknown, args: unknown) => {
      const f = typeof name === 'string' ? game().actions?.[name] : undefined;
      if (!f) return { ok: false, cost: 0, message: `unknown action ${String(name)}` };
      const draft = structuredClone(s) as GridState;
      try {
        const r = f(draft, ...(Array.isArray(args) ? args : []));
        if (r && r.ok === false) return { ok: false, cost: 0, message: r.message };
      } catch (e) { return { ok: false, cost: 0, message: e instanceof Error ? e.message : String(e) }; }
      return { ok: true, cost: Math.round((draft.budget.spent - s.budget.spent) * 100) / 100, message: '' };
    },
  };
}
