# GRID design review (level-1 reviewer, 2026-11-09/10)

Scope: `design/grid/DESIGN.md` (designer draft, 1,861 lines) reviewed against PROGRAM.md (including user decisions 1-5),
RESEARCH.md, the GIGAWATT skill, `cobanana-core` (CORE.md + `ts/kit`, `ts/numerics`), and NODE's design (for overlap).
DESIGN.md was edited in place (now ≈ 2,390 lines). The original is preserved in two ways: India-specific content moved
verbatim into **Appendix A (draft `in` region pack)**, and the rest is only changed where listed below.

Reviewer scripts are in `design/grid/oracles/review/`:
- `reviewer_spot.py`: my own spot-checks (69 quantities).
- `recheck/`: a Sonnet worker's blind re-solve of all 71 oracles plus level checks.
- `l19/`: a Sonnet worker's L19 re-tune for the `global` grid code (`python3 -I run_l19.py`).
- `l17_catalogue.py`: my L17 re-run with the catalogue constants.

## 1. Verdict
The design is strong. The physics is right, the oracles are right, the architecture fits core, and the test plan is
unusually complete. Three things were not ship-ready:

1. **User decisions were not applied.** It had an India setting, ₹, IS/CEA/IEGC codes, no leaderboard and no region seam.
2. **Two levels sat on knife edges, and one used physics that was not honest.** L17's caps-only case was 1 MW from the
   trip load. L19's naive case sat 5 mHz from 49.0 Hz under the new code. L09's claim about k = 100% resonance was wrong.
3. **Scope was too large for a quality v0.1.** It had 28 levels, all 12 labs, a GIF exporter and 5 music tracks, with no
   must-ship/stretch split, and nothing to see in minute one beyond a hamlet.

All three are fixed in the doc, except the items listed in §5 (deferred).

## 2. Findings
Severity: **B** = blocker, **H** = high, **M** = medium, **L** = low.

### 2.1 User decisions
| # | Sev | Finding | Fix |
|---|---|---|---|
| U1 | B | The setting was India-specific: Prakash Pradesh, Sundar delta, Kaveri, Meera/Sharma-ji/Iyer/Asha, board exams and Indian utility titles | **Applied.** Neutral `global` pack: Lumen Province, Seaglass Delta, Kestrel Falls; cast Ada Moreno, Tobi Hart, Commissioner Vance and Nia (final exams); generic licence titles. Same soul ("prakash" = light → Lumen). The India originals are kept in Appendix A.1 |
| U2 | B | Money was ₹ (lakh/crore), with ₹ capex columns | **Applied.** US$ throughout: EIA AEO2023 capex/heat rates, MISO MTEP24 line/transformer/compensation costs, LBNL-anchored VOLL. Budgets now come from the §9.4 budget rule, with US$ design intents. The ₹ catalogue is in Appendix A.3 |
| U3 | B | Codes were IS 398, CEA voltage bands, IEGC frequency/UFLS/FGMO and CERC norms | **Applied.** BS 215 / EN 50182 conductor names, IEC 60038 voltages (opened), EN 50160 LV band, and an ENTSO-E-style "Lumen Grid Code": 6-stage UFLS 49.0→48.0 Hz, ±50 mHz band, 10 mHz FCR deadband, 2-12% droop, 15-min settlement. LV is 230/400 V (was 415 V); distribution transformers use IEC 60076 ratings |
| U4 | B | Leaderboards were deferred to v0.2, and there was no `verify` | **Applied.** New §12: solution-code format (`GRID1.<ruleset>.<level>.<hash>.<payload>.<crc>`), the pure `verify(levelId, code)` export with CPU/size budgets, offline queue, histogram cache and histogram UI. Bot histograms are now an empty-state fallback only, and labelled. Star targets stay frozen from bot populations |
| U5 | B | No string externalisation plan | **Applied.** §12.6: engine returns `{message, key, params}`; string tables; a lint test for literal player-facing strings. Region names are injected as params |
| U6 | B | Region packs (decision #5) | **Applied.** New §11: pack contents, the rule that levels reference pack symbols only, a `rulesetId` carried in codes and leaderboards, and four tests (schema, pack switch, leak, physics invariance). The India content is preserved as the draft `in` pack (Appendix A). The tycoon career stays v0.2 (decision #3). |
| U7 | M | 765 kV, Bersimis, PHWR and IEX prices were India-specific data | PHWR renamed to `nuclear-1100` (EIA LWR) in `global`; Indian market facts moved to the pack (A.2). The 400 kV cap stays |
| U8 | L | "Gigawatt Inc." datacenter nod | **Kept** (L28 + sandbox, 300 MW flat load), as the orchestrator asked |

### 2.2 Fun critic
| # | Sev | Finding | Fix |
|---|---|---|---|
| F1 | H | Minute 1 had no spectacle: L01 is a DC hamlet, and the first real cascade (the game's best 10-second clip) arrived in Ch 5, around hour 2 | **Added P0 "The Night the Lights Went Out"**, a ≤ 90 s interactive cold open. The player closes one breaker and watches the province cascade in bullet time with the hum sagging. It gives the campaign its premise and runs on the real §3.9 cascade (golden-tested) |
| F2 | H | L18 and L27 were worksheets: predictions plus a trivial or absent task | Both now have real build tasks (L18: a bus-2 voltage fix under a Q-limit; L27: breaker ratings + dispatch). Predictions are optional ★ sources only. Both are stretch |
| F3 | H | Dead air: a 72 s day-run with nothing happening, plus a 39-minute overload timer that is only ≈ 2 s real at 1×, so the "operate loop" was unplayable (the doc's "≈ 12 s real" was arithmetic-wrong) | First red alarm → **0.1× alarm speed** in every mode (≈ 20 s to act); Learner also pauses. "Skip calm hours" at 4× is on by default in Learner |
| F4 | M | Hour 2 reason: Ch 5-7 are heavy | Kept the strong hooks (histograms now *real players*, design codes, Blackout Cards, Nia's thread to the finale). Bot histograms are labelled as such. Recommended the fun critic gate at M2 and M3 (BUILD-PLAN) |
| F5 | L | The juice inventory (hum pitch = f/50, street-by-street darkness, breaker clunks, adaptive stems) is excellent | No change. The hum and town lights stay protected |

### 2.3 Educator (all equations re-derived; ≥ 10 oracles computed, see §3)
| # | Sev | Finding | Fix |
|---|---|---|---|
| E1 | H | **L09's physics was wrong.** "k = 100% series compensation puts the feeder at 50 Hz resonance, current limited only by R, fault-like surge trips the line" is not true under normal load: the load impedance still limits current, and 100% compensation just cancels X_L. The real hazards are *fault* current limited only by R, and SSR | L09 rewritten as "The Hundred-Percent Trap": the scripted fault behind a 100% bank exceeds the breaker rating. It is system-scale, and also resolves the NODE overlap (E/§2.5). Stretch |
| E2 | H | **L03 table used the naive (P/V)²R at the far end** (5.03/3.63/2.68%). The exact solve with a constant-power far converter gives 5.81/4.05/2.93%. Pass/fail outcomes are unchanged | Table replaced with exact values. The Codex shows the quick estimate as an estimate. 50 mm² passes ★★★ by only 0.07 pp, flagged to the level author |
| E3 | H | **L17 knife edge.** The designer's caps-only loadability (284 MW) was 1 MW below the trip load (285). With the catalogue's own derived twin-Zebra constants (x 0.302, b 3.72; the script used 0.31/3.6) caps-only *passes* (290 MW) and the lesson gate breaks | Trip load moved to 300 MW (peak 320). Re-run: none 266 / caps 290 (fail) / STATCOM100 316 (pass, 5%) / STATCOM200 368 (★★★). `l220-twinzebra` added to the catalogue (it was missing) |
| E4 | H | **L19 under the `global` code.** Re-tuned with a faithful §3.6 implementation | Island at 6.9 GW (from 6.7): naive 48.94 Hz (sheds 345 MW, fails ★); 13th unit 49.59 Hz; +200 MW FFR 49.67 Hz; RoCoF₀ −0.478 Hz/s (analytic = RK4). BESS-alone needs ≥ 250 MW. ★ = no shed (≥ 49.0), ★★★ ≥ 49.2 Hz |
| E5 | M | §3.6 ambiguities: deadband type, D_sys load basis, delayed relays vs "apply at step end", RoCoF (window vs t=0⁺) | Decided: offset dead-zone; P_load(t) = pre-event − shed; timers start at the interpolated crossing and latch; predictions use analytic RoCoF₀ and the HUD's 500 ms slope is labelled |
| E6 | M | The designer's `l19.py` differs from §3.6: instant shed, BESS 5% droop with a 5× clamp error in `sim2`, no P_min clamp | Superseded by `review/l19/l19_ce.py`. The engine implements §3.6, not that script |
| E7 | M | Oracle tolerances are tighter than the printed digits on ≈ 18 rows. All are rounding, none wrong | Rule added (§9.1): tests compare against unrounded script values (`expected.json`), never the printed digits |
| E8 | M | Missing oracle conventions: PS-17-19 base and X0 of T, G-17 tap side, G-04 Q_c meaning | Notes added under §9.1 |
| E9 | L | L04 uses e₀ = NBAω with poles: ω must be the *electrical* angular frequency (= (p/2)·ω_mech) | Deferred to the L04 level author (M3 educator check). Noted here |
| E10 | L | L15 "total charging 192 MVAr" is nominal bV²; exact no-load sending-end ≈ 201 MVAr | The Inspector shows and labels the exact value |
| E11 | L | Frequency dial 49-51 Hz cannot show the new 48.0 Hz UFLS floor | Dial 47.5-52.5 Hz, non-linear (the central ±0.5 Hz takes half the arc) |
| E12 | L | Level cost metric mixes un-annualised capex with ×365 opex | Kept (it reads as "first-year cost"); M3 to label it so in the UI |

Syllabus coverage: Ch 1-3 cover NCERT XII current electricity, EMI and AC (power framing). Ch 4-7 cover a standard EE
power-systems course (Grainger-Stevenson/Glover/Kothari-Nagrath). The progression is sound. Exam-bridge citations to
exact NCERT exercise numbers are still owed (L06 is very likely NCERT XII Ex. 7.25/7.26 in the pre-2023 numbering; the
educator must confirm against the current edition).

### 2.4 Lead engineer
| # | Sev | Finding | Fix |
|---|---|---|---|
| L1 | H | `GameState.tiles: Uint8Array` violates core's plain-JSON state contract | Now a base64 string. Typed arrays/Maps are banned in state |
| L2 | H | State bloat: core `structuredClone`s state on every action; the doc kept flows, Jacobian and full replay frames in state | `solution` keeps only V/θ; derived data comes from queries (memoised outside state). Replay ≤ 64 KB (last event, 20 ms decimated). State-size test: ≤ 256 KB campaign, ≤ 1 MB sandbox |
| L3 | H | Searcher budget of 20,000 full day-runs ≈ 2+ h per level, which CI cannot afford | ≤ 20k surrogate + ≤ 300 full runs (≤ 3 min/level), nightly. CI replays a cached best solution keyed by level hash + ruleset |
| L4 | H | Leaderboard `verify` on serverless: GRID runs 100 ms-2 s CPU, against Cloudflare free's 10 ms | Budgets set (≤ 300 ms, L28 ≤ 2 s). Flagged as a user decision (paid Workers / Docker / async) |
| L5 | M | No action log, so design codes were not reproducible from state | `actionLog` added; the solution code is generated from it |
| L6 | M | Status names differ from core (`passed/failed` vs `won/lost`) | Aligned to core `Status` |
| L7 | M | `levels/` sizing: per-level lesson gates need margins, not just pass/fail | Lesson-gate margin rule: naive fails and lesson build passes, each by ≥ 2% of the decisive quantity (risk 15) |
| L8 | M | Core lacks the region-pack framework, HTTP/score helper and string tables (only a `region-engine.test.ts` stub exists) | BUILD-PLAN M0 dependency: core must ship them, or GRID builds local shims behind the same interface |
| L9 | L | dmath exists in core, so the designer's blocker is resolved | — |
| L10 | L | Phone budgets (≤ 15 ms LF, 25 ms block) are plausible for ≤ 60 buses dense | Kept; measured in M5 on the Pixel |

### 2.5 Overlap with NODE (orchestrator note)
NODE teaches series LCR, Q and bandwidth (tickets 7-3 and 7-5), the transformer wall-wart and reactance. GRID's L09 was the same
NCERT LCR bench, and both casts had a "Meera". **Decided (§2.8, binding):** GRID is system-scale (buses, lines, plants,
MW/kV/pu, 50 Hz phasors and electromechanical seconds); NODE is component-scale (parts, waveforms, transients, Bode).
- GRID dropped the LCR bench level and lab.
- Codex 12-15 are reframed at feeder scale.
- The AC textbook oracles stay as solver tests in both games (shared physics, not content).
- Phasor-convention wording is shared.
- Casts are distinct.

The NODE reviewer should be told.

## 3. Oracle spot-check
I computed 69 quantities covering ≥ 45 oracle rows myself (`review/reviewer_spot.py`). A Sonnet worker independently
re-solved **all 71 rows blind** (`review/recheck/`). **Result: 0 wrong values.** About 18 rows are rounding-limited (see E7).

| ID | Quantity | Doc | Reviewer | Rel. err |
|---|---|---|---|---|
| AC-07 | I, pf, P (LCR 230 V) | 45.96 A, 0.5994, 6336 W | 45.957, 0.59943, 6336.0 | 8e-5 |
| AC-08 | \|Z\|, lead angle | 187.96 Ω, 57.86° | 187.964, 57.858° | 3e-5 |
| AC-17 | e₀, P_avg | 0.6032 V, 0.01819 W | 0.603186, 0.0181917 | 9e-5 |
| PS-05 | Q_c, C_Y, C_Δ | 345.8 kvar, 5685, 1895 µF | 345.76, 5684.9, 1894.95 | 1e-4 |
| PS-08 | A, \|Z_c\|, V_R0 (Ferranti) | 0.92663, 393.08 Ω, 237.39 kV | 0.926628, 393.085, 237.391 | 1e-5 |
| PS-14 | GS iter 1: V₂, Q₃, ∠V₃ | 1.01331−j0.0310, 0.71206, 0.2433° | 1.01331−j0.0310, 0.712062, 0.24334° | 1.5e-4 |
| PS-15/16 | NR \|V₂\|, ∠₂, slack P/Q, losses | 1.01334, −1.3772°, 62.565/61.290, 5.965 MW | 1.013336, −1.37723°, 62.5646/61.2903, 5.9646 | 6e-5 |
| PS-17/18/19 | 3φ, SLG, LL fault | 0.9094 kA, 0.7515 kA, 1.8425 pu | 0.909421, 0.751473, 1.84245 | 4e-5 |
| PS-20/21 | ED λ, cost; with limits | 9.163, 8228.03; 9.580, P₂ 340 | 9.16316, 8228.03; 9.580, 340 | 2e-5 |
| PS-24 | δ_cr, t_cr | 84.77°, 0.2600 s | 84.7745°, 0.259956 s | 1.7e-4 |
| PS-26 | droop sharing | −0.2703 Hz, 67.57 MW | −0.27027, 67.5676 | 1.1e-4 |
| PS-27/28 | E∠δ, P_max | 1.9698∠29.17°, 1.6415 | 1.96977∠29.168°, 1.64148 | 8e-5 |
| G-04 | detuned h series/parallel, Q_eff | 3.780, 3.015, 2.1505 | 3.77964, 3.01511, 2.15054 | 9e-5 |
| G-07 | grading TMS₂; VI, EI times | 0.1649; 0.1500, 0.0808 | 0.164934; 0.1500, 0.080808 | 2e-4 |
| G-12 | Δf(1 s), nadir, Δf_ss (expm) | −0.302584, −0.30752, −0.238095 | −0.302584, −0.30752, −0.238095 | 1.5e-6 |
| G-17 | tap convention | 0.92934 / 0.97825 | 0.929339 / 0.978248 | 2e-6 |
| G-16 (US$) | marginal fuel cost | (₹2,266/MWh) | US$26.78/MWh at $2.60/GJ | — |
| L07 | no-cap current / V; with 0.9 MVAr | 122 A, 0.944 pu; 98 A, 0.957 | 122.0, 0.9442; 98.3, 0.9565 (Q∝V²) | ✓ |
| L15 | \|A\|, no-load V_R | 0.932, 429 kV | 0.93210, 429.14 kV | 3e-4 |
| L13 night task | E, δ to absorb 0.2 pu at P 0.8 | — | E 1.2244, δ 51.6° (< 60°, feasible) | — |

## 4. Decisions I made (also in DESIGN §10.5)
1. `global` pack = Lumen Province, US$, IEC/EN/ENTSO-E-style "Lumen Grid Code". `in` = draft pack, CI-tested, not shipped.
2. **Must-ship:** P0 + 22 levels (L01-L08, L10, L12, L14-L17, L19-L21, L23-L26, L28). **Stretch:** L09, L11, L13, L18, L22, L27. Level ids are unchanged.
3. Stretch also covers: 6 extra Codex labs, the Blank-state sandbox, the GIF export, music tracks 4-5 and the Iberia 2025 story.
4. L09 replaced (system-scale series compensation). L18/L27 given build tasks. P0 prologue added.
5. Alarm speed 0.1× on the first red alarm; skip-calm-hours default on in Learner.
6. Offset governor deadband; latched UFLS relays; analytic RoCoF₀ for predictions.
7. L17 trip load 300 MW; L19 load 6.9 GW; `l220-twinzebra` template added.
8. State-size limits; no derived data in state; `actionLog` → solution code; the `verify` contract and budgets.
9. Searcher budget split (surrogate vs full) with a cached-solution CI check.
10. Oracle tests compare against unrounded script values.
11. GRID/NODE boundary (§2.8).

## 5. Deferred (owner, when)
- **EU network-code values** (SOGL Annex II/III/V, NC ER LFDD, NC RfG Art. 13/15) are still `recall`: EUR-Lex and legislation.gov.uk
  returned empty pages here. M1 data task: verify, or relabel `game` (honest, since the code is fictional).
- `recall` rows in `global`: transformer %Z/losses, breaker R10 series, IEC 60364-5-52 ampacity, inertia H, fuel prices
  (to EIA EPM Table 7.4), distribution line costs (game), and the series-cap and LV cap prices (game). M1 data task.
- Exact NCERT exercise citations for L06 and the AC oracles. Educator, at M3.
- L04 electrical-ω wording (E9); first-year-cost label (E12). Level author, at M3.
- `in` pack: re-tune L19 for IEGC stages before it is ever promoted (its original sits on a knife edge).
- Tell the NODE reviewer about §2.8 and the cast-name rule.
