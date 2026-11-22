// 1.9 "Storylines": the people of the district and the choices they bring. A beat is a letter on the desk at the start of a quarter
// (plan beats) or a call during an incident (incident beats). Each has two honest answers with real consequences (cash, the incident's
// customer-minutes, crews, tree-cutting, storm hardening) and moves what that person thinks of you. Earlier answers set flags that later
// beats read: a promise in writing comes due, a crew pushed through the night is short the next storm. Unanswered beats lapse at the
// end of the quarter: the asker takes the silence as an answer (trust only, no mechanics), so batch replays and personas stay valid.
// Deterministic: beats open from the state alone, no rng.
import { charterOf } from './district';
import { feederById, fail, ok, type ActionResult, type CareerState, type Feeder, type Incident } from './state';

export type Who = 'tobi' | 'vance' | 'okafor' | 'ines' | 'tom';
export const CAST: Who[] = ['tobi', 'vance', 'okafor', 'ines', 'tom'];
export type Opt = 'a' | 'b';

export interface Effect {
  cashM?: number;
  /** multiplier on the customer-minutes of the incident the beat came with */
  cm?: number;
  trust?: Partial<Record<Who, number>>;
  flag?: string;
  /** crews added (or, negative, let go) for good */
  crews?: number;
  /** set the district's tree-cutting level */
  veg?: number;
  /** harden the villages feeder (covered conductor on the exposed spans) */
  hardenVillages?: boolean;
  /** clear the villages feeder's corridor now */
  clearVillages?: boolean;
  /** new load connected now on the hospital or the villages feeder (kW at the winter peak, customers) */
  load?: { on: 'hospital' | 'villages'; kw: number; customers: number };
}
export interface Beat {
  id: string; who: Who; on: 'plan' | 'incident';
  /** title, body, the two answers, what each answer led to (shown after), and the recap line for the ending */
  keys: { title: string; body: string; a: string; b: string; aRes: string; bRes: string; aRecap: string; bRecap: string; lapse: string };
  when: (s: CareerState, st: Story, inc?: Incident) => boolean;
  a: Effect; b: Effect;
  /** silence: the asker decides alone (trust only) */
  lapse: Effect;
}
export interface OpenBeat { id: string; t: number; inc?: string; feeder?: string }
export interface StoryLog { t: number; id: string; opt: Opt | 'lapse'; feeder?: string }
export interface Story {
  trust: Record<Who, number>; flags: string[]; seen: string[];
  /** feeder with the hospital (most customers at the start) and the villages (the last feeder of the second primary: the long rural run) */
  hospital: string; villages: string;
  /** quarter the hospital promise falls due */
  due?: number;
  open: OpenBeat[]; log: StoryLog[];
}

const geoOf = (s: CareerState): string => charterOf(s).geo ?? '';
const has = (st: Story, f: string): boolean => st.flags.includes(f);
const once = (st: Story, id: string): boolean => !st.seen.includes(id);
const lastReview = (s: CareerState) => s.reviews[s.reviews.length - 1];
/** A feeder counts as protected for the hospital promise when it has a tie or any remote switch. */
export const hospitalProtected = (s: CareerState, st: Story): boolean => {
  const f = feederById(s, st.hospital);
  return !!f && (f.tie || f.sections.some((x) => x.device === 'remote'));
};

export const BEATS: Beat[] = [
  {
    id: 'nightShift', who: 'tobi', on: 'incident',
    keys: { title: 'story.nightShift.title', body: 'story.nightShift.body', a: 'story.nightShift.a', b: 'story.nightShift.b', aRes: 'story.nightShift.aRes', bRes: 'story.nightShift.bRes', aRecap: 'story.nightShift.aRecap', bRecap: 'story.nightShift.bRecap', lapse: 'story.nightShift.lapse' },
    when: (s, st, inc) => !!inc && inc.kind === 'storm' && s.t >= 1 && once(st, 'nightShift'),
    a: { cm: 0.85, trust: { tobi: -1 }, flag: 'pushedCrew' }, b: { cm: 1.15, trust: { tobi: 1 }, flag: 'restedCrew' }, lapse: { trust: { tobi: -1 } },
  },
  {
    id: 'tobiShort', who: 'tobi', on: 'incident',
    keys: { title: 'story.tobiShort.title', body: 'story.tobiShort.body', a: 'story.tobiShort.a', b: 'story.tobiShort.b', aRes: 'story.tobiShort.aRes', bRes: 'story.tobiShort.bRes', aRecap: 'story.tobiShort.aRecap', bRecap: 'story.tobiShort.bRecap', lapse: 'story.tobiShort.lapse' },
    when: (s, st, inc) => !!inc && inc.kind === 'storm' && has(st, 'pushedCrew') && once(st, 'tobiShort') && s.t >= firstT(st, 'nightShift') + 2 && s.t <= firstT(st, 'nightShift') + 6,
    a: { cashM: -0.06 }, b: { cm: 1.2, trust: { tobi: -1 } }, lapse: { cm: 1.2, trust: { tobi: -1 } },
  },
  {
    id: 'tobiExtra', who: 'tobi', on: 'incident',
    keys: { title: 'story.tobiExtra.title', body: 'story.tobiExtra.body', a: 'story.tobiExtra.a', b: 'story.tobiExtra.b', aRes: 'story.tobiExtra.aRes', bRes: 'story.tobiExtra.bRes', aRecap: 'story.tobiExtra.aRecap', bRecap: 'story.tobiExtra.bRecap', lapse: 'story.tobiExtra.lapse' },
    when: (s, st, inc) => !!inc && inc.kind === 'storm' && has(st, 'restedCrew') && once(st, 'tobiExtra') && s.t >= firstT(st, 'nightShift') + 2 && s.t <= firstT(st, 'nightShift') + 8,
    a: { cm: 0.8, cashM: -0.03, trust: { tobi: 1 } }, b: { trust: { tobi: 2 } }, lapse: {},
  },
  {
    id: 'inesPromise', who: 'ines', on: 'plan',
    keys: { title: 'story.inesPromise.title', body: 'story.inesPromise.body', a: 'story.inesPromise.a', b: 'story.inesPromise.b', aRes: 'story.inesPromise.aRes', bRes: 'story.inesPromise.bRes', aRecap: 'story.inesPromise.aRecap', bRecap: 'story.inesPromise.bRecap', lapse: 'story.inesPromise.lapse' },
    when: (s, st) => s.t >= 2 && s.t <= 7 && once(st, 'inesPromise') && !hospitalProtected(s, st),
    a: { trust: { ines: 1 }, flag: 'promisedInes' }, b: { trust: { ines: -1 }, flag: 'honestInes' }, lapse: { trust: { ines: -1 } },
  },
  {
    id: 'inesKept', who: 'ines', on: 'plan',
    keys: { title: 'story.inesKept.title', body: 'story.inesKept.body', a: 'story.inesKept.a', b: 'story.inesKept.b', aRes: 'story.inesKept.aRes', bRes: 'story.inesKept.bRes', aRecap: 'story.inesKept.aRecap', bRecap: 'story.inesKept.bRecap', lapse: 'story.inesKept.lapse' },
    when: (s, st) => has(st, 'promisedInes') && st.due !== undefined && s.t >= st.due && once(st, 'inesKept') && once(st, 'inesBroken') && hospitalProtected(s, st),
    a: { trust: { okafor: 1, ines: 1 } }, b: { trust: { ines: 2 } }, lapse: { trust: { ines: 1 } },
  },
  {
    id: 'inesBroken', who: 'ines', on: 'plan',
    keys: { title: 'story.inesBroken.title', body: 'story.inesBroken.body', a: 'story.inesBroken.a', b: 'story.inesBroken.b', aRes: 'story.inesBroken.aRes', bRes: 'story.inesBroken.bRes', aRecap: 'story.inesBroken.aRecap', bRecap: 'story.inesBroken.bRecap', lapse: 'story.inesBroken.lapse' },
    when: (s, st) => has(st, 'promisedInes') && st.due !== undefined && s.t >= st.due && once(st, 'inesKept') && once(st, 'inesBroken') && !hospitalProtected(s, st),
    a: { cashM: -0.12, trust: { ines: -1, okafor: -1 } }, b: { trust: { ines: -3, okafor: -1 } }, lapse: { trust: { ines: -3, okafor: -2 } },
  },
  {
    id: 'inesStorm', who: 'ines', on: 'incident',
    keys: { title: 'story.inesStorm.title', body: 'story.inesStorm.body', a: 'story.inesStorm.a', b: 'story.inesStorm.b', aRes: 'story.inesStorm.aRes', bRes: 'story.inesStorm.bRes', aRecap: 'story.inesStorm.aRecap', bRecap: 'story.inesStorm.bRecap', lapse: 'story.inesStorm.lapse' },
    when: (s, st, inc) => !!inc && inc.kind === 'storm' && inc.feederId === st.hospital && s.t >= 2 && once(st, 'inesStorm'),
    a: { cm: 1.1, trust: { ines: 1 } }, b: { cm: 0.9, trust: { ines: -1 } }, lapse: { trust: { ines: -1 } },
  },
  {
    id: 'vanceVeg', who: 'vance', on: 'plan',
    keys: { title: 'story.vanceVeg.title', body: 'story.vanceVeg.body', a: 'story.vanceVeg.a', b: 'story.vanceVeg.b', aRes: 'story.vanceVeg.aRes', bRes: 'story.vanceVeg.bRes', aRecap: 'story.vanceVeg.aRecap', bRecap: 'story.vanceVeg.bRecap', lapse: 'story.vanceVeg.lapse' },
    when: (s, st) => s.t % 4 === 3 && s.t >= 7 && s.t <= 19 && s.vegLevel >= 1 && geoOf(s) !== 'city' && once(st, 'vanceVeg'),
    a: { veg: 0, trust: { vance: 1 }, flag: 'cutVeg' }, b: { trust: { vance: -1 } }, lapse: { trust: { vance: -1 } },
  },
  {
    id: 'tomVillages', who: 'tom', on: 'plan',
    keys: { title: 'story.tomVillages.title', body: 'story.tomVillages.body', a: 'story.tomVillages.a', b: 'story.tomVillages.b', aRes: 'story.tomVillages.aRes', bRes: 'story.tomVillages.bRes', aRecap: 'story.tomVillages.aRecap', bRecap: 'story.tomVillages.bRecap', lapse: 'story.tomVillages.lapse' },
    when: (s, st) => s.t >= 10 && s.t <= 24 && geoOf(s) !== 'city' && once(st, 'tomVillages') && !feederById(s, st.villages)?.hardened,
    a: { cashM: -0.35, hardenVillages: true, trust: { tom: 2, vance: -1 } }, b: { cashM: -0.03, clearVillages: true, trust: { tom: -1 } }, lapse: { trust: { tom: -2 } },
  },
  {
    id: 'tobiApprentices', who: 'tobi', on: 'plan',
    keys: { title: 'story.tobiApprentices.title', body: 'story.tobiApprentices.body', a: 'story.tobiApprentices.a', b: 'story.tobiApprentices.b', aRes: 'story.tobiApprentices.aRes', bRes: 'story.tobiApprentices.bRes', aRecap: 'story.tobiApprentices.aRecap', bRecap: 'story.tobiApprentices.bRecap', lapse: 'story.tobiApprentices.lapse' },
    when: (s, st) => s.t >= 13 && s.t <= 28 && once(st, 'tobiApprentices'),
    a: { cashM: -0.04, crews: 1, trust: { tobi: 2 }, flag: 'apprentices' }, b: { trust: { tobi: -1 } }, lapse: { trust: { tobi: -1 } },
  },
  {
    id: 'okaforPlan', who: 'okafor', on: 'plan',
    keys: { title: 'story.okaforPlan.title', body: 'story.okaforPlan.body', a: 'story.okaforPlan.a', b: 'story.okaforPlan.b', aRes: 'story.okaforPlan.aRes', bRes: 'story.okaforPlan.bRes', aRecap: 'story.okaforPlan.aRecap', bRecap: 'story.okaforPlan.bRecap', lapse: 'story.okaforPlan.lapse' },
    when: (s, st) => s.t % 4 === 0 && s.t >= 4 && !!lastReview(s) && !lastReview(s)!.met && once(st, 'okaforPlan'),
    a: { cashM: -0.08, trust: { okafor: 1 }, flag: 'auditPlan' }, b: { trust: { okafor: -1 } }, lapse: { trust: { okafor: -2 } },
  },
  {
    id: 'vanceDividend', who: 'vance', on: 'plan',
    keys: { title: 'story.vanceDividend.title', body: 'story.vanceDividend.body', a: 'story.vanceDividend.a', b: 'story.vanceDividend.b', aRes: 'story.vanceDividend.aRes', bRes: 'story.vanceDividend.bRes', aRecap: 'story.vanceDividend.aRecap', bRecap: 'story.vanceDividend.bRecap', lapse: 'story.vanceDividend.lapse' },
    when: (s, st) => s.t % 4 === 0 && s.t >= 8 && !!lastReview(s) && lastReview(s)!.met && lastReview(s)!.incentiveM > 0 && s.cash > 0.5 && once(st, 'vanceDividend'),
    a: { cashM: -0.15, trust: { vance: 2 } }, b: { trust: { vance: -1 }, flag: 'reinvested' }, lapse: { trust: { vance: -1 } },
  },
  {
    id: 'evRush', who: 'tom', on: 'plan',
    keys: { title: 'story.evRush.title', body: 'story.evRush.body', a: 'story.evRush.a', b: 'story.evRush.b', aRes: 'story.evRush.aRes', bRes: 'story.evRush.bRes', aRecap: 'story.evRush.aRecap', bRecap: 'story.evRush.bRecap', lapse: 'story.evRush.lapse' },
    when: (s, st) => s.t >= 17 && s.t <= 28 && once(st, 'evRush'),
    a: { cashM: 0.1, load: { on: 'villages', kw: 900, customers: 0 }, trust: { tom: 2 } }, b: { trust: { tom: -1 }, flag: 'evWait' }, lapse: { trust: { tom: -1 } },
  },
  {
    id: 'okaforOpen', who: 'okafor', on: 'plan',
    keys: { title: 'story.okaforOpen.title', body: 'story.okaforOpen.body', a: 'story.okaforOpen.a', b: 'story.okaforOpen.b', aRes: 'story.okaforOpen.aRes', bRes: 'story.okaforOpen.bRes', aRecap: 'story.okaforOpen.aRecap', bRecap: 'story.okaforOpen.bRecap', lapse: 'story.okaforOpen.lapse' },
    when: (s, st) => s.t % 4 === 0 && s.t >= 20 && s.t <= 32 && !!lastReview(s) && lastReview(s)!.met && once(st, 'okaforOpen'),
    a: { cashM: -0.02, trust: { okafor: 2, vance: -1 } }, b: { trust: { okafor: -1, vance: 1 } }, lapse: { trust: { okafor: -1 } },
  },
  {
    id: 'inesWing', who: 'ines', on: 'plan',
    keys: { title: 'story.inesWing.title', body: 'story.inesWing.body', a: 'story.inesWing.a', b: 'story.inesWing.b', aRes: 'story.inesWing.aRes', bRes: 'story.inesWing.bRes', aRecap: 'story.inesWing.aRecap', bRecap: 'story.inesWing.bRecap', lapse: 'story.inesWing.lapse' },
    when: (s, st) => s.t >= 22 && s.t <= 34 && once(st, 'inesWing'),
    a: { cashM: 0.15, load: { on: 'hospital', kw: 1500, customers: 1 }, trust: { ines: 1 } }, b: { trust: { ines: -1 } }, lapse: { trust: { ines: -1 } },
  },
  {
    id: 'tobiRetires', who: 'tobi', on: 'plan',
    keys: { title: 'story.tobiRetires.title', body: 'story.tobiRetires.body', a: 'story.tobiRetires.a', b: 'story.tobiRetires.b', aRes: 'story.tobiRetires.aRes', bRes: 'story.tobiRetires.bRes', aRecap: 'story.tobiRetires.aRecap', bRecap: 'story.tobiRetires.bRecap', lapse: 'story.tobiRetires.lapse' },
    when: (s, st) => s.t >= 33 && s.t <= 38 && once(st, 'tobiRetires'),
    a: { cashM: -0.03, trust: { tobi: 1 } }, b: { trust: { tobi: 1 }, flag: 'tobiGone' }, lapse: { trust: { tobi: -1 }, flag: 'tobiGone' },
  },
  {
    id: 'vanceCrew', who: 'vance', on: 'plan',
    keys: { title: 'story.vanceCrew.title', body: 'story.vanceCrew.body', a: 'story.vanceCrew.a', b: 'story.vanceCrew.b', aRes: 'story.vanceCrew.aRes', bRes: 'story.vanceCrew.bRes', aRecap: 'story.vanceCrew.aRecap', bRecap: 'story.vanceCrew.bRecap', lapse: 'story.vanceCrew.lapse' },
    when: (s, st) => s.t >= 24 && s.t <= 31 && s.crews >= 3 && once(st, 'vanceCrew'),
    a: { crews: -1, cashM: -0.03, trust: { vance: 2, tobi: -2 } }, b: { trust: { vance: -1, tobi: 1 } }, lapse: { trust: { vance: -1 } },
  },
  {
    id: 'cutVegEcho', who: 'tobi', on: 'incident',
    keys: { title: 'story.cutVegEcho.title', body: 'story.cutVegEcho.body', a: 'story.cutVegEcho.a', b: 'story.cutVegEcho.b', aRes: 'story.cutVegEcho.aRes', bRes: 'story.cutVegEcho.bRes', aRecap: 'story.cutVegEcho.aRecap', bRecap: 'story.cutVegEcho.bRecap', lapse: 'story.cutVegEcho.lapse' },
    when: (s, st, inc) => !!inc && inc.kind === 'storm' && has(st, 'cutVeg') && once(st, 'cutVegEcho') && s.t >= firstT(st, 'vanceVeg') + 2 && geoOf(s) !== 'city',
    a: { cashM: -0.06, cm: 0.9, veg: 2, trust: { tobi: 1 } }, b: { trust: { tobi: -1 } }, lapse: { trust: { tobi: -1 } },
  },
  {
    id: 'evReturn', who: 'tom', on: 'plan',
    keys: { title: 'story.evReturn.title', body: 'story.evReturn.body', a: 'story.evReturn.a', b: 'story.evReturn.b', aRes: 'story.evReturn.aRes', bRes: 'story.evReturn.bRes', aRecap: 'story.evReturn.aRecap', bRecap: 'story.evReturn.bRecap', lapse: 'story.evReturn.lapse' },
    when: (s, st) => has(st, 'evWait') && once(st, 'evReturn') && s.t >= firstT(st, 'evRush') + 6,
    a: { cashM: 0.1, load: { on: 'villages', kw: 900, customers: 0 }, trust: { tom: 1 } }, b: { trust: { tom: -2 } }, lapse: { trust: { tom: -1 } },
  },
  {
    id: 'ownersReturn', who: 'vance', on: 'plan',
    keys: { title: 'story.ownersReturn.title', body: 'story.ownersReturn.body', a: 'story.ownersReturn.a', b: 'story.ownersReturn.b', aRes: 'story.ownersReturn.aRes', bRes: 'story.ownersReturn.bRes', aRecap: 'story.ownersReturn.aRecap', bRecap: 'story.ownersReturn.bRecap', lapse: 'story.ownersReturn.lapse' },
    when: (s, st) => has(st, 'reinvested') && once(st, 'ownersReturn') && s.t >= firstT(st, 'vanceDividend') + 8 && s.cash > 0.5,
    a: { cashM: -0.25, trust: { vance: 2 } }, b: { trust: { vance: -2, okafor: 1 } }, lapse: { trust: { vance: -2 } },
  },
  {
    id: 'auditResult', who: 'okafor', on: 'plan',
    keys: { title: 'story.auditResult.title', body: 'story.auditResult.body', a: 'story.auditResult.a', b: 'story.auditResult.b', aRes: 'story.auditResult.aRes', bRes: 'story.auditResult.bRes', aRecap: 'story.auditResult.aRecap', bRecap: 'story.auditResult.bRecap', lapse: 'story.auditResult.lapse' },
    when: (s, st) => has(st, 'auditPlan') && once(st, 'auditResult') && s.t >= firstT(st, 'okaforPlan') + 4 && s.t % 4 === 0,
    a: { cashM: -0.01, trust: { okafor: 2 } }, b: { trust: { okafor: 0 } }, lapse: { trust: { okafor: -1 } },
  },
  {
    id: 'inesHonest', who: 'ines', on: 'plan',
    keys: { title: 'story.inesHonest.title', body: 'story.inesHonest.body', a: 'story.inesHonest.a', b: 'story.inesHonest.b', aRes: 'story.inesHonest.aRes', bRes: 'story.inesHonest.bRes', aRecap: 'story.inesHonest.aRecap', bRecap: 'story.inesHonest.bRecap', lapse: 'story.inesHonest.lapse' },
    when: (s, st) => has(st, 'honestInes') && once(st, 'inesHonest') && s.t >= 10 && hospitalProtected(s, st),
    a: { trust: { ines: 2, okafor: 1 } }, b: { trust: { ines: 1 } }, lapse: { trust: { ines: 1 } },
  },
  {
    id: 'cityDucts', who: 'tom', on: 'plan',
    keys: { title: 'story.cityDucts.title', body: 'story.cityDucts.body', a: 'story.cityDucts.a', b: 'story.cityDucts.b', aRes: 'story.cityDucts.aRes', bRes: 'story.cityDucts.bRes', aRecap: 'story.cityDucts.aRecap', bRecap: 'story.cityDucts.bRecap', lapse: 'story.cityDucts.lapse' },
    when: (s, st) => geoOf(s) === 'city' && once(st, 'cityDucts') && s.t >= 5 && s.t <= 16,
    a: { cashM: -0.15, trust: { tom: 2 }, flag: 'ducts' }, b: { trust: { tom: -2 } }, lapse: { trust: { tom: -1 } },
  },
  {
    id: 'ductsPay', who: 'tobi', on: 'plan',
    keys: { title: 'story.ductsPay.title', body: 'story.ductsPay.body', a: 'story.ductsPay.a', b: 'story.ductsPay.b', aRes: 'story.ductsPay.aRes', bRes: 'story.ductsPay.bRes', aRecap: 'story.ductsPay.aRecap', bRecap: 'story.ductsPay.bRecap', lapse: 'story.ductsPay.lapse' },
    when: (s, st) => has(st, 'ducts') && once(st, 'ductsPay') && s.t >= firstT(st, 'cityDucts') + 8,
    a: { cashM: 0.12, trust: { tobi: 1 } }, b: { cashM: 0.12, trust: { tom: 1 } }, lapse: { cashM: 0.12 },
  },
  {
    id: 'cityHeat', who: 'vance', on: 'plan',
    keys: { title: 'story.cityHeat.title', body: 'story.cityHeat.body', a: 'story.cityHeat.a', b: 'story.cityHeat.b', aRes: 'story.cityHeat.aRes', bRes: 'story.cityHeat.bRes', aRecap: 'story.cityHeat.aRecap', bRecap: 'story.cityHeat.bRecap', lapse: 'story.cityHeat.lapse' },
    when: (s, st) => geoOf(s) === 'city' && once(st, 'cityHeat') && s.t % 4 === 2 && s.t >= 6,
    a: { cashM: -0.05, trust: { vance: -1 } }, b: { flag: 'hotCables', trust: { vance: 1 } }, lapse: { flag: 'hotCables' },
  },
  {
    id: 'moorSnow', who: 'tobi', on: 'incident',
    keys: { title: 'story.moorSnow.title', body: 'story.moorSnow.body', a: 'story.moorSnow.a', b: 'story.moorSnow.b', aRes: 'story.moorSnow.aRes', bRes: 'story.moorSnow.bRes', aRecap: 'story.moorSnow.aRecap', bRecap: 'story.moorSnow.bRecap', lapse: 'story.moorSnow.lapse' },
    when: (s, st, inc) => !!inc && inc.kind === 'storm' && geoOf(s) === 'moor' && s.t % 4 === 0 && once(st, 'moorSnow'),
    a: { cashM: -0.05, cm: 0.75, trust: { tobi: 1 } }, b: { cm: 1.25 }, lapse: { cm: 1.25, trust: { tobi: -1 } },
  },
  {
    id: 'moorTurbine', who: 'tom', on: 'plan',
    keys: { title: 'story.moorTurbine.title', body: 'story.moorTurbine.body', a: 'story.moorTurbine.a', b: 'story.moorTurbine.b', aRes: 'story.moorTurbine.aRes', bRes: 'story.moorTurbine.bRes', aRecap: 'story.moorTurbine.aRecap', bRecap: 'story.moorTurbine.bRecap', lapse: 'story.moorTurbine.lapse' },
    when: (s, st) => geoOf(s) === 'moor' && once(st, 'moorTurbine') && s.t >= 8 && s.t <= 24,
    a: { cashM: 0.05, load: { on: 'villages', kw: -500, customers: 0 }, trust: { tom: 2 } }, b: { trust: { tom: -1 } }, lapse: { trust: { tom: -1 } },
  },
];
const BY_ID = new Map(BEATS.map((b) => [b.id, b]));
export const beatById = (id: string): Beat | undefined => BY_ID.get(id);
const firstT = (st: Story, id: string): number => st.log.find((x) => x.id === id)?.t ?? 1e9;
/** The argument about the weather (okaforPlan b) wins Ms Okafor round only when the year really was weather: exceptional minutes at least a fifth of the year's SAIDI. */
const weatherYear = (s: CareerState): boolean => { const r = lastReview(s); return !!r && r.exceptionalMin >= 0.2 * r.saidi; };

export function newStory(feeders: Feeder[]): Story {
  let hosp = feeders[0]!;
  for (const f of feeders) if (f.customers > hosp.customers) hosp = f;
  const lastP = feeders[feeders.length - 1]!.primaryId, rural = feeders.filter((f) => f.primaryId === lastP && f.id !== hosp.id);
  const vill = rural.length ? rural[rural.length - 1]! : feeders.find((f) => f.id !== hosp.id)!;
  return { trust: { tobi: 0, vance: 0, okafor: 0, ines: 0, tom: 0 }, flags: [], seen: [], hospital: hosp.id, villages: vill.id, open: [], log: [] };
}

/** Open the quarter's plan beat (start of a quarter in plan phase). At most one letter a quarter. */
export function openPlanBeat(s: CareerState): void {
  const st = s.story; if (!st || s.phase !== 'plan' || s.ending) return;
  if (st.open.some((o) => o.t === s.t && !o.inc)) return;
  const b = BEATS.find((x) => x.on === 'plan' && x.when(s, st));
  if (b) { st.open.push({ id: b.id, t: s.t }); st.seen.push(b.id); }
}
/** Open an incident beat for the first incident that has one (incident phase). At most one call a quarter. */
export function openIncidentBeat(s: CareerState): void {
  const st = s.story; if (!st) return;
  if (st.open.some((o) => o.t === s.t && o.inc)) return;
  for (const inc of s.incidents) {
    if (inc.custInt <= 0) continue;
    const b = BEATS.find((x) => x.on === 'incident' && x.when(s, st, inc));
    if (b) { st.open.push({ id: b.id, t: s.t, inc: inc.id, ...(inc.feederId ? { feeder: inc.feederId } : {}) }); st.seen.push(b.id); return; }
  }
}

function apply(s: CareerState, st: Story, e: Effect, o: OpenBeat): void {
  if (e.cashM) s.cash += e.cashM;
  if (e.trust) for (const w of CAST) if (e.trust[w]) st.trust[w] = Math.max(-5, Math.min(5, st.trust[w] + e.trust[w]!));
  if (e.flag && !st.flags.includes(e.flag)) st.flags.push(e.flag);
  if (e.crews) s.crews += e.crews;
  if (e.veg !== undefined) s.vegLevel = e.veg;
  if (e.hardenVillages || e.clearVillages) {
    s.feeders = s.feeders.map((f) => (f.id !== st.villages ? f : { ...f, ...(e.hardenVillages ? { hardened: true } : {}), ...(e.clearVillages ? { veg: 0.05 } : {}) }));
  }
  if (e.load) {
    const fid = e.load.on === 'hospital' ? st.hospital : st.villages, L = e.load;
    s.feeders = s.feeders.map((f) => (f.id !== fid ? f : { ...f, baseKw: f.baseKw + L.kw, customers: f.customers + L.customers }));
  }
  if (e.cm && o.inc) s.incidents = s.incidents.map((i) => (i.id === o.inc ? { ...i, storyCm: (i.storyCm ?? 1) * e.cm! } : i));
}

/** Answer an open beat. */
export function chooseStory(state: CareerState, id: string, opt: string): ActionResult {
  const st0 = state.story;
  if (!st0) return fail(state, 'career.err.noStory');
  const o = st0.open.find((x) => x.id === id);
  const b = beatById(id);
  if (!o || !b) return fail(state, 'career.err.noStory');
  if (opt !== 'a' && opt !== 'b') return fail(state, 'career.err.action');
  if (b.on === 'incident' && state.phase !== 'incident') return fail(state, 'career.err.phase');
  const s: CareerState = { ...state, story: JSON.parse(JSON.stringify(st0)) as Story };
  const st = s.story!;
  let eff = opt === 'a' ? b.a : b.b;
  const weather = id === 'okaforPlan' && opt === 'b' && weatherYear(s);
  if (weather) eff = { trust: { okafor: 1 } };   // the weather argument holds when it is true
  apply(s, st, eff, o);
  if (id === 'inesPromise' && opt === 'a') st.due = s.t + 8;
  st.open = st.open.filter((x) => x !== st.open.find((y) => y.id === id));
  st.log.push({ t: s.t, id, opt: opt as Opt, ...(o.feeder ? { feeder: o.feeder } : {}) });
  return ok(s, weather ? 'story.okaforPlan.bResWeather' : opt === 'a' ? b.keys.aRes : b.keys.bRes, storyParams(s, o));
}

/** Beats left open when the quarter settles lapse: the asker decides alone. */
export function lapseOpen(s: CareerState, kind: 'plan' | 'incident' | 'all'): void {
  const st = s.story; if (!st) return;
  const keep: OpenBeat[] = [];
  for (const o of st.open) {
    const b = beatById(o.id);
    if (!b || (kind !== 'all' && b.on !== kind)) { keep.push(o); continue; }
    apply(s, st, b.lapse, o);
    st.log.push({ t: o.t, id: o.id, opt: 'lapse', ...(o.feeder ? { feeder: o.feeder } : {}) });
  }
  st.open = keep;
}

export function storyParams(s: CareerState, o: { feeder?: string; t: number }): Record<string, string | number> {
  const st = s.story!;
  return { geo: charterOf(s).geo ?? '', hospital: st.hospital, villages: st.villages, feeder: o.feeder ?? st.hospital, year: Math.floor(o.t / 4) + 1, due: st.due !== undefined ? Math.floor(st.due / 4) + 1 : 0 };
}

export type Mood = 'warm' | 'even' | 'cold';
export const moodOf = (n: number): Mood => (n >= 2 ? 'warm' : n <= -2 ? 'cold' : 'even');

/** Where each person ends up, by what they think of you at the end. */
export const EPILOGUE: Record<Who, Record<Mood, string>> = {
  tobi: { warm: 'story.epi.tobi.warm', even: 'story.epi.tobi.even', cold: 'story.epi.tobi.cold' },
  vance: { warm: 'story.epi.vance.warm', even: 'story.epi.vance.even', cold: 'story.epi.vance.cold' },
  okafor: { warm: 'story.epi.okafor.warm', even: 'story.epi.okafor.even', cold: 'story.epi.okafor.cold' },
  ines: { warm: 'story.epi.ines.warm', even: 'story.epi.ines.even', cold: 'story.epi.ines.cold' },
  tom: { warm: 'story.epi.tom.warm', even: 'story.epi.tom.even', cold: 'story.epi.tom.cold' },
};
export const WHO_NAME: Record<Who, string> = { tobi: 'story.who.tobi', vance: 'story.who.vance', okafor: 'story.who.okafor', ines: 'story.who.ines', tom: 'story.who.tom' };

/** Trust with an edge: a crew chief who trusts you gets more out of the crews in a storm (5 % fewer storm customer-minutes), one who does
 * not gets less (5 % more). It ends when Tobi leaves (sent off at Christmas, or a last-winter letter left unanswered). */
export function crewEdge(s: CareerState): number {
  const st = s.story; if (!st || st.flags.includes('tobiGone')) return 1;
  return st.trust.tobi >= 2 ? 0.95 : st.trust.tobi <= -2 ? 1.05 : 1;
}
