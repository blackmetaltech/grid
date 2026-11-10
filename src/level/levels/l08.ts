// L08 Resonance at the Fifth (DESIGN 2.6, chapter 3): a textile factory with variable-speed drives (6-pulse, I_h = I1 / h) joins the L07 feeder (now ACSR Rabbit, 156 A) at the mill bus.
// The L07 bank (900 kVAr) forms a parallel resonance with the supply at h_r = sqrt(S_sc / Q_c) = 5: the 5th harmonic current of the drives floods the capacitor, its rms current
// passes 1.3 x rated (IEC 60871) and the fuse blows (src/sim/ch3). A detuned bank (reactor 7 % of Xc: series resonance at 3.78, parallel below the 5th) or a filter tuned at 4.7 keeps
// the current out. Voltage THD <= 5 % (IEEE 519) at the 11 kV bus and a power factor >= 0.95 at the evening peak are the other pass rules; the third star adds THD <= 3 %.
import type { Action } from '@core/kit';
import type { GridLevelSpec } from '../spec';
import { place } from '../spec';
import { BLOCKS_PER_DAY } from '../../types';
import { t } from '../../i18n';
import { MILL, millShape } from './l07';
import { FILTER_PCT } from '../../ch3-actions';

/** The factory's drives: 0.8 MW at displacement pf 0.95, 08:00-22:00. */
export const FACTORY = { peakMW: 0.8, pf: 0.95, onHour: 8, offHour: 22 } as const;
export function factoryShape(): { p: number[]; q: number[] } {
  const tan = Math.sqrt(1 - FACTORY.pf * FACTORY.pf) / FACTORY.pf;
  const p: number[] = [], q: number[] = [];
  for (let b = 0; b < BLOCKS_PER_DAY; b++) { const h = b / 4, on = h >= FACTORY.onHour && h < FACTORY.offHour ? 1 : 0; p.push(on); q.push(on * tan); }
  return { p, q };
}
/** The supply behind the substation bus and the damping model of the harmonic study (src/sim/ch3/harmonics.ts). */
export const SUPPLY = { sscMVA: 30, xOverR: 10, dampingShare: 0.15 } as const;
export const THD_MAX = 5, THD_STAR3 = 3, CAP_RMS_MAX = 1.3, PF_PEAK_MIN = 0.95;

/** A bank at a bus: size in 300 kVAr steps (all switched in), reactor share of Xc in percent (0 plain, 4.53 filter, 7 / 14 detuned). */
export const bank = (bus: string, kvar: number, detunePct: number): Action[] => [
  { name: 'placeBank', args: [bus, 'cap-11-300', kvar / 300, detunePct] }, { name: 'setShuntSteps', args: ['C1', kvar / 300] },
];
export const SIZES = [600, 900, 1200];
export const DETUNES = [0, FILTER_PCT, 7, 14];

export const L08: GridLevelSpec = {
  id: 'L08', kind: 'grid', chapter: 3, titleKey: 'level.L08.title', briefKey: 'level.L08.brief', concepts: ['harmonics', 'resonance', 'detuned-reactors', 'thd'],
  startBlock: 0, horizonBlocks: 96, maxTicks: 100,
  allowed: {
    actions: ['placeBank', 'setShuntSteps', 'demolish'],
    parts: { placeBank: ['cap-11-300'], 'placeBank.detunePct': [0, FILTER_PCT, 7, 14] },
  },
  sites: [
    {
      id: 'bank', options: [
        { id: 'none', actions: [] },
        ...['B2', 'B1'].flatMap((bus) => SIZES.flatMap((kvar) => DETUNES.map((p) => ({ id: `${bus}-${kvar}-${p}`, actions: bank(bus, kvar, p) })))),
      ],
    },
  ],
  thresholds: { thdMaxPct: THD_MAX, thdStar3Pct: THD_STAR3, capRmsMax: CAP_RMS_MAX, pfPeakMin: PF_PEAK_MIN, loadBusMinPu: { symbol: 'busBandLoPu', kv: 11 } },
  decisive: { key: 'capRmsRatio', limit: 'capRmsMax', dir: 'max' },
  star3: [{ key: 'thdPct', max: 'thdStar3Pct' }],
  ch3: {
    track: true, pfPeakMin: PF_PEAK_MIN,
    harmonics: { ...SUPPLY, orders: [5, 7, 11, 13], thdMaxPct: THD_MAX, capRmsMax: CAP_RMS_MAX, pfPeakMin: PF_PEAK_MIN, vfdPf: FACTORY.pf },
  },
  brownoutLoses: true, blackoutLoses: true, stars: true, histogram: 'capex',
  story: { placeKey: 'level.L08.place', lineKeys: ['level.L08.story1', 'level.L08.story2', 'level.L08.story3'], lessonKey: 'level.L08.lesson', lessonKind: 'harm' },
  // naive: keep the L07 bank (900 kVAr, plain) at the mill bus: it resonates at the 5th and blows its fuse at 08:00 when the drives start
  naive: { actions: bank('B2', 900, 0), failKind: 'capFuse' },
  lesson: bank('B2', 900, 7),
  reference: bank('B2', 1200, FILTER_PCT),
  // frozen from the bot population (25 designs per region: 4 pass; budget = 1.1 x the dearer of lesson and reference rounded up to 2 significant figures; A = the median passing cost, never under B;
  // B = the only design that also keeps THD <= 3 %: the 4.7 filter on 1200 kVAr); level.test.ts regenerates them and fails on drift > 2 %
  frozen: { global: { budget: 52000, starA: 46800, starB: 46800 }, in: { budget: 5200000, starA: 4680000, starB: 4680000 } },
  coach: [
    { id: 'read', textKey: 'coach.L08.read', whyKey: 'coach.L08.read.why', done: (s) => s.tick > s.levelStart },
    { id: 'bank', textKey: 'coach.L08.bank', whyKey: 'coach.L08.bank.why', done: (s) => s.shunts.length > 0 },
    { id: 'detune', textKey: 'coach.L08.detune', whyKey: 'coach.L08.detune.why', done: (s) => s.shunts.some((h) => (h.detunePct ?? 0) > 0) },
    { id: 'switch-in', textKey: 'coach.L08.switch', whyKey: 'coach.L08.switch.why', done: (s) => s.shunts.some((h) => h.on > 0 || h.blown === true) },
    { id: 'run-day', textKey: 'coach.L08.run', whyKey: 'coach.L08.run.why', done: (s) => s.status !== 'playing' },
  ],
  place: (s, sc) => {
    const A = (name: string, ...a: unknown[]): void => place(sc, s, name, ...a);
    A('placeBus', 2, 2, 11, 'gen', 1.03); A('placeBus', 12, 2, 11, 'load');
    A('stringLine', 'B1', 'B2', 'l11-rabbit', 1, 4);   // the council reconductored the feeder after the L07 summer
    A('placeUnit', 'ccgt-418', 'B1', 20);
    A('placeLoad', 'B2', 'industrial', MILL.peakMW, MILL.pf); A('placeLoad', 'B2', 'residential', 0.5, 0.95); A('placeLoad', 'B2', 'industrial', FACTORY.peakMW, FACTORY.pf);
    s.buses[0]!.name = t('place.ch3.substation'); s.buses[1]!.name = t('place.ch3.millbus');   // the map says which bus the bank goes on
    for (const l of s.loads) l.zip = [0, 0, 1];
    s.loads[0]!.shape = millShape();
    s.loads[2]!.shape = factoryShape(); s.loads[2]!.vfd = true;
    for (const u of s.units) { u.online = true; u.pMin = 0; u.P = 0; }
  },
};
