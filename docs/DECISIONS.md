# GRID build decisions (deviations from DESIGN.md / BUILD-PLAN.md, with reasons)

Newest last. Each entry: what, why, where.

1. **Solution codes use core's `CB1` format** (`encodeSolution`/`makeVerifier` from `@core/kit`), not the DESIGN §12.2
   `GRID1.<ruleset>.<level>.<hash>.<varint payload>.<crc>` format. Core landed a shared, tested format (base64url JSON action
   list + CRC-32, carries the ruleset id, never throws on garbage) that `cobanana-scores` already adapts to. GRID adds a
   level-hash check on top (a code made for an older level file is rejected with a teaching message). Size is fine for v0.1
   (L28 ≈ 200 actions ≈ a few kB; core limit 256 kB).
2. **Strings live in `src/locales/en.ts` (core `@core/i18n`)**, not `strings/en/*.json` (DESIGN §8.1/§12.6). Same contract:
   keyed, `{var}` placeholders, region names injected as params, `checkLocales` + a literal-string lint.
3. **`rulesetId` is core's `${game}:${region}@${packVersion}.${gameVersion}`** rather than a hash of the pack data
   (DESIGN §11.2). To keep the §11.3 guarantee ("changing a price changes the ruleset; changing a name does not"), GRID pins
   a hash of each pack's rule-relevant data to its `rulesetVersion` in a test: changing a price without bumping the version
   fails CI; changing `strings` does not touch the hash.
4. **Region packs follow core's layout** `src/regions/<id>/index.ts` (+ `catalogues/*.ts`, `sources.md`) and core's
   `defineRegion`/`RegionRegistry` (core landed the framework; no GRID shim needed).
5. **State field names follow core where they overlap** (M0.2): `ruleset` (BaseState) instead of DESIGN's `rulesetId`;
   no `actionLog` (core's `levelActions` is the source of the solution code); absent values are `null`, never optional or
   `undefined` (save round-trip hashing). `GridState` is in `src/types.ts`.
6. **`packDataHash` ignores provenance** (`source`/`confidence` tags, catalogue `source`/`confidence`) as well as `strings`
   and names: relabelling a value as verified changes no rule and must not invalidate scores. A value change still does.
   Pins live in `src/regions/pins.ts`. The pack schema (`validateGridData`) is strict (unknown keys rejected), which is how
   "no physics constants in packs" is enforced. `standardRangeHz` is an absolute `[low, high]` band (the `in` band is asymmetric).
7. **The draft `in` mentor is "Kavya Rao"** (DESIGN A.1 says "Meera Rao" must be renamed even in `in`; NODE uses "Meera");
   `Meera` stays a leak marker. Global licence titles are "Graduate/Project/Senior/Principal/Chief Engineer" so no pack
   string is a generic substring ("Engineer") that the leak test would find in the other pack's titles.
8. **`global` ships with open `recall` grid-code values** (EU network codes not openable). `releaseGateProblems(GLOBAL)` lists them;
   `regions.test.ts` pins the list, and `RELEASE=1` makes it fatal. M1.8 verifies or relabels them.
5. **L19 reference numbers use the offset dead-zone** (DESIGN §3.6, REVIEW E5). `review/l19/l19_ce.py` defaults to a jump
   ("hard") deadband, which produced the card's 48.94 / 49.59 / 49.67 Hz. With the decided offset dead-zone the reference
   is 48.939 / 49.580 / 49.660 Hz (BESS-alone 200 MW 49.034; shed 345 MW, RoCoF₀, H_sys, S_sys unchanged).
   `tools/oracles/emit_expected.py` now passes `dband="zone"`; the engine matches within 2 mHz (5 mHz where the nadir is a
   slow, flat window end). The lesson gate is unaffected (naive < 49.0 sheds; 13th unit and FFR stay ≥ 49.2 with margin).
