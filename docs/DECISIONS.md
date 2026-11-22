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
9. **L19 reference numbers use the offset dead-zone** (DESIGN §3.6, REVIEW E5). `review/l19/l19_ce.py` defaults to a jump
   ("hard") deadband, which produced the card's 48.94 / 49.59 / 49.67 Hz. With the decided offset dead-zone the reference
   is 48.939 / 49.580 / 49.660 Hz (BESS-alone 200 MW 49.034; shed 345 MW, RoCoF₀, H_sys, S_sys unchanged).
   `tools/oracles/emit_expected.py` now passes `dband="zone"`; the engine matches within 2 mHz (5 mHz where the nadir is a
   slow, flat window end). The lesson gate is unaffected (naive < 49.0 sheds; 13th unit and FFR stay ≥ 49.2 with margin).
10. **L17 reference numbers: line-charging sign fixed (resolved).** `review/l17_catalogue.py` had added the pi shunt with the wrong
    sign; fixed in both copies (and emit_expected.py / l17.py), expected.json regenerated: none 274.32, caps 80 MVAr 300.04,
    STATCOM100 325.67, STATCOM200 379.32, both circuits 473.03 MW (engine matches within 0.05 MW, no sign flip in tests).
    The L17 trip load is re-tuned to **308 MW** (`levels.L17.tripLoad_MW`): caps-only fails by 2.6 %, STATCOM100 passes by 5.7 %,
    STATCOM200 and the no-N-1 case pass, doing nothing fails. Lesson-gate test in src/sim/loadflow/continuation.test.ts.
    DESIGN section 3 L17 card (285 -> 300 MW, old table) still shows the old numbers; update it at L17 authoring (M3).
11. **PS-22 outer iterations:** DESIGN says 3 ED↔LF outer iterations; with 3, PS-22 is within 0.2 %; the oracle test runs 8
    and meets 1e-4. Play keeps 3 (good enough for penalty factors); revisit if Engineer-mode cost targets need it.
12. **M1.10 systems pipeline (src/sim/tick.ts) deviations from DESIGN 8.3 / the handoff design.**
    - `buildPipeline(getParams)` takes plain `SimParams` (src/sim/params.ts); `src/catalogue.ts` is the only place a pack meets the
      sim (`simParamsOf`, `catalogueViewOf`). Branch r/x/bc/gc/tap limits, unit limits, cost curve, ramp and timers are copied onto
      the records by `sim/build.ts` at placement, so the pipeline never reads a catalogue.
    - Per-system RNG: `systemRng(seed, day, block, systemId)` (`sim/rngs.ts`); the systems ignore the shared core stream, so `state.rng`
      never advances in a tick. Only `weather` and `blockFrequency` (forecast-error noise, 0.2 % of demand) draw numbers today.
    - **Block model simplifications:** controls act on the previous block's solution (one-block lag, as real tap changers do); queued
      operator actions are not queued (actions apply between ticks, which is equivalent); UVLS is only the block-level UFLS stages
      plus the cascade's motor-stall rule inside event windows (no UVLS in the block model); PSP is not dispatched (storage
      module only for BESS); a `fault` event is modelled as the permanent trip of the faulted branch, or of every branch at a faulted
      bus (short-circuit duty/breaker failure from `protection/` is not used until relays and breakers are placed by levels, M2).
    - **Frequency in the block model:** imbalance = shortfall (or unabsorbed surplus) + noise goes through `blockFrequency`; UFLS stages
      shed persistent `shedFrac` on the stage's loads (or on non-critical loads); energy not served = persistent sheds plus load on
      de-energised buses, priced at VOLL. The load-flow slack picks up losses and the imbalance and its P is written back.
    - **Commitment:** priority list + reserve (largest unit) with a minimum-generation rule: while committed minimum outputs exceed the
      demand and the rest still covers it, the dearest unit is dropped (reserve gives way to physics: there is no export in the model).
      Look-ahead = the slowest offline start time. `commit.schedule` per block: 1 on, 0 off, -1 follow auto.
    - `state.solution` is empty (null) on a grid with no buses (an existing M0 test requires it). Flows are memoised in a WeakMap keyed by
      `state.solution` (`sim/solved.ts`); a query on a cloned/loaded state recomputes them warm-started from the stored V and theta.
    - Finite guard: `findNonFinite` runs in `GAME.invariants` (every tick of every persona/monkey run) and P24 checks every query.
    - `Branch.timer` is `{secLeft, frac, belowS}` (the overload accumulator persists across blocks); `CloudBlob` carries its drift;
      `Weather.stormLeft`; new state fields `rules` (set by `Level.setup`), `block` (last block summary incl. verdict) and `actionLog`
      (DECISIONS #5 said no actionLog; core's `levelActions` still feeds the solution code, `actionLog` is the HUD/explain list).
    - Level verdicts: `levelRules` stores the verdict in `state.block`; `ruleGoal`/`ruleFail` (src/rules.ts) are what a Level's
      `goal`/`fail` call, so core sets won/lost and runs `onLevelEnd` + autosave; no system sets `status`.
    - **Goldens regenerated deliberately, once:** `idle-1`, `random-2`, `level-T00` in `src/__golden__/trajectories.json` (new state
      fields change every hash); new `src/__golden__/tenbus.json` (quiet day, trip+storm day) recorded on the synthetic 10-bus grid.
    - `GAME.rulesetVersion` NOT bumped (no real level exists yet); bump it when M2 levels are authored on this pipeline.
    - `src/locales.test.ts` "every key is used" now scans all game sources (it only read game.ts and levels.ts, which cannot hold
      the keys of the new modules); same strictness. Two comments in `sim/network/{types,transformer}.ts` were reworded because
      `verify.test.ts`'s import scanner read the word "from" in quotes as an import once game.ts reached those files.
13. **M1.11 verify + M1.12 perf (src/leaderboard/**, src/perf.test.ts).**
    - Wire format: the player-facing code is `GRID1.<levelId>.<levelHash8>.<CB1 code>.<crc8>` (a thin envelope over core's `CB1`, #1;
      the CB1 body already carries ruleset id, seed, mode, actions). DESIGN 12.2's varint payload and frozen action table are NOT
      built: the JSON action list is compact enough (limits 256 KB / 20 000 actions) and a table would need a version bump per action.
      `levelHash8` = hash of the level's initial state after `startLevel` (setup, rules, grid) + ruleset id + `rulesetVersion`; it does
      not see `goal`/`fail` code (functions), so a verdict-only change must bump `GAME.rulesetVersion`.
    - `makeGridVerifier(def)` (src/leaderboard/verify.ts) returns DESIGN 12.3's `{ok,metrics,stars,rulesetId,levelHash,ticks}` or
      `{ok:false,error,detail}` with the 8 error kinds; never throws (a throwing `opts.budget` still propagates). Metrics: `ticks, cost,
      capex, opex, ensMWh, lossesMWh, stars` (`lossesPct` of the DESIGN list is omitted: no generated-energy total is kept; the
      level-specific primary metric arrives with the M2 levels). `src/verify.ts` (plain core verifier) is unchanged.
    - `dist/verify.mjs`: `pnpm build:verify` (esbuild via vite's copy, ES2022, neutral platform, no externals), 180 KB at M1; the
      test rebuilds it and checks size, no `node:`/imports, and bit-equality with in-process for T00 and the 10-bus level.
    - Perf (desktop, shared box, best of 3 medians; CB_PERF=1 prints): LF warm 0.2 ms (3), block 2.0 ms (5), day 180 ms (400), event
      window 6 ms (20), cascade x10 21 ms (80), N-1 x90 142 ms (400), fault column 0.3 ms (2), worst cascade window 26 ms (100).
      No deviation. A late day of a 7-day run costs ~250 ms (history ring grows the per-action state clone), still in budget.
    - Nightly fuzz: `pnpm fuzz:nightly` (`GRID_FUZZ_N`, default 50 000) runs every P1..P25 file once.
13. **M2.1/M2.2 level framework and levels P0, L01, L02, L03, L07 (src/level/).** A level is a `GridLevelSpec` (site list, allowed parts,
    pack-symbol thresholds, naive/lesson/reference builds, frozen targets per region, coach step ids); `makeLevel` turns it into a core
    `Level`, `allowedGate` enforces the part list on the actions. T00 stays as the clock fixture (not in the campaign).
    - **State changed, goldens regenerated deliberately (once):** `Load.shape`, `Shunt.catalogId`, `Metrics.track` (named level measurements),
      `Rules.starBasis/star3`, `GridState.bench` change every hash: `src/__golden__/trajectories.json` and `tenbus.json` regenerated. Physics and
      the 16-system pipeline are unchanged (the bench is solved inside `levelRules`). `GAME.rulesetVersion` NOT bumped (the leaderboard worker's
      tests pin `grid:global@2.1`); bump it with them.
    - **Stars:** primary metric is the build cost (`budget.spent`). A = median of the passing designs, B = 15th percentile of the passing designs
      that also meet the third-star conditions (else B could be below the cheapest 3-star design); both frozen per region from the exhaustive
      bot population (`population.ts`) and pinned by `level.test.ts` (drift > 2 % fails). Budget = 1.1 x the dearer of lesson and reference,
      never under 1.3 x the cheapest pass, rounded up to 2 figures (L01 global US$4,000 = the design intent).
    - **Lesson builds are thicker than DESIGN's** so the 2 % margin rule holds: L01 25 mm2 @ 300 m has 1.85 % margin (35 mm2 @ 300 m: 4.3 %);
      DESIGN's builds are oracles G-02 and still pass (tested). L01 ref = 25 mm2 @ 120 m.
    - **L02 geometry tuned (hamlet 2 is 250 m from the hut, not 450 m):** at 48 V, 14 homes at 450 m cannot be fed with any catalogue
      cable (best 43.6 V radial, no trunk passes); at 250 m both a radial and a trunk layout pass at different costs, as intended.
      The optional second hut is not offered (no price in any pack).
    - **L07 star conditions changed:** power factor is the daily billing pf (kWh over kVAh, |Q| counted both ways) >= 0.95, not "every block":
      controls act with a one-block lag (decision 12), so a switched bank always has one bad block at the mill start. Losses <= 6 % instead of
      4 %: on 4 km of Weasel the best daily loss is 5.7 % (3.8 % only with the Rabbit reconductor, which costs 480,000 US$ against 13,500 for the
      900 kVAr bank, so it is over budget in `global`; in `in` it fits). Ref = 4 x 300 kVAr automatic bank, band 0.975-1.005 pu.
    - Mill shape (06:00-22:00, lunch 13:00-14:00 at 0.15 MW / 0.9 MVAr) is `Load.shape`; both loads are constant P and Q like the oracle.
    - P0 runs on a small 5-bus version of the province (the 26-bus finale grid is M3): closing T5 re-routes the coal pocket through the weak
      corridor, T4 trips on its timer and the real cascade ends in the blackout; it is a scene (no stars, `won` = the blackout), and the core
      "random play wins" probe is expected to fire for it when given the whole site list.
14. **L28 finale: a parts shelf that names no answer, and a budget that forces a choice (look2, 2026-11-23).** The fun critic scored the finale
    5.5/10: the build kit listed the five moves of the reference as one-click buttons and the coach said which to press, so the game played
    itself; and the US$70M budget let the player buy a reactor, a second fix and the spare unit on top of the answer.
    - **Card:** the kit is now a shelf of ten parts under the three threats (voltage: taps, capacitor bank, STATCOM, Redhill reactor; reserve:
      spin U4, four grid-forming packs; the island: second causeway line, Eastgate feeder, 2-hour and 4-hour batteries), each priced by the
      engine (`actionCost`), none marked right, skipped or "not needed". A second press takes a part back (the engine's demolish refunds it);
      the spun unit's fuel is not returned. The coach and the try hints describe the threat and the physics, not a button.
    - **Budget:** `budgetOverCheapest` (spec, default 1.3 = DESIGN 9.4 item 6) is 1.1 on L28, so the global budget is US$60M (10 % over the
      reference, US$53.7M). Of the 80 bot designs four pass within it: taps and capacitors, a 4-hour battery or a second causeway line, with or
      without the spun unit. A reactor, a STATCOM, any grid-forming pack, the Eastgate feeder or both island paths each break it (chf.test.ts).
      The cheapest passing plan is US$53.1M (taps, bank, 4-hour battery, no reserve: 131.0 MWh shed of 131.2 allowed). The 2-hour battery
      (US$27.2M) fits and runs dry at night: the trap is honest physics (100 MWh nameplate, about 74 usable, 92 needed). level.test.ts pins the
      floor at >= 1.1 for every level so it cannot be used to make a level impossible. The `in` pack keeps its numbers (its own lesson, the old one).
    - **Lesson build** is now the cheapest pass (no reserve: two stars); the reference adds the spun unit (no shed: three stars); the second
      line with the spun unit earns one star (it costs more than the battery sized for the night).
    - **Star 3 for the bot population** now lists `ensPct <= 0`, the engine's own third-star rule (event.ts: `ensMWh === 0`). Without it the
      population counted the lesson's shed pass as a three-star design and star B fell under the reference. Physics unchanged.
    - **Refund bug fixed (src/actions.ts):** demolish refunded every purchase whose key was not a live element id, and a spun unit is kept as
      `spin:<id>`: taking back any part refunded the spin's fuel too. Now `spin:<id>` stays paid while the unit stands (chf.test.ts).
    - Frozen targets regenerated in their own commit: global budget 70,000,000 -> 60,000,000, A 59,723,209 -> 54,735,709, B 53,781,955 ->
      54,072,857; `in` unchanged.
15. **The first chapter in the new look is chapter 9, the finale (look2, 2026-11-23).** Priya (product) and Ingrid (lead) decided this. L28 was
    already in 3D, and it has the payoff that sells the game: a province lighting up street by street. Chapter 1 would need a new small-scale
    scene, one or two more sessions, for the smallest moment in the game. Strongest argument against: a new player's first ten minutes (L01)
    are still 2D. To answer that:
    - the jobs list opens with "See the finale in the new look", open in every mode, including Learner before the earlier jobs are passed;
    - every job and the Career still in 2D carry a small "Classic" chip with a tooltip;
    - the site and README say plainly that the finale is in the new look and the rest is classic.
    L30 (chapter 2) also renders in 3D from the phase A slice.
