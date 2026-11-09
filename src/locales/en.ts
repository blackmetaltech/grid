// Every player-facing string of the game, keyed. `{name}` marks a variable. Regional names (site, operator…) are NOT here:
// they come from the region pack's `strings` and are passed in as variables. Add a locale by copying this file (es.ts, hi.ts…)
// and registering it in ../i18n.ts; `checkLocales` (see locales.test.ts) fails when a key or a placeholder is missing.
export const en: Record<string, string> = {
  // actions
  'valve.notNumber': 'Valve opening must be a number of percent (0–100).',
  'valve.range': 'A valve opens from 0 % (shut) to 100 % (fully open); {pct} % is not possible.',
  'valve.ok': 'Valve {pct} %: inflow {qin} L/s, the tank will settle near {settle}.',
  'valve.settle.overflow': 'overflow',
  'valve.settle.depth': '{h} m',
  // log lines
  'log.start': '{site}: tank at {h} m. Hold the depth between {lo} and {hi} m.',
  'log.overflow': '{operator} reports: the tank overflowed. Inflow {qin} L/s is more than the orifice can pass at the brim ({qout} L/s).',
  // queries
  'cost.line': 'Supply water costs {price} per m³: {perHour} per hour at this opening.',
  'save.label': 'Tank {h} m · valve {valve} % · tick {tick}',
  // missions
  'mission.first-valve.title': 'Open the valve',
  'mission.first-valve.hint': 'Set the valve to any opening.',
  'mission.first-valve.lesson': 'Inflow is proportional to the valve opening.',
  'mission.steady.title': 'Hold it steady',
  'mission.steady.hint': 'Keep the depth in the band for 5 ticks.',
  'mission.steady.lesson': 'At steady state inflow equals outflow: q_in = Cd·a·√(2gh).',
  // codex
  'concept.torricelli.name': "Torricelli's law",
  'concept.torricelli.what': 'Water leaves an orifice at speed √(2gh): the deeper the tank, the faster it drains.',
  'concept.torricelli.why': 'The outflow grows with the square root of depth, so a fixed inflow always finds one depth where the two balance.',
  'concept.torricelli.simplification': 'Quasi-steady flow; Cd constant at 0.61 (sharp-edged orifice); no inlet losses.',
  'concept.mass-balance.name': 'Mass balance',
  'concept.mass-balance.what': 'What flows in minus what flows out is what accumulates.',
  'concept.mass-balance.why': 'A · dh/dt = q_in − q_out: the tank level is the integral of the imbalance.',
  // scenarios
  'scenario.half-full.title': 'Half full',
  'scenario.half-full.description': 'Start at 1.0 m with the valve shut.',
  // levels
  'level.steady.title': 'Steady level',
  'level.steady.brief': 'Hold the water between 1.0 and 1.2 m for 10 ticks. Valve presets in steps of 10 % will not do it: work out the opening.',
  'level.steady.overflow': 'The tank overflowed. Outflow only grows with √h, so a big inflow wins in the end.',
};
