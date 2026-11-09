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
