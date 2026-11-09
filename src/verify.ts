// Server-side score verification for this game: `verify(levelId, solutionCode, { region? })` replays the code on the real
// deterministic engine and returns { ok, metrics, reason, ticks, ruleset }. Pure (no Node APIs, no clock, no I/O) so the
// cobanana-scores server can import it on Cloudflare Workers or Node. verify.test.ts guards the import graph.
import { makeVerifier } from '@core/kit';
import { GAME } from './game';

export const verify = makeVerifier(GAME);
