// Golden trajectories of the synthetic 10-bus grid (recorded once, M1.10): a quiet day and a day with a unit trip and a storm.
// A refactor must keep them green; a deliberate rule change regenerates them with GOLDEN_UPDATE=1 and says so in the commit.
import { describe, expect, it } from 'vitest';
import { goldenFile, trajectory } from '@core/kit/golden';
import { Engine } from '@core/kit';
import { TEST_GAME } from './testgrid';
import type { GridState } from './types';

describe('10-bus golden trajectories', () => {
  const g = goldenFile(new URL('./__golden__/tenbus.json', import.meta.url).pathname);
  it('a quiet day is unchanged', () => g.check('tenbus-day', trajectory(TEST_GAME, { seed: 1, ticks: 96, persona: 'idle', level: 'TG1' })));
  it('a day with a unit trip and a storm is unchanged', () => g.check('tenbus-trip', trajectory(TEST_GAME, { seed: 1, ticks: 96, persona: 'idle', level: 'TG2' })));
  it('the trip day really has the event window and the storm in it', () => {
    const e = new Engine(TEST_GAME); e.autosave = false; e.act('startLevel', ['TG2', 1]);
    let storm = false, window = false;
    for (let i = 0; i < 70; i++) { e.act('tick'); const s = e.state as GridState; storm ||= s.weather.stormActive; window ||= s.block.eventWindow; }
    expect(storm).toBe(true); expect(window).toBe(true);
  });
});
