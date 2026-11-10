// Fresh chapter 4 states for the levels' `place` (src/level/levels/l10.ts - l13.ts).
import { HOUSES, NEUTRAL_STD, VREF_NIGHT, type Phase } from '../../sim/ch4/data';
import type { Ch4State } from '../../sim/ch4/state';
import type { ScaffoldCtx } from '../spec';

/** The pack's currency per USD for this chapter's game prices: its bench cable price over the USD one (0.10 per mm2 per metre). */
export const priceFactorOf = (sc: ScaffoldCtx): number => sc.bench.cable.perMm2PerM / 0.1;
const base = (scenario: Ch4State['scenario'], sc: ScaffoldCtx, limits: Record<string, number>): Ch4State => ({ scenario, priceFactor: priceFactorOf(sc), limits, badBlocks: 0, fail: null });

/** L10: the street as built in a hurry for the festival: every service drop on phase a. */
export const freshL10 = (sc: ScaffoldCtx): Ch4State => ({
  ...base('l10', sc, { neutralMaxPct: sc.th.neutralMaxPct!, vLoV: sc.th.vBandLoPu! * 230, vHiV: sc.th.vBandHiPu! * 230 }),
  l10: { phase: HOUSES.map((): Phase => 'a'), neutralMm2: NEUTRAL_STD },
});
export const freshL11 = (sc: ScaffoldCtx, pumpBlock: number): Ch4State => ({
  ...base('l11', sc, { pfMin: sc.th.pfMin!, dipMaxPct: sc.th.dipMaxPct! }),
  l11: { bank: null, starter: 'dol', pumpBlock, started: false },
});
/** L12: the AVR is still on the night set-point. */
export const freshL12 = (sc: ScaffoldCtx, eventBlock: number): Ch4State => ({
  ...base('l12', sc, {}), l12: { vref: VREF_NIGHT, seriesPct: 0, third: false, reduceMW: 0, eventBlock, fired: false, swing: null },
});
export const freshL13 = (sc: ScaffoldCtx): Ch4State => ({ ...base('l13', sc, { predMaxPct: sc.th.predMaxPct!, qTolPu: sc.th.qTolPu! }), l13: { excitation: null } });
