# GRID build plan (v0.1 = puzzle campaign + sandbox, `global` region pack)

**For:** the GRID build director (Opus), who executes this plan with Sonnet and Haiku workers.

**Inputs:**
- `DESIGN.md` (the reviewed design; section numbers below refer to it)
- `REVIEW.md`
- PROGRAM.md (the contract and user decisions 1-5)
- `cobanana-core/CORE.md`
- the GIGAWATT skill and its `references/`

**Rules for every task:**
- **Tests come first.** Any rule module starts with its oracle or property test.
- **Workers do not commit.** The director reviews each diff, audits the physics and units, then commits (small commits, ending with the Co-Authored-By line).
- **No test is weakened.** Goldens are regenerated only for a deliberate rule change, and the commit says so.
- **Rule code uses `dmath`.** Never `Math.sin` or `**`.
- **No literal player-facing strings.** They go in the string tables.
- **Nothing regional lives outside `src/regions/`.**
- **Only GRID's shared resources.** Displays `:200-:219`, port 47901. Use `flock` for the phone and pad.

**Model choice:**
- **sonnet:** implementation, physics, serious testing, level authoring, Godot.
- **haiku:** bulk data entry, string extraction, screenshot sweeps, monkey runs, and checks that only verify the work did happen.

## Dependencies on cobanana-core (check at M0; block or shim)

| Need | Status (2026-11-10) | If missing |
|---|---|---|
| `dmath`, real and complex LU, damped Newton, RK4, bisection/Brent | present | — |
| Engine/GameDef, Level, personas, solvability, golden, env, bridge, persistence | present | — |
| Region-pack framework: loader, schema, formatting, leak-test helper | only a `region-engine.test.ts` stub | GRID builds `src/regions/loader.ts` behind core's interface. Swap it in when core lands |
| String tables + `{message,key,params}` convention; Godot locale helper | unknown | GRID-local `strings/` + a lint test; upstream later |
| HTTP/score client helper (Godot) for `cobanana-scores` | unknown | GRID-local `leaderboard.gd`, kept thin |
| `cobanana-scores` server | separate repo | GRID ships `verify.mjs` + `levels.json` + contract tests. It only needs the server for an end-to-end smoke in M4 |

## M0. Scaffold (1 director session + 3 worker tasks)

| # | Task | Model | Files | Tests first | Acceptance |
|---|---|---|---|---|---|
| 0.1 | Run `cobanana-core/scaffold/new-game.sh grid GRID in.ixaxaar.cobanana.grid 47901`; `qa.env` with display base 200 | director | repo | core template tests | `pnpm typecheck && pnpm test` green; `CB_SMOKE=1` prints `SMOKE OK`; debug APK boots on the Pixel (phone.lock) |
| 0.2 | Replace the tank sample with an empty GRID GameDef: `types.ts` skeleton (§8.2 with the state-size rules), the 15-min tick as core `tick`, mode list | sonnet | `src/game.ts`, `src/types.ts` | determinism test (core), save round-trip | tsc clean; determinism test green |
| 0.3 | Region-pack seam: `src/regions/{global,in}/pack.ts` with schema, loader (core or shim), `rulesetId` hash, pack selection in state | sonnet | `src/regions/**` | schema test; rulesetId stability test | Both packs load; changing a price changes `rulesetId`; changing a name does not |
| 0.4 | Strings: `strings/en/*.json`, `t(key, params)`, lint test for literal strings in `src/` and `godot/` | haiku | `src/strings/**`, `scripts/lint-strings.mjs` | lint test | Lint is green on the scaffold and red on a planted literal |

**Exit criteria:**
- CI is green.
- Smoke OK on desktop.
- The scaffold APK runs on the Pixel. Evidence: a screenshot path.
- `status/grid.md` is updated.

## M1. Engine core, TDD (oracles and property tests first)

Lanes run in parallel once 1.0 lands. Each task begins by writing its oracle/property tests from DESIGN §9.1/§9.2, using
the unrounded values from `tools/oracles/expected.json` (task 1.0).

| # | Task | Model | Files | Tests first | Acceptance |
|---|---|---|---|---|---|
| 1.0 | Port the oracle scripts and the reviewer scripts to `tools/oracles/`; emit `expected.json` (≥ 10 significant digits) for all 71 oracles + L03/L07/L15/L17/L19 level numbers | sonnet | `tools/oracles/**` | — | Scripts reproduce DESIGN §9.1 and REVIEW §3 |
| 1.1 | Network: Y-bus, exact π, transformer taps (τ = 1 − 0.0125n), bus-tie merge, islands (union-find) | sonnet | `sim/network/*` | PS-08, PS-12, G-11, G-17; P5, P7, P8, P9 | All green |
| 1.2 | NR load flow: polar, analytic Jacobian, line search, Q-limit hysteresis, flat-start retry, continuation + collapse sheds; GS; DC flow | sonnet | `sim/loadflow/*` | PS-13/14/15/16, G-10; P1, P2, P4, P10-P14, P25 | All green; 2,000-case fuzz green |
| 1.3 | Bench MNA (DC/AC complex), harmonics, 4-wire, machine bench | sonnet | `sim/bench/*` | AC-01..22, G-01/01b/02/03/04/05/15/19/20; P3, P6, P21, P22; L03 exact table | All green |
| 1.4 | Frequency dynamics (§3.6 as amended: offset deadband, latched delayed UFLS, pack grid code), SMIB | sonnet | `sim/dynamics/*` | G-12, G-13, PS-23..26; P16, P17; **L19 table from REVIEW** (48.94/49.59/49.67 Hz ± 0.01) | All green |
| 1.5 | Faults (Zbus columns, sequence networks), relays (IEC IDMT, distance, OOS), breakers, thermal timers + cascade | sonnet | `sim/protection/*`, `sim/thermal/*` | PS-17/18/19, G-06/07/18; P19, P20 | All green |
| 1.6 | Dispatch: λ-ED with ramps and limits, B-loss coordination, penalty factors, hydro water value, storage, commitment | sonnet | `sim/dispatch/*` | PS-20/21/22, G-09, G-16 (US$); P15, P18 | All green |
| 1.7 | Weather/renewables/demand (solar, wind, clouds, ZIP loads, demand classes) | sonnet | `sim/weather/*` | G-08, G-14; shape tests | All green |
| 1.8 | `global` catalogues (§4) as typed pack data with `source`/`confidence`; `in` catalogues from Appendix A.3 | haiku (entry) + sonnet (audit) | `src/regions/*/catalogues/*.ts`, `src/data/*` | GIGAWATT-style data tests (plausibility, duplicates, source present); release gate for `global` | Rows typed; ranges valid; the director spot-checks 10 rows against REVIEW sources |
| 1.9 | **Data verification:** EU network-code values, IEC 60364-5-52 ampacity, transformer %Z/losses, breaker R10, H, fuel prices (EIA EPM 7.4) | sonnet (web) | `src/regions/global/sources.md` | — | Each `recall` row becomes `standard`/`report`/`secondary`, or `game` with an honest note. **Zero `recall` in `global`** |
| 1.10 | Systems pipeline (§8.3) + `runEventWindow` + `levelResult`; actions/queries skeleton with teaching `{message,key,params}`; `actionLog` | sonnet | `sim/tick.ts`, `sim/event.ts`, `engine/**` | P23, P24; state-size test; finite-number guard | A synthetic 10-bus day runs; golden recorded |
| 1.11 | Solution code + `verify` (§12): encode/decode, CRC, rulesetId/levelHash checks, esbuild `dist/verify.mjs` with no Node built-ins | sonnet | `src/leaderboard/**` | round-trip, tamper, garbage-fuzz (never throws), bridge-parity tests | `verify` on a synthetic level matches the in-process result bit-exactly |
| 1.12 | Perf harness (§3.15) on a 60-bus case | sonnet | `perf.test.ts` | budgets as tests | Desktop medians within budget |

**Lanes:**
- **A:** 1.1 → 1.2 → 1.10.
- **B:** 1.3.
- **C:** 1.4 → 1.5.
- **D:** 1.6 + 1.7.
- **E:** 1.8 + 1.9.
- **F:** 1.11 (after 1.10 skeleton), 1.12.

Up to 5 workers can run concurrently.

**Exit criteria (evidence in `status/grid.md`):**
- All 71 oracles green against `expected.json`.
- 25 properties green at 2,000 cases each.
- A 50,000-case nightly run passes once.
- `tsc` is clean.
- Perf medians are within budget.
- `global` has zero `recall` rows.
- `verify.mjs` builds at ≤ 1.5 MB.
- Expected test count ≥ 450.

## M2. Vertical slice: Chapter 1 + P0 + L07, fully playable

L07 is included so the slice proves the AC/phasor visual language, not just DC.

| # | Task | Model | Acceptance |
|---|---|---|---|
| 2.1 | Level framework: GRID level spec over core `Level`. Covers site list, allowed parts, pack-symbol thresholds, naive/lesson/reference builds, stars, frozen targets, coach steps | sonnet | Level tests run per pack |
| 2.2 | Author P0, L01, L02, L03, L07 (+ histogram population via a searcher stub) | sonnet | Lesson gates with the ≥ 2% margin rule; expert ★★★; idle fails |
| 2.3 | Godot world: diorama map, terrain tiles, towns with V²-lit windows, lines/ribbons with flow pulses, plants, day-night | sonnet ×2 (world / effects) | Overlay-truth and town-lights-truth tests (§9.8 items 3 and 6) |
| 2.4 | Drawers: Build, Inspector (with phasor mini-diagram), Timeline; HUD with the non-linear frequency dial; result card with histogram (bot fallback, labelled) | sonnet | Phasor-truth and dial-truth tests |
| 2.5 | Failure visualisation: bullet time, replay scrubber, first-domino ring, why-cards from templates, Blackout Card PNG | sonnet | Replay determinism test; share-export test |
| 2.6 | Coach for L01 + "Needs you now"; alarm speed 0.1×; skip-calm-hours | sonnet | Coach-follower persona passes the slice; device-aware text test |
| 2.7 | Audio slice: the hum (pitch = f/50), breaker/relay/whomp SFX, 1 adaptive track | sonnet | Hum-truth test |
| 2.8 | Input parity on the slice: MK, pad (`CB_PAD=1`, pad.lock), touch | sonnet | L01 completed by keyboard-only, virtual pad and phone touch scripts |

**Exit criteria (evidence):**
- Screenshots of P0 mid-cascade, L01 lit and L07 phasor overlay at 1920×1080, 1280×800 and phone 2424×1080 with insets.
- Layout audit is zero at all 7 resolutions.
- The slice plays on the Pixel at ≥ 30 fps. Evidence: a log.
- **Fun-critic mini-round (Opus) on the slice.** Hypotheses for minute 1 and minute 10 (§9.9) must be met, or the slice is reworked before M3.
- Expected test count ≥ 550.

## M3. Full campaign and content

**Content tasks (one level per worker task):**
- **Must-ship:** L04-L06, L08, L10, L12, L14-L17, L19-L21, L23-L26, L28 (17 tasks; P0, L01-L03 and L07 are done in M2). Each task covers the level file, coach/needs card, why-card templates it needs, Codex entries it unlocks, and its lesson gate + searcher run.
- Level authors use the reviewed numbers: L17 at 300 MW, L19 at 6.9 GW, L03 exact table.
- **Codex:** 44 entries, written by sonnet. Each entry has what / why / equation / worked example from oracles and its honest notes. **6 labs** (sonnet ×2).
- **Sandbox:** "Lumen 2030" and "Island" (sonnet). The 7-day operator persona must keep ENS < 0.1%.
- **Curves drawer:** P-V, P-δ, TCC, impedance sweep, merit stack. **Study drawer** with N-1 and fault study (sonnet).
- **Searcher + histograms:** `scripts/build-histograms.mjs`, nightly full search, cached best solutions (sonnet).
- **`in` pack seam:** pack-switch, leak and physics-invariance tests (sonnet). Fill the `in` strings from Appendix A (haiku).

**QA gate before stretch:**
- Personas sweep: idle fails, expert ★★★, searcher ≥ ★, coach-follower ≥ ★, greedy-cheese ≤ ★.
- Lesson gates and single-knob extremes on all must-ship levels.
- **Educator review (Opus)** of every must-ship level and Codex entry. This includes the NCERT citations and the L04 ω wording.

**Stretch:** L09, L11, L13, L18, L22, L27 and the 6 extra labs are built only after the gate is green.

**Exit criteria:**
- All must-ship levels pass every level test in `global`.
- `in` loads, and every level is ≥ ★ solvable with zero leaks.
- The educator signs off with no wrong physics.
- Expected test count ≥ 900, of which ~350 are level tests.

## M4. Polish

| # | Task | Model |
|---|---|---|
| 4.1 | Audio: full SFX list, 3 adaptive tracks with distinct structures (`tools/audio` synth), settings sliders incl. hum | sonnet |
| 4.2 | Juice: street-by-street darkness, breaker animations, cap-bank glow, lightning-as-fault, sunset hue, campaign map lighting up per level | sonnet |
| 4.3 | Codex shell + labs polish, honest notes S1-S37, 3 grid stories | sonnet |
| 4.4 | Settings: graphics tiers (Potato … High), accessibility (colour-blind palettes, reduced motion, text size, working high contrast), contrast check on both themes | sonnet |
| 4.5 | Leaderboard client: submit, queue (`user://scores_queue.json`), retry/backoff, histogram cache, nickname prompt, reset player id, `CB_SCORES`/`CB_SCORES_URL`. End-to-end against a local `cobanana-scores` (Docker) if available, else a contract mock | sonnet |
| 4.6 | Blackout Card / Result Card art pass; design-code paste UI | sonnet |
| 4.7 | String sweep: every player-facing literal moved to tables; lint green | haiku |

**Exit criteria:**
- Smoke OK.
- Layout audit is zero at all resolutions and themes.
- Contrast ≥ 4.5:1.
- `verify` contract tests are green, including desktop ↔ nodejs-mobile parity.
- The leaderboard e2e or mock is green.

## M5. QA rounds (PROGRAM.md roster + skill `tester-prompts.md`)

**Round 1 (parallel, on displays `:201-:208`):**
- novice (Learner, desktop)
- form factors + settings
- phone (Pixel, phone.lock)
- pad (Deck layout, pad.lock)
- monkey (haiku, engine 20 seeds × 10,000 actions and UI clicks)
- code reviewer (sonnet)
- **fun critic** (opus, §9.9 hypotheses with timestamps)
- **educator** (opus)

The director triages findings into `docs/CRITIQUE-0.1.md`. Fixes are sonnet tasks. **Round 2** re-runs every tester whose
findings were fixed, and each fix is verified. Phone perf is logged against the §3.15 budgets (`CB_PERF=1`).

**Exit criteria:**
- No open B/H findings.
- The fun critic answers "would play another hour" with a named hook.
- The educator raises no physics error.
- The Pixel full campaign passes P0 → L07 plus spot levels in Ch 5-7 and the finale.

## M6. Release

- Version bumps and CHANGELOG.
- Fresh README/site screenshots at 4K, downsampled.
- CI release workflow: Linux, Windows and macOS builds, plus SHA256SUMS.
- Signed APK uploaded.
- The `verify.mjs` + `levels.json` artifact is published for `cobanana-scores`.
- Tag only when the orchestrator says to push.

**Exit criteria:** PROGRAM.md quality bar items 1-10, the data release gate, and the tagged release with all assets.

## Testing matrix (targets)

| Layer | What | Where / when | Target |
|---|---|---|---|
| Unit | Each rule module, written first | `src/sim/**.test.ts`, every push | 100% of modules; ≥ 300 tests |
| Oracle | 71 textbook + model oracles + level numbers vs `expected.json` | every push | 71/71; tolerance vs unrounded values |
| Property/fuzz | P1-P25, seeded | 2,000 cases/property per push; 50,000 nightly | 0 failures; seeds logged |
| Golden | Reference day-runs, naive failure replays, P0 cascade, sandbox 7-day, monkey traces, bridge parity | every push | Bit-exact; regenerate only on declared rule changes |
| Persona | idle / expert / searcher / coach-follower / novice / greedy-cheese / monkey | per push (cached searcher); full nightly | idle fails all; expert ★★★ all; searcher ≥ ★; coach-follower ≥ ★ (≤ 3 retries); cheese ≤ ★; monkey 0 violations |
| Solvability | Searcher per level per shipping pack | nightly, ≤ 3 min/level | ≥ ★ every level |
| Cheese | Lesson-bypass search, single-knob extremes, shedding-as-strategy, budget sanity | nightly + on level change | No ★★ without the lesson; naive fails and lesson passes by ≥ 2% margin |
| Region seam | Schema, pack switch, leak, physics invariance | every push | `global` and `in` both load; 0 leaks |
| Leaderboard | `verify` round-trip, tamper, fuzz, desktop ↔ mobile parity, CPU budget | every push (parity at M4/M5) | ≤ 300 ms/level (L28 ≤ 2 s); never throws |
| Strings | Literal-string lint | every push | 0 literals |
| State size | Reference runs | every push | ≤ 256 KB campaign, ≤ 1 MB sandbox |
| Perf | §3.15 budgets | desktop per push; Pixel at M2/M5 | Within budget |
| Smoke | Every screen × theme × layout, autoplay expert day-run | CI | `SMOKE OK` |
| Layout audit | 1280×720, 1280×800, 1920×1080, 2560×1440, 3440×1440, 3840×2160, phone 2424×1080 + insets | M2, M4, M5 | 0 squeezed/overflowing; text ≥ 13 px; contrast ≥ 4.5:1 |
| UI truth | Overlay, phasor, dial, town lights, hum, replay, share export, modal discipline, coach device text, numeric keypad | CI (headless where possible) | All green |
| Phone | Pixel 9a, full slice, then the campaign spot pass | M0, M2, M5 | ≥ 30 fps floor; budgets met; Back never quits |
| Pad | Virtual pad completes L01 and L07; all controls focusable | M2, M5 | Pass |
| Monkey | Haiku UI monkey + engine monkey | M3, M5 | 0 crashes, 0 NaN |
| Fun | Opus fun critic, §9.9 hypotheses | M2 slice, M5 ×2 | Minutes 1/10/25/45/60 met; no "chore" level twice |
| Educator | Opus educator: physics, units, syllabus, citations | M3 gate, M5 | 0 physics errors; NCERT citations attached |

## Estimate (worker tasks)

| Milestone | Worker tasks | Notes |
|---|---|---|
| M0 | 3 (+ director) | |
| M1 | ~14 | Five lanes in parallel; the data verification task needs a working web path |
| M2 | ~10 | Two Godot world workers in parallel |
| M3 | ~30 | 17 levels, Codex ×2, labs ×2, sandbox, drawers, searcher, seam, `in` strings, educator; +8 if stretch is built |
| M4 | ~8 | |
| M5 | ~10 testers ×2 rounds + ~15 fix tasks | |
| M6 | 2 | |
| **Total** | **≈ 100 must-ship** (+ ~10 stretch) | |

## Risks to watch (see DESIGN §10.4)

- Core region-pack and string helpers are not finished yet. Use shims behind the same interface.
- The `verify` CPU cost needs a hosting choice from the user: paid Workers, Docker, or async.
- The EU-code values may stay unverifiable. The fallback is `game` labels.
- The 3D diorama on Pixel at 60 fps: Potato/Low tiers are in place from M2.
- Level knife edges: the margin rule is enforced by tests.
- Scope: stretch waits until the M3 gate is green, with no exceptions.
