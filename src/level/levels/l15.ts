// L15 The Long Line (DESIGN 2.6, chapter 5, Grid): a 400 kV, 350 km twin-Moose single circuit carries a pithead coal plant's power to the load centre.
import type { Action } from '@core/kit';
import { l15Lesson, l15Try } from '../ch5lessons';
import type { GridLevelSpec } from '../spec';
import { place } from '../spec';
import { BLOCKS_PER_DAY } from '../../types';

export const CITY = { peakMW: 400, pf: 0.95, nightFrac: 0.1 } as const;
export const LINE_KM = 350;
export const SOURCE_V = 1.04;
const ANCHORS: [number, number][] = [[0, 0.22], [3, 0.1], [6, 0.3], [9, 0.62], [12, 0.7], [15, 0.7], [18, 0.86], [20, 1.0], [22, 0.62], [24, 0.22]];
export function cityShape(): { p: number[]; q: number[] } {
  const tan = Math.sqrt(1 - CITY.pf * CITY.pf) / CITY.pf, p: number[] = [];
  for (let b = 0; b < BLOCKS_PER_DAY; b++) {
    const h = b / 4;
    let i = 0;
    while (ANCHORS[i + 1]![0] < h) i++;
    const [h0, v0] = ANCHORS[i]!, [h1, v1] = ANCHORS[i + 1]!;
    p.push(v0 + ((v1 - v0) * (h - h0)) / (h1 - h0));
  }
  return { p, q: p.map((x) => x * tan) };
}
const AUTO: [number, number, number] = [0.97, 1.03, 1];
interface Part { id: string; cat: string; steps: number; on: number; auto: boolean }
const REACTORS: { id: string; parts: Part[] }[] = [
  { id: 'none', parts: [] },
  { id: 'r63x1', parts: [{ id: 'r63', cat: 'reactor-400-63', steps: 1, on: 1, auto: false }] }, { id: 'r80x1', parts: [{ id: 'r80', cat: 'reactor-400-80', steps: 1, on: 1, auto: false }] },
  { id: 'r80x2', parts: [{ id: 'r80', cat: 'reactor-400-80', steps: 2, on: 2, auto: false }] },
  { id: 'r80x1-auto', parts: [{ id: 'r80', cat: 'reactor-400-80', steps: 1, on: 1, auto: true }] }, { id: 'r80x2-auto', parts: [{ id: 'r80', cat: 'reactor-400-80', steps: 2, on: 2, auto: true }] },
  { id: 'r80x3-auto', parts: [{ id: 'r80', cat: 'reactor-400-80', steps: 3, on: 3, auto: true }] },
];
const CAPS: { id: string; parts: Part[] }[] = [
  { id: 'none', parts: [] },
  { id: 'c50x1', parts: [{ id: 'c50', cat: 'cap-400-50', steps: 1, on: 1, auto: false }] }, { id: 'c50x2', parts: [{ id: 'c50', cat: 'cap-400-50', steps: 2, on: 2, auto: false }] },
  { id: 'c50x1-auto', parts: [{ id: 'c50', cat: 'cap-400-50', steps: 1, on: 0, auto: true }] }, { id: 'c50x2-auto', parts: [{ id: 'c50', cat: 'cap-400-50', steps: 2, on: 0, auto: true }] },
  { id: 'c50x4-auto', parts: [{ id: 'c50', cat: 'cap-400-50', steps: 4, on: 0, auto: true }] },
];
const SVCS: { id: string; parts: Part[] }[] = [{ id: 'none', parts: [] }, { id: 'svc100', parts: [{ id: 'svc', cat: 'svc-100', steps: 1, on: 1, auto: false }] }];
/** Receiving-end compensation as a list of actions: ids C1, C2, ... follow the order the parts are placed, so a design is one option of one site. */
export function compensation(parts: Part[]): Action[] {
  return parts.flatMap((p, i): Action[] => [
    { name: 'placeShunt', args: ['B2', p.cat, p.steps] }, { name: 'setShuntSteps', args: [`C${i + 1}`, p.on] },
    ...(p.auto ? [{ name: 'setShuntAuto', args: [`C${i + 1}`, ...AUTO] }] : []),
  ]);
}
const combos = REACTORS.flatMap((r) => CAPS.flatMap((c) => SVCS.map((v) => ({ id: [r.id, c.id, v.id].filter((x) => x !== 'none').join('+') || 'none', parts: [...r.parts, ...c.parts, ...v.parts] }))));
const byId = (id: string): Action[] => compensation(combos.find((x) => x.id === id)!.parts);

export const L15: GridLevelSpec = {
  id: 'L15', kind: 'grid', chapter: 5, titleKey: 'level.L15.title', briefKey: 'level.L15.brief', concepts: ['ferranti', 'line-charging', 'shunt-reactor', 'sil'],
  startBlock: 0, horizonBlocks: 96, maxTicks: 100,
  allowed: { actions: ['placeShunt', 'setShuntSteps', 'setShuntAuto'], parts: { placeShunt: ['reactor-400-50', 'reactor-400-63', 'reactor-400-80', 'cap-400-50', 'svc-100'] } },
  sites: [{ id: 'compensation', options: combos.map((x) => ({ id: x.id, actions: compensation(x.parts) })) }],
  thresholds: { vLo: 0.95, vHi: 1.05, vMaxGate: 1.06, opsMax: 2 },
  // gate: 1.06 pu is the band's 1.05 plus one 50 MVAr step of overshoot, so the lesson's 2 % margin is asked of the part that really decides (the night over-voltage) and not of a bank step
  decisive: { key: 'vMaxPu', limit: 'vMaxGate', dir: 'max' },
  star3: [{ key: 'switchOps', max: 'opsMax' }],
  extraRules: (th) => ({ vWatch: { lo: th.vLo!, hi: th.vHi!, kv: [400], buses: ['B2'], graceBlocks: 1 } }),
  lessonText: (s) => l15Lesson(s), tryText: (s) => l15Try(s),
  story: { placeKey: 'level.L15.place', lineKeys: ['level.L15.story1', 'level.L15.story2', 'level.L15.story3'], lessonKey: 'level.L15.lesson' },
  brownoutLoses: false, blackoutLoses: true, stars: true, histogram: 'capex',
  naive: { actions: [], failKind: 'overvoltage' },
  lesson: byId('r80x2-auto+c50x1'), reference: byId('svc100'),
  frozen: { global: {budget: 13000000, starA: 11685642.5, starB: 11685642.5}, in: {budget: 690000000, starA: 627750000, starB: 627750000} },
  coach: [
    { id: 'read-ferranti', textKey: 'coach.L15.read', whyKey: 'coach.L15.read.why', done: (s) => s.tick > s.levelStart },
    { id: 'reactor', textKey: 'coach.L15.reactor', whyKey: 'coach.L15.reactor.why', done: (s) => s.shunts.some((h) => h.kind === 'reactor' || h.kind === 'svc') },
    { id: 'caps', textKey: 'coach.L15.caps', whyKey: 'coach.L15.caps.why', done: (s) => s.shunts.some((h) => h.kind === 'cap' || h.kind === 'svc') },
    { id: 'run-day', textKey: 'coach.L15.run', whyKey: 'coach.L15.run.why', done: (s) => s.status !== 'playing' },
  ],
  place: (s, sc) => {
    const A = (name: string, ...a: unknown[]): void => place(sc, s, name, ...a);
    A('placeBus', 2, 2, 400, 'gen', SOURCE_V); A('placeBus', 20, 2, 400, 'load');
    A('placeUnit', 'coal-sc-660', 'B1', 800);
    A('stringLine', 'B1', 'B2', 'l400-twinmoose', 1, LINE_KM);
    A('placeLoad', 'B2', 'critical', CITY.peakMW, CITY.pf);
    const l = s.loads[0]!; l.shape = cityShape(); l.zip = [0, 0, 1];
    for (const u of s.units) { u.online = true; u.pMin = 0; u.P = 0; }
  },
};
