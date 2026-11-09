// The game's strings. `t('key', {var})` everywhere a player can read text. Locales: add one to LOCALES (see locales/en.ts).
import { createI18n } from '@core/i18n';
import { en } from './locales/en';

export const LOCALES = { en };
export const i18n = createI18n(LOCALES);
export const t = i18n.t;
