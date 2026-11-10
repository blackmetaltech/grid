// Entry of the server bundle `dist/verify.mjs` (scripts/build-verify.mjs): the game's pure verifier and the code helpers.
import { GAME } from '../game';
import { makeGridVerifier } from './verify';

const v = makeGridVerifier(GAME);
export const verify = v;
export const levelHash = v.levelHash;
export const wrapSolution = v.wrap;
export const levelIds = (): string[] => (GAME.levels ?? []).map((l) => l.id);
export { parseGridCode } from './verify';
