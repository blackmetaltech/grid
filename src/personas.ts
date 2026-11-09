// Scripted players for playtests, soak runs and title-screen demos. They drive the real engine through Env.step.
import type { PersonaFactory } from '@core/kit';
import type { GridState } from './types';

export const PERSONAS: Record<string, PersonaFactory<GridState>> = {
  /** Does nothing: the clock runs and the empty grid sits there. */
  idle: () => () => [],
  /** Changes the clock speed at random now and then. */
  random: () => (_s, ctx) => (ctx.rng.chance(0.3) ? [ctx.rng.pick(ctx.legal().filter((a) => a.name !== 'tick'))] : []),
};
