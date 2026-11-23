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
16. **The 1.15 manager and art review: what changed and what is cut (look2, 2026-11-23, Ingrid).** The art director scored the round 3 look 6/10. The manager asked for five things.
    - **Done: the finale card folds.** On the new look it is open while you plan, a slim strip while the day runs (day, time, headline, island state), and "Parts shelf and ticker" opens it again. The player's choice sticks. The phone keeps its own fold.
    - **Cut: moving the parts shelf into the bottom tray.** The tray is shared with chapter 2's route tray; moving the shelf is a tray redesign, not a fix. Folding the card gives the land back during the run. Written here for the next layer.
    - **Partly done: towns from play height.** Far streets now glow by town at night (arteries bright, side streets faint), widened so they stay a line instead of sub-pixel noise, and a warm core disc fades in with distance. Both follow the engine's lit share per town, so a shed or a blackout dims them too. Not done: landmark silhouettes and a house LOD swap. By day a far town is still a pale texture.
    - **Done: relief.** Hills and ridges are drawn about 1.7 times steeper. The scale note now says "hills drawn steeper". Lines and towers follow the ground.
    - **Done: smaller art items.** Roofs are mostly terracotta, with a sky fill so slopes facing away are not black. Stars come out only after dusk. The sea is rougher at night, so the moon path is soft instead of a white slab. Labels under the finale card and under the docked report are not drawn. The report hides the job card, the radio log and the parts tray.
    - **Cut: the jobs clipboard in glass.** The jobs list is shared by every chapter; it stays paper until the other chapters move.
17. **Dagny's 1.15 fun findings go to the next layer (look2, 2026-11-23, Ingrid).** She scored the finale 6/10 (fun 6, clarity 6, tension 4.5, return-tomorrow 4). Her strongest point: the shelf has one real choice, the 2-hour or the 4-hour battery, so "buy the bigger one" wins three lamps without understanding usable energy. All of the fixes below change outcomes or need goldens regenerated, so they wait for the next layer:
    - price the choice so the 4-hour battery and spinning U4 together break the budget;
    - "What to try" gives the draw and the usable window, not the answer;
    - one live call during the run;
    - a three-line Ada note;
    - seed the design comparison with the bot designs.
    Not reproduced: the playtester's dead first click on the finished-job pin. That run was software-rendered at 1 to 3 fps; it is to be checked on a GPU next layer.
18. **DECISIONS 8 applied to the release workflow too (2026-11-23, Ingrid).** The v1.15.0 tag's release run failed on two wall-clock budgets: `src/perf.test.ts`, which release.yml still ran, and the 60 s frequency-window median inside `frequency.test.ts` (108 ms against 60 ms on the runner). Both now run only locally: release.yml excludes the perf files like ci.yml, and CI and the release set `CB_WALLCLOCK_OFF=1`, which skips the frequency median. `pnpm perf` runs all three. No assertion changed. The tag was moved to the fixed commit before anything was published.
19. **The release workflow drops macOS (look3, 2026-11-23, Ingrid).** Releases 1.13 to 1.15 failed in CI at the macOS export: the template archive had no `godot_macos_release.universal` binary for the preset. No one has played a Mac build, and the local releases ship Linux and Windows only. The workflow now exports and packages Linux and Windows, so it can go green and publish by itself. Bring macOS back when someone can play it.
20. **L28: the safe set no longer fits, the island has a cheap honest answer, and two calls are made during the run (look3, 2026-11-23, Mateo).** Answers Dagny's three points in 17.
    - **Budget:** US$53.5M global (was 60M). The 4-hour battery with U4 spun from the start costs US$53.68M and does not fit. `budgetHeadroom` 1.0 and `budgetFigures` 3 (spec, population.ts): the budget is the reference rounded up to three figures. With the default 10 % and two figures it would be US$59M and the safe set would fit again. level.test.ts pins the headroom at 1.0 or more, so the reference always fits.
    - **Live call 1, spin U4 (spinUnit, no engine change):** spinning is priced as fuel for the hours left, so U4 bought at the plan costs US$0.53M and U4 spun at the radio's call (Day 2 03:00) about US$0.35M. The card shows the live price and the budget left, and keeps the button off until it fits. Before 02:30 it does not fit; after about 10:00 a cold CCGT is not back before the Day 3 trip (22 MWh shed); after the Day 2 trip nothing is saved. The shelf will not buy three days of fuel the budget cannot pay, since spun fuel cannot be taken back.
    - **Live call 2, the island's north feeder (shedLoad on Saltmarsh, a third of its load; the school stays on):** the cheap island answer. The 2-hour battery delivers about 74 MWh against the 92 MWh the night draws; with a third of the island off from 23:30 it lasts to 06:00, and 29 MWh count as not served. That only fits the 131 MWh limit if reserve covers the Day 2 trip, so the player trades reserve against the island. Opened at 01:30 it is too late.
    - **Domain fix (types.ts, actions.ts, finale.ts):** the finale closed every shed again at half a feeder per block, including the operator's own order, so a shed could not be held. `shedLoad` now records `shedHold`; the finale closes relay sheds only down to it; the 06:00 repair of the island's feeder closes the island's own feeders with it. With no hold the arithmetic is the same as before. Tested in chf.test.ts.
    - **Stars:** the 2-hour battery with the feeder (from US$29.9M), and the 4-hour battery without reserve (131.0 of 131.2 MWh) each earn two. Three need the 4-hour battery and U4 spun inside the window. Bots: 7 of 300 designs pass (the site list now has the 2-hour battery and a 'live' site of timed calls; reserve option 'gfm4+spin' dropped, it never fit).
    - **Hint:** "What to try" gives the island's draw, the 10-90 % window and the 7 % lost on the way out; it no longer names the size to buy.
    - **`in` pack:** the same headroom rule moves it to US$496M (was 550M); lesson and reference are unchanged and still earn fewer than three and three stars.
    - **Strongest argument against:** the three-star window is about 7 game hours and only US$350k wide, so the top lamp rewards reading the live price more than understanding reserve. A player who spins at the plan, the way the earlier jobs taught, is stopped by the card with no explanation beyond the number. The reply: the price is on the button and falls as the run goes, and the radio calls at the moment the window opens.
21. **Chapter 3 (Mill Town, L07 to L09) is the next chapter in the new look (look3, 2026-11-23, Priya and Ingrid).** All three are grid levels, so towns light and go dark on the player's power flow. They already render through the finale's generated province, so one switch covers the whole chapter; the chapter's phasor and spectrum card is now glass. Chapter 1 would need a metre-scale bench scene (about two sessions) and still would not show a town lit by the grid. Chapter 2 would ship mixed: L04 and L06 are bench levels. Strongest argument against: a new player still meets the classic title and L01 first. Priya asked for a 3D title backdrop if it costs under half a session; it does not fit this layer and is cut to the next one.
22. **What the 1.16 hand play and the round 4 review changed, and what waits for 1.17 (look3, 2026-11-23, Ingrid).**
    - **Taken from three rounds of GPU hand play (a playtester, pad only):**
      - the pad walks the jobs list and the list scrolls;
      - the finale card keeps focus across a purchase;
      - the live-call buttons are updated in place;
      - at 2x or 4x the clock drops to 1x an hour before the lightning;
      - at the lightning the run pauses, says what happened, focuses the north-feeder button and turns the camera to Saltmarsh;
      - the pick cursor shows from the start.
    - **Taken from Sigrid and the manager:**
      - a darker, taller spire and a 140 m works chimney in towns of 14 homes or more;
      - the opening camera on the capital moves in from 5.2 km to 3.6 km;
      - a day palette (pasture, crop, plough) on warped plots;
      - the scale note at the text floor and below the clock;
      - the coast stays east of every town outside the finale;
      - chapter 3 opens on its town.
    - **Open and written down:** an A pressed within about 3 s of a screen or speed change is sometimes dropped on the virtual pad. It is not reproduced or explained; the idle frame cap (30 fps after 3 s idle) is the first suspect. A playtester lost one U4 call to it.
    - **Led into the 1.17 gate:**
      - the mill as a place: a works with chimneys, a yard, a rail siding, and the feeder along a road;
      - towns with irregular outlines that follow roads and rivers;
      - cloud shadows and sky reflection by day;
      - the first impression: either a 3D title and first job, or chapter 1 converted next, decided with Priya;
      - no mill exists in L07 today.
    - **Strongest argument against shipping now (Sigrid):** the landmarks are thin at the default distance, and chapter 3 is a plain with a disc of town. I ship because the gate items are met and these points are named here, not hidden.
23. **1.17 first impression: one island bay in 3D, used as the title and as L01 (look4, 2026-11-23, Priya and Ingrid).**
    - **Title:** the small island bay at dusk, with the hamlet dark and the lighthouse lit. Not the finale province: the title must not promise what the first job lacks.
    - **L01 goes 3D.** It is a bench level (10 m tiles, one hut, one cable), so it needs a metre-scale scene that reads the same bench model as the 2D island. It cannot use the province renderer.
    - **L02 and L03** go 3D only if the scene draws them with no per-level work; otherwise they keep the Classic chip. **P0 stays 2D:** it is off the campaign path, and its trip flashes are drawn in 2D.
    - **The charm moment:** at dusk the ten homes and a porch bulb at the hut light from the engine's voltages, with brightness (V/V0)². A thin cable leaves the homes amber beside a white hut: V = I·R, seen. The bench lumps the ten homes on one node, so no gradient along the row is faked.
    - **Disagreement:** Priya would cut the mill, the town outlines and the cloud shadows to 1.18. The manager put them in 1.17, so they stay in, after L01. If time runs out they are cut in this order: cloud shadows, then outlines, then the mill, and each cut is written here.
    - **Strongest argument against (Priya's own):** the finale already renders, so a province title is nearly free, while the bay is new work that could slip. We choose the bay anyway: one scene used twice.

24. **L28: money below US$53.5M was worth nothing; the third lamp now ignores the shed the operator orders (look4, 2026-11-23, Mateo, for Ingrid).** Dagny scored the 1.16 finale fun 6.5, clarity 6, tension 5, return-tomorrow 4.5.
    - **Cause:** the third lamp needed zero energy not served, so every plan that opens the north feeder (the cheap, understanding plan) was out of it. Only 7 bot designs counted, so star B sat on the dearest passes: A = B = US$53.495M.
    - **Change (engine, with tests):** the track now has `unplannedEnsMWh` and `unplannedEnsPct`: energy not served that the operator did not order. Relay sheds and dark buses count; the shed an operator holds with shedLoad does not. The finale's third-lamp rule and L28's star3 read them. The hard limit (0.1 % of the energy, `maxEnsMWh`) still reads the total.
    - **Targets are derived, not hand-set.** The population regenerates them from the new rule: global A = US$40.05M, B = US$30.03M (in pack: A = US$477.5M, B = US$401.5M). They match what Dagny proposed, so chf.test.ts keeps its 2 % drift check unchanged.
    - **The trade-off she wanted:** the 2-hour battery with U4 spun at the radio's window costs US$29.895M and gets three lamps; the same build with U4 at the plan costs US$30.076M, just over B, and gets two. Call 1 is a decision. The 4-hour plans (US$53.15M to US$53.5M) now get one lamp: they pass and are safe, and money is what they lose.
    - **Reference:** it is now the cheap call plan (it must earn three lamps). The 4-hour plan is kept as `reference4h` and, through the new `budgetAnchors` field, still sets the budget (US$53.5M), so it keeps fitting. `budgetAnchors` applies only in regions without their own build (not `in`).
    - **Text:** the shift report's first line shows the lamps earned and what the next one asks. The lesson says when the shed was the operator's order and does not cost the lamp.
    - **Strongest argument against:** the safe plan (4-hour battery) now earns one lamp, which can read as punishing care. It is the point: safety bought without understanding usable energy should cost lamps, and the report's lesson names why.

25. **Chapter 2 in 3D: the two map levels, L05 and L29; the benches keep the Classic chip (look5, 2026-11-23, Priya and Ingrid).**
    - **Scope:** L05 (The River Line) and L29 (Salt Wind) go 3D. They share the Mainland map, so one pass covers both, and with L30 every map level of chapter 2 is 3D. L04 and L06 are benches (a machine and a textbook line, no map) and keep the Classic chip.
    - **Heroes:** wood and concrete poles, pole transformers, the fenced substation yard at each end, and the river crossing. No lattice towers: chapter 2 runs at 0.42 kV and 11 kV, and lattice belongs to 66 kV and up (owner concern C, proportion). This overrules "lattice towers as the heroes" in the layer brief; the steel-tower crossing in L05 stays the one tall structure.
    - **Art bar:** towns drawn by the province street generator, not square blocks; no stair-stepped coast, estuary or river at the default camera; no rectangular forests; both end yards and the town's low-voltage poles visible before the survey; lit windows when a town has power. Proof: GPU shots and one hand play of each level.
    - **Cut:** 3D for L04 and L06, lattice towers, any new 3D bench. First in line if time remains after the gate: a 3D waterfall behind L04's panels.
    - **Strongest argument against (Priya's own):** a new player meets L04 in Classic straight after a 3D chapter 1, where we most need to hold them. Accepted: a Classic bench reads as a workshop; a Classic map reads as unfinished.

26. **macOS is back in the release workflow, marked untested (2026-11-23, Tomasz, systems; reverses the workflow half of 19).** The macOS export never failed for a missing template: the preset named `res://icon.png`, which GRID does not ship, and Godot then reports `godot_macos_release.universal` as missing. The preset now names `res://icon.svg`; `core/ci/prep-export.sh` fails first, naming any missing `res://` file. One universal `.app` (arm64 + x86_64) with the bundled Node in `Contents/Resources`, signed ad hoc, checked on the GitHub macOS runner (layout, `Info.plist`, both architectures, `codesign --verify`, the packaged headless smoke). Bundle id `tech.blackmetal.grid` (never shipped before, so no installed copy changes). Still true from 19: no one has played a Mac build, so the site and README call it "macOS (untested)".
27. **1.19: the prologue and chapter 2's benches go 3D (look6, 2026-11-24, Ingrid; LOOK2 phase D).**
    - **Scope:** P0 through the 3D province (it is a grid level: one list entry, an opening camera, and thermal stations, which the province did not draw at all). L04 and L06 get a new orbitable bench scene (`world3d/bench3d.gd`): L04 a waterfall powerhouse with the alternator cut away (the engine's pole count, turning) and the village whose bulbs follow its voltage; L06 the town line, its wires glowing with the share lost. The 2D instruments stay, in glass. With this, chapters 1 to 3 and the prologue have no Classic chip.
    - **Carried from CRITIQUE-1.18 (top three):** the Mainland's colour and a town landmark; the mill seen from above; a hand play of L05 and L29 from a prepared save.
    - **Prologue honesty:** before the first block the engine has not solved the grid, so the city drew dark although the story opens on a running grid. Until the first solve the city now draws lit and its label gives only the name (as every unsolved grid does); the first block's solve gives the numbers.
    - **1.20 is chapter 4** (L10 to L13, four benches with their own stages). Chapters 5 to 8 follow in that order.
    - **Strongest argument against (mine):** the bench scenes are new code where the province is shared and tested; a weak bench scene could pull the art score down. Accepted: a Classic chip in chapter 2 is the owner's exact complaint ("the game has not been finished yet").
28. **text_flow's minimum went down once, then up (look6, 2026-11-24, Ingrid; accepted by the coordinator).** 06b290f moved it 5299 -> 5295: the four checks were the job board's "Classic" chips for P0, L04 and L06 at two sizes, which no longer exist (A/B on the Jobs screen: 70 now, 72 with the L04/L06 chip rule reverted, 74 with P0 classic too). The coordinator accepted it on the condition that the new 3D bench screens are audited. ad2f03b does that: text_flow builds Bench3D in its headless tree and audits L04 and L06 in 3D at 1920x1080 and 1280x800, and the minimum is now 5347, above where it started. Rule kept: minimums otherwise only move up.
29. **The prediction counts once, for the design that runs (look6, 2026-11-24, Ingrid; a rules change).** Dagny (fun pass, 1.19) re-predicted 600 kW on L06 after the game had shown 600 kW, and got the "predictions within 2 %" lamp; on L04 a prediction made for one winding earned the lamp for another. Kofi traced it to the engine: `predict` (src/actions.ts) replaced any earlier prediction, and the L04 lamp compared the last prediction with whatever design ran. Decided: (a) on benches flagged `predictOnce` (L04, L06), a second prediction for the same design is refused; (b) the prediction stores a design key (L04: poles, turns, field, area; L06: none), and the lamp counts only when the running design matches it, otherwise the coach asks for a new prediction. With e0 hidden and the scope a neutral colour until you predict, predicting the 325 V target earns the lamp only if your winding truly gives it, which you must compute. Scores rulesVersion goes to 1.19.0; replays made under 1.18.1 rules score under those rules. **Strongest argument against (Kofi):** it is a rules change late in a release, and it moves replays. Accepted: a lamp that can be had by reading the answer is the owner's concern I (logic integrity), and the release does not ship with it.
