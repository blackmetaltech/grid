// Regression: the L07 substation stand-in had a 9 MW minimum-stable floor, so a 0.3 MW night load looked like an 8.7 MW surplus and the block frequency
// ran away (217 Hz in the HUD dial, > 1 kHz later). A bench level must hold the pack's f0.
import { describe, expect, it } from 'vitest';
import { Engine } from '@core/kit';
import { GAME } from '../game';
import { LEVEL_SPECS } from '.';
import type { GridState } from '../types';

describe('bench levels hold nominal frequency', () => {
  for (const id of Object.keys(LEVEL_SPECS)) {
    it(`${id}: f stays within 0.5 Hz of f0 through a day`, () => {
      const e = new Engine<GridState>(GAME); e.act('startLevel', [id, 1, 'learner']);
      for (let b = 0; b < 96; b++) { e.act('tick', [1]); const d = e.q('dial') as { fHz: number; f0: number }; expect(Math.abs(d.fHz - d.f0)).toBeLessThan(0.5); }
    });
  }
});
