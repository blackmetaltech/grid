// Chapter 5 actions kept out of the shared actions file: the voltage set-point of a generator bus (L18's PV bus).
import type { ActionFn } from '@core/kit';
import { t } from './i18n';
import type { GridState } from './types';

export const VSET_RANGE: [number, number] = [0.95, 1.1];

export function buildCh5Actions(): Record<string, ActionFn<GridState>> {
  return {
    /** Set the voltage set-point (pu) of a generator bus: the unit holds it while its reactive range lasts. */
    setVSet: (s, bus: unknown, v: unknown) => {
      const b = s.buses.find((x) => x.id === bus);
      if (typeof bus !== 'string' || !b) return { ok: false, message: t('act.unknownId', { what: t('what.bus'), id: String(bus) }), key: 'act.unknownId', params: { what: t('what.bus'), id: String(bus) } };
      if (typeof v !== 'number' || !Number.isFinite(v) || v < VSET_RANGE[0] || v > VSET_RANGE[1]) { const params = { lo: VSET_RANGE[0], hi: VSET_RANGE[1], v: String(v) }; return { ok: false, message: t('act.vset.range', params), key: 'act.vset.range', params }; }
      if (b.kind !== 'gen' || b.vSet === null) { const params = { id: b.id }; return { ok: false, message: t('act.vset.notGen', params), key: 'act.vset.notGen', params }; }
      b.vSet = v; s.solution = null;
      s.actionLog.push({ tick: s.tick, name: 'setVSet', key: 'act.vset.ok' });
      const params = { id: b.id, v };
      return { ok: true, message: t('act.vset.ok', params), key: 'act.vset.ok', params };
    },
  };
}
