// String keys the game builds at run time (`level.lost.ch7.${kind}`, `ch7.mode.${mode}`), listed literally so the locale test can see
// they are used and a typo in a kind shows up here. Keep in step with src/sim/ch7/study.ts (Ch7Fail) and src/sim/ch7/merit.ts (DispatchMode).
export const DYNAMIC_KEYS = [
  'level.lost.ch7.breakerFail', 'level.lost.ch7.miscoordination', 'level.lost.ch7.nuisance', 'level.lost.ch7.blind', 'level.lost.ch7.conductorBurnt',
  'level.lost.ch7.outOfStep', 'level.lost.ch7.congestion', 'level.lost.ch7.imbalance', 'level.lost.ch7.dispatch',
  'level.lost.ch8.voltageLow', 'level.lost.ch8.voltageHigh', 'level.lost.ch8.overload', 'level.lost.ch8.pvShort', 'level.lost.ch8.reliability', 'level.lost.ch8.miscoordination', 'level.lost.ch8.fuseBlown',   // chapter 8 (src/sim/ch8/study.ts Ch8Fail)
  'level.lost.ch8.fuseLoad', 'level.lost.ch8.blind', 'level.lost.ch8.nuisance', 'level.lost.ch8.overheat', 'level.lost.ch8.notRestored', 'level.lost.ch8.noPrediction',
  'level.L07.tryNight', 'level.L08.lessonDetuned', 'level.L09.lessonNone',   // chapter 3's lesson and hint variants (src/level/ch3-queries.ts picks them by suffix)
  'ch7.mode.merit', 'ch7.mode.lambda', 'ch7.mode.corridor', 'ch7.mode.merit.ok', 'ch7.mode.lambda.ok', 'ch7.mode.corridor.ok',
] as const;
