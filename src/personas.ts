// Scripted players for playtests, soak runs and title-screen demos. They drive the real engine through Env.step.
import type { PersonaFactory } from '@core/kit';
import type { TankState } from './state';
import { valveFor } from './sim/hydraulics';

export const PERSONAS: Record<string, PersonaFactory<TankState>> = {
  /** Knows Torricelli: full flow to the band, then the balancing opening. */
  expert: () => (s) => {
    const mid = (s.band[0] + s.band[1]) / 2;
    const want = s.h < mid - 0.05 ? 100 : Math.round(valveFor(mid) * 1000) / 10;
    return Math.abs(want - s.valve * 100) > 0.05 ? [{ name: 'setValve', args: [want] }] : [];
  },
  /** Does nothing: the tank drains. */
  idle: () => () => [],
  /** Turns the valve at random now and then. */
  random: () => (_s, ctx) => (ctx.rng.chance(0.3) ? [ctx.rng.pick(ctx.legal().filter((a) => a.name !== 'tick'))] : []),
};
