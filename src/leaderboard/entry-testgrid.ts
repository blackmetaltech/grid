// Test-only bundle entry: the same verifier over the synthetic 10-bus levels (TG1/TG2), for the bundle-parity test.
import { makeGridVerifier } from './verify';
import { TEST_GAME } from '../testgrid';

export const verify = makeGridVerifier(TEST_GAME);
export const wrapSolution = verify.wrap;
