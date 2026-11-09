// All player-facing text is externalised: locales are complete, and the game never asks for a missing key or variable.
import { describe, expect, it } from 'vitest';
import { checkLocales } from '@core/i18n';
import { Engine, Env } from '@core/kit';
import { GAME } from './game';
import { LOCALES, i18n } from './i18n';
import { en } from './locales/en';
import { REGIONS } from './regions';

describe('locales', () => {
  it('every locale has every key of en with the same placeholders', () => {
    expect(checkLocales(LOCALES, 'en')).toEqual({ missing: [], extra: [], badPlaceholders: [] });
  });
  it('en has no empty strings and no hard-coded currency symbols', () => {
    for (const [k, v] of Object.entries(en)) { expect(v.trim(), k).not.toBe(''); for (const p of REGIONS.list({ includeDrafts: true })) expect(v, k).not.toContain(p.currency.symbol); }
  });
  it('an expert run (and every action and query) asks for no missing key or variable', () => {
    i18n.clearMissing();
    for (const region of REGIONS.ids()) {
      const env = new Env(GAME); env.reset({ seed: 1, level: 'steady', region });
      env.engine.act('setValve', [150]); env.engine.act('setValve', ['x']); env.engine.act('setValve', [63]);
      for (let i = 0; i < 40 && env.state.status === 'playing'; i++) env.step({ name: 'tick' });
      env.engine.act('setValve', [100]); for (let i = 0; i < 150; i++) env.step({ name: 'tick' });   // overflow log
      env.engine.q('costPerHour'); env.engine.init(); env.engine.act('save', ['main']); env.engine.saves.list();
    }
    new Engine(GAME).act('newGame', [1]);
    expect(i18n.missingKeys()).toEqual([]); expect(i18n.missingVars()).toEqual([]);
  });
  it('every key in en is used somewhere in the game source', async () => {
    const { readFileSync } = await import('node:fs'); const { fileURLToPath } = await import('node:url');
    const src = ['game.ts', 'levels.ts'].map((f) => readFileSync(fileURLToPath(new URL('./' + f, import.meta.url)), 'utf8')).join('\n');
    const unused = Object.keys(en).filter((k) => !src.includes(`'${k}'`) && !(/^(mission|concept|scenario)\./.test(k) && src.includes('`' + k.split('.').slice(0, 2).join('.'))));
    expect(unused).toEqual([]);
  });
});
