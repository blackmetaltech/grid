// The game definition the core engine runs. Everything the Godot front-end shows comes from queries; every player command
// is an action returning {ok, message} with a teaching message. Add actions/queries here (or split into files as it grows).
import { baseState, fail, log, need, ok, withRng, type GameDef, type System } from '@core/kit';
import { formatMoney, type RegionPack } from '@core/regions';
import { RIG, type TankState } from './state';
import { advance, inflow, outflow, steadyDepth, valveFor } from './sim/hydraulics';
import { LEVELS } from './levels';
import { PERSONAS } from './personas';
import { t } from './i18n';
import { REGIONS } from './regions';
import type { TankRegionData } from './regions/data';

export const GAME_ID = 'grid';

/** A regional string the game needs; a pack that lacks one is a bug in the pack. */
function regionString(p: RegionPack<TankRegionData>, key: string): string {
  const v = p.strings[key]; if (v === undefined) throw new Error(`Region '${p.id}' has no string '${key}'.`);
  return v;
}

const SYSTEMS: System<TankState>[] = [
  { id: 'hydraulics', run: (s) => {
    s.waterUsedM3 = Math.round((s.waterUsedM3 + inflow(s.valve) * RIG.dt) * 1e6) / 1e6;
    s.h = advance(s.h, s.valve, RIG.dt);
    if (s.h > RIG.H) { s.h = RIG.H; s.overflows++; log(s, t('log.overflow', { operator: s.operator, qin: (inflow(s.valve) * 1000).toFixed(1), qout: (outflow(RIG.H) * 1000).toFixed(1) }), 'bad'); }
  } },
  { id: 'band', run: (s) => {
    const inBand = s.h >= s.band[0] && s.h <= s.band[1];
    s.held = inBand ? s.held + 1 : 0;
    s.history.push(Math.round(s.h * 1e4) / 1e4); if (s.history.length > 120) s.history.shift();
  } },
];

export const GAME: GameDef<TankState> = {
  id: GAME_ID,
  title: 'GRID',
  saveVersion: 1,
  /** Game-wide rules version: part of every solution code's ruleset id. Bump when a rule change can change a level score. */
  rulesetVersion: 1,
  regions: REGIONS,
  /** Level scores for leaderboards: the verifier returns these after replaying a solution code. */
  metrics: (s) => ({ ticks: s.tick - s.levelStart, waterUsedM3: s.waterUsedM3 }),
  newGame: (seed, mode, ctx) => {
    const s: TankState = { ...baseState(GAME_ID, seed, mode, ctx.region.id), h: 0, valve: 0, held: 0, band: [1.0, 1.2], holdTicks: 10, history: [], overflows: 0, waterUsedM3: 0,
      site: regionString(ctx.region, 'site'), operator: regionString(ctx.region, 'operator') };
    s.h = withRng(s, (r) => Math.round(r.range(0.2, 0.4) * 1000) / 1000);   // seeded: same seed, same starting depth
    s.history.push(s.h);
    log(s, t('log.start', { site: s.site, h: s.h.toFixed(2), lo: s.band[0], hi: s.band[1] }));
    return s;
  },
  actions: {
    /** Open the supply valve to `pct` percent. */
    setValve: (s, pct: unknown) => {
      need(typeof pct === 'number' && Number.isFinite(pct), t('valve.notNumber'));
      if (pct < 0 || pct > 100) fail(t('valve.range', { pct }));
      s.valve = Math.round(pct * 10) / 1000;
      const hs = steadyDepth(s.valve);
      return ok(t('valve.ok', { pct: pct.toFixed(1), qin: (inflow(s.valve) * 1000).toFixed(2), settle: hs > RIG.H ? t('valve.settle.overflow') : t('valve.settle.depth', { h: hs.toFixed(2) }) }));
    },
  },
  queries: {
    /** Everything the HUD needs about the flows right now. */
    flows: (s) => ({ h: s.h, valve: s.valve, qIn: inflow(s.valve), qOut: outflow(s.h), steady: steadyDepth(s.valve), band: s.band, held: s.held, holdTicks: s.holdTicks, overflows: s.overflows }),
    /** Valve (percent) that would hold a given depth. */
    valveFor: (_s, h: unknown) => Math.round(valveFor(Number(h)) * 1000) / 10,
    history: (s) => s.history,
    /** What the supply water costs at the current opening, formatted for the region (currency, grouping). */
    costPerHour: (s) => {
      const p = REGIONS.get(s.region); const perM3 = p.data.supplyPricePerM3; const m3PerHour = inflow(s.valve) * 3600; const perHour = m3PerHour * perM3;
      return { m3PerHour, perM3, perHour, text: t('cost.line', { price: formatMoney(perM3, p), perHour: formatMoney(perHour, p) }) };
    },
  },
  systems: SYSTEMS,
  catalogues: () => ({ rig: RIG }),
  missions: [
    { id: 'first-valve', title: t('mission.first-valve.title'), hint: t('mission.first-valve.hint'), lesson: t('mission.first-valve.lesson'), done: (s) => s.valve > 0, go: 'controls' },
    { id: 'steady', title: t('mission.steady.title'), hint: t('mission.steady.hint'), lesson: t('mission.steady.lesson'), done: (s) => s.held >= 5, go: 'controls' },
  ],
  concepts: [
    { id: 'torricelli', name: t('concept.torricelli.name'), icon: '💧', what: t('concept.torricelli.what'),
      why: t('concept.torricelli.why'),
      equation: 'q_out = Cd · a · √(2 g h)', simplification: t('concept.torricelli.simplification'), source: 'White, Fluid Mechanics, §6.12', go: 'controls' },
    { id: 'mass-balance', name: t('concept.mass-balance.name'), icon: '⚖', what: t('concept.mass-balance.what'), why: t('concept.mass-balance.why'), equation: 'A dh/dt = q_in − q_out' },
  ],
  levels: LEVELS,
  personas: PERSONAS,
  scenarios: [{ id: 'half-full', title: t('scenario.half-full.title'), description: t('scenario.half-full.description'), seed: 3, horizon: 60, setup: (s) => { s.h = 1.0; s.history = [1.0]; } }],
  invariants: (s) => {
    const v: { rule: string; detail: string }[] = [];
    if (s.h < 0 || s.h > RIG.H + 1e-9) v.push({ rule: 'depth out of the tank', detail: String(s.h) });
    if (s.valve < 0 || s.valve > 1) v.push({ rule: 'valve out of range', detail: String(s.valve) });
    if (s.held < 0) v.push({ rule: 'negative hold counter', detail: String(s.held) });
    return v;
  },
  saveLabel: (s) => t('save.label', { h: s.h.toFixed(2), valve: (s.valve * 100).toFixed(0), tick: s.tick }),
  describe: (s) => `Tick ${s.tick}: depth ${s.h.toFixed(3)} m (band ${s.band[0]}–${s.band[1]} m, held ${s.held}/${s.holdTicks}), valve ${(s.valve * 100).toFixed(1)} %, status ${s.status}.`,
  reward: (_p, n) => -Math.abs(n.h - (n.band[0] + n.band[1]) / 2) * 0.01,
  legalActions: (_s, full) => Array.from({ length: full ? 101 : 11 }, (_, i) => ({ name: 'setValve', args: [full ? i : i * 10] })),
};
