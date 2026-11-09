// Every player-facing string of the game, keyed. `{name}` marks a variable. Regional names (region, places, cast…) are NOT here:
// they come from the region pack's `strings` and are passed in as variables. Add a locale by copying this file (es.ts, hi.ts…)
// and registering it in ../i18n.ts; `checkLocales` (see locales.test.ts) fails when a key or a placeholder is missing.
export const en: Record<string, string> = {
  // actions
  'speed.notNumber': 'The clock speed must be a number: 0 (paused), 0.5, 1, 2 or 4.',
  'speed.invalid': 'The clock runs at 0 (paused), 0.5, 1, 2 or 4 times real time; {speed} is not one of them.',
  'speed.paused': 'Clock paused.',
  'speed.ok': 'Clock speed {speed}x: one 15-minute block every {sec} s.',
  // log lines
  'log.start': '{region}: the grid is empty. System frequency {f0} Hz, grid code: {code}. Place a bus to begin.',
  // saves
  'save.label': '{region} · day {day} · {buses} buses',
  // levels (placeholders until M2 authors the real campaign)
  'level.T00.title': 'Placeholder: speed the clock up',
  'level.T00.brief': 'Placeholder until the real first level exists. Set the clock to 4x and let 8 blocks (2 hours) pass.',
  'level.T00.late': 'Block 8 passed and the clock was not running at 4x.',
};
