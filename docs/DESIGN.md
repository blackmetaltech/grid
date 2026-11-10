# GRID: game design document (v0.1 alpha)

> "Keep the lights on." A power-system builder where a real AC load-flow, a real swing equation and real
> relays are the rules of the game. Every blackout is a physics lesson you caused, can replay, and can fix.

| | |
|---|---|
| Slug / repo | `grid` (`/home/ixaxaar/src/ORGS/cobanana/grid`, core as submodule `core/`) |
| Android id / engine port / Xvfb | `in.ixaxaar.cobanana.grid` / 47901 / `:200-:219` |
| Accent | Grid cyan `#39E1FF` on night indigo |
| Audience | JEE Class 12 (AC chapter, EMI), EE undergrads (power systems), Steam sim/puzzle players |
| Owner of this doc | GRID level-1 design director. Status of every number: verified, recall-flagged, or game-tunable, stated in place |

Conventions used everywhere in this document: SI units; per-unit (pu) on **S_base = 100 MVA** (three-phase) and the
line-to-line nominal kV of each voltage zone; angles in degrees in UI, radians in code; phasors are rms; φ is the angle by which
V leads I (φ > 0 = lagging, inductive); complex power S = V·I* (positive Q = lagging/inductive load absorbs). Money comes from the active **region pack** (§11). The v0.1 default pack `global` uses **US$** (k = 1e3, M = 1e6).
Every place, character, code, price and grid-code number named in §1-§10 is the `global` pack's value unless stated; the
physics is region-independent. The designer's original India setting is preserved as the draft `in` pack (Appendix A).

**Contents:** 1 Pitch, fantasy, hook, sessions · 2 Loops, modes, campaign, levels (22 must-ship + 6 stretch + prologue) · 3 Simulation model · 4 Data catalogues · 5 World view and art direction · 6 Screens, drawers, input map · 7 Teaching design · 8 Engine architecture, env, personas · 9 Test plan (71 oracles) · 10 Scope, cut lines, risks, decisions · 11 Region packs · 12 Online leaderboards · Appendix A: draft `in` region pack

---

## 1. Pitch, fantasy, hook, sessions

### 1.1 Pitch (one paragraph)
You are the chief engineer of **Lumen Province**, a fictional coastal region whose grid you grow from a solar-and-battery DC
microgrid on a delta island to a 400 kV interconnect with coal, hydro, gas, wind, solar and storage. You place plants, string
lines tower by tower, set transformer taps, size capacitor banks, tune governor droops and relay curves. Then you **run the day**:
demand rises at dusk, clouds cross the solar parks, a storm drops a line, and the grid answers with real physics:
voltages sag, frequency dips, breakers trip, and towns go dark one by one. You can only survive by reasoning in V, I and φ.
When it fails, the game replays the cascade, names the first domino in plain words using *your* numbers, and hands you the
Codex page that explains it. Then you fix it, and optimise for cost, losses and reliability against a histogram.

### 1.2 Player fantasy
"I am the engineer the whole province depends on, on the night before the final exams." Mastery fantasy (Factorio/Opus Magnum: I built
something elegant that works), plus guardian fantasy (millions of lit windows are mine to protect), plus the expert's
pleasure of *seeing* invisible things: reactive power, phase angle, inertia.

### 1.3 The hook (why an hour, why share)
1. **The lights are the score.** Towns are diorama buildings whose windows are lit by *your* power flow: brightness follows
   bus voltage, and windows go dark when load is shed. The first minute ends with a village lighting up at dusk on a cable
   you sized. Every failure is visible from across the map.
2. **You can hear the frequency.** The ambient transformer hum is a 100 Hz tone (magnetostriction hums at twice line
   frequency) whose pitch tracks the simulated grid frequency. When a 500 MW unit trips, the hum audibly sags before the
   gauge does. Players learn inertia with their ears.
3. **Bullet-time blackouts.** A trip drops the game from the 15-minute operator clock into seconds-scale slow motion:
   frequency dial swinging, relays ticking, breakers clunking in sequence. The cascade can be scrubbed, annotated and
   exported as a **Blackout Card** (PNG on all platforms, GIF on desktop) showing the first domino, the cascade timeline,
   people affected and the fix. These are the share objects ("my grid fell over in 11 seconds, here's why").
4. **Histograms and design codes.** Every level scores cost, losses and reliability against a histogram. A design code
   (a short string) re-creates your build exactly. The engine is deterministic, so a code is proof.
5. **It is the real thing.** A real Newton-Raphson AC load flow, an exact long-line model, IEC relay curves, the swing
   equation, BS 215 / EN 50182 conductor names, IEC 60038 voltages and ENTSO-E-style grid-code limits. Engineering students will recognise their syllabus
   and JEE students their NCERT numbers ("exam bridge" levels). No real load-flow game exists (Factorio and ONI power is
   toy-level).

### 1.4 Session shapes
| Platform | Typical session | Shape |
|---|---|---|
| Desktop (mouse+kb, 1080p-4K, ultrawide) | 30-90 min | 3-6 levels, or one long Sandbox build. Hover inspectors, hotkeys, side-by-side drawers (Build + Inspector + Timeline open at once). |
| Steam Deck (1280x800, pad) | 15-40 min | 2-4 levels. Snap-to-node cursor, radial build menu, one drawer at a time, bigger text (handheld layout). Day-run at 2x by default. |
| Phone (Pixel 9a 2424x1080 landscape, touch) | 5-12 min | One level per session (each designed to finish in 4-8 min, the day-run itself is 72 s at 1x). Tap-to-select, drag node→node to string a line, bottom sheets instead of side drawers, autosave on every build action and on pause. |

---

## 2. Loops, modes, campaign, levels

### 2.1 Core loop (one level)
```
 BRIEF (goal only, no formula) ─▶ SURVEY (map: towns, demand curve, sites, terrain, budget)
     ─▶ BUILD (place plants/storage, string lines, place substations/transformers, caps/reactors, set taps/droops/relays)
     ─▶ CHECK (live load flow while building: instant voltages/flows at the current hour; Engineer mode: N-1 study tool)
     ─▶ RUN THE DAY (96 x 15-min blocks; scripted + seeded events; you may intervene: switch caps, start peakers, shed load)
           └─ on any trip: BULLET TIME (seconds-scale dynamics + protection cascade, replayable)
     ─▶ RESULT: pass ★ / fail → WHAT HAPPENED (replay, first domino, plain words with your numbers) → WHY (Codex) → retry
     ─▶ OPTIMISE (cost, losses, reliability vs histogram; ★★, ★★★) → share Blackout Card / Result Card / design code
```
The world never leaves the screen: Build, Inspector, Timeline and Codex are drawers or overlays over the live 3D map.

### 2.2 Secondary loops
- **Operate loop (inside RUN):** alarms (amber: limit approached; red: timer running) invite a live intervention within the
  overload timer. At 1× a 15-min block is 0.75 s real, so a line at 112% (t_trip = 600/(1.12² − 1) ≈ 39 min game time,
  §3.9) would give only ≈ 2 s real. **Decided:** the first red alarm of a run drops the clock to **alarm speed 0.1×**
  (7.5 s per block, so that line gives ≈ 20 s real to act) in every mode; Learner additionally auto-pauses. The player can
  re-accelerate. Calm stretches (no amber/red alarm, no event in the next 4 blocks) run at the chosen speed; a setting
  "skip calm hours" (default on in Learner) runs them at 4×, so the day-run has no dead air.
- **Predict loop (exam bridges + optional everywhere):** before running, enter a predicted number (|V| at a bus, kA of a
  fault, Δf, λ). The sim then shows the truth; within tolerance earns the ★ "Called it". Numeric keypad on all platforms.
- **Replay/debug loop:** scrub the cascade, click any trip to see *why that relay saw what it saw* (current vs pickup curve,
  timer), then jump to the element and fix it.
- **Lab loop (Codex):** each Codex entry has an interactive mini-lab running the same engine (phasor rotator, P-δ curve,
  GS vs NR convergence plot, time-current curves, resonance sweep).

### 2.3 Meta-progression
- **Campaign map** of Lumen Province: 7 chapters light up regions of the province (delta island → district → river valley
  hydro → coal belt → state ring → interconnect). Completing a level lights its region at night on the campaign map. The
  map is the progress bar.
- **Parts unlock by chapter** (DC cable → transformers → caps → 3-phase gear → EHV lines/OLTC → governors/BESS →
  relays/breakers/markets). Sandbox unlocks all parts after Chapter 3; everything after the finale.
- **Engineer's licence:** grade per chapter = stars earned (Graduate Engineer → Engineer → Senior Engineer → Principal Engineer →
  Chief Engineer; titles come from the region pack).
- **Codex entries** unlock on first encounter (usually on first failure); a "Seen in your grid" badge links each to the
  level where you met it.
- No currency carried between levels (levels are self-contained puzzles; budget is per level). No loot, no ads, no timers.

### 2.4 Modes (chosen per save; can switch per level)
| | **Learner** | **Engineer** | **Sandbox** |
|---|---|---|---|
| For | Class 12/JEE, first-time players | EE undergrads, sim veterans | Everyone after Ch 3; teachers |
| Coach | Full coach steps from real state, hint ladder (3 hints per level), "Why" suggestions with sensitivities | Coach off after Ch 1; hint ladder available but costs the ★★★ | Off |
| Units shown | SI + plain words (kV, A, MW, "power factor 0.72 lagging") | SI + pu everywhere, angles, MVAr, X/R | Toggle |
| Dispatch / commitment | Auto (merit order) unless the level teaches it | Manual or auto | Both |
| Protection | Pre-set, coordinated defaults unless the level teaches it | Player sets | Both |
| Rewind | "Rewind 1 hour" after a failure (keeps attempt-first: you saw it fail) | No rewind; retry level | Free |
| N-1 | Shown as a test, not required for ★★★ except Ch 5+ | Required for ★★★ in Ch 5+ | Optional test button |
| Failure | Level fails; explanation, retry | Same, stricter tolerances (e.g. voltage band 0.95-1.05 instead of 0.94-1.06) | Never "fails"; logs ENS, cost |

> **Depth amendment (2026-11-10, user direction): see DEPTH.md.** Chapter 2 becomes *The Mainland Line* (district map with
> terrain that needs special equipment: supports, spans, sag/clearance, pile foundations, river crossings, insulator creepage,
> submarine cable); new jobs L29-L33 (Salt Wind, Bring the Island Home, The First Substation, Ring the Substations, Eyes on the
> Grid); networks persist across a chapter's jobs; service quality (SAIDI/SAIFI, unserved energy) joins cost in the score; the
> learning ladder runs from Class 9 (R1) to junior planning engineer (R6). DEPTH.md §7 is the authoritative chapter map.

### 2.5 Campaign: chapters mapped to syllabus
| Ch | Title (region) | Syllabus | Levels | Engine features introduced |
|---|---|---|---|---|
| 1 | **The Island** (Seaglass Delta) | Ohm, Kirchhoff, series/parallel, I²R, why voltage matters (Class 10-12 current electricity) | L01-L03 | DC nodal solve (MNA), cable resistance, brownout visual |
| 2 | **Alternating Current** (delta mainland) | AC generator/EMI, rms/peak, transformer turns ratio, HV transmission (NCERT XII ch 6-7) | L04-L06 | Machine bench, single-phase AC phasor MNA, transformer model, textbook mode |
| 3 | **Phasors & Power Factor** (mill town) | Reactance and impedance *of feeders and loads*, power factor, wattless current (NCERT XII ch 7); P/Q/S, capacitor banks, harmonics and grid resonance, series compensation (EE) | L07-L09 | Phasor overlay, PF correction, harmonic network solve at h·f₀ |
| 4 | **Three-Phase & Machines** (industrial belt + hydro valley) | 3-phase, Y/Δ, neutral current, synchronous generator, excitation, P-δ (EE) | L10-L13 | 4-wire phase-domain bench, SMIB swing dynamics, P-δ drawer |
| 5 | **Load Flow & Voltage** (state ring) | per-unit, load flow (GS/NR), transmission line models, Ferranti, OLTC, reactive power, voltage collapse (EE) | L14-L18 | Full NR load flow on the map, OLTC, shunt reactors/caps/STATCOM, P-V curve, N-1 tool |
| 6 | **Frequency & Renewables** (solar desert + pumped hydro) | inertia, swing, RoCoF, governor droop, reserves, UFLS, duck curve, storage (EE) | L19-L22 | System-frequency dynamics (RK4), governors incl. hydro, UFLS, BESS, solar/wind profiles |
| 7 | **Protection & Markets** (interconnect) | fault currents (symmetrical, SLG), breakers, IDMT coordination, transient stability/equal area, economic dispatch/merit order (EE) | L23-L27 | Zbus faults + sequence networks, relays/breakers, CCT, λ-dispatch with ramps and congestion |
| F | **Keep the Lights On** (whole state) | everything | L28 | 3-day finale with N-1 storm |

### 2.6 The v0.1 campaign: 28 level cards (22 must-ship, 6 stretch) + prologue
**How to read the level cards.**
- **Kind:** *Bench* is a small single-frequency circuit drawn in-world (a hut, a mill yard, a substation lab table), solved
  instantly while you drag. *Grid* is the map plus load flow plus the day-run. *Event* is a grid level whose test is a
  dynamic event in bullet time.
- **Stars:** ★ means the level's pass conditions hold for the whole run. ★★ adds primary metric ≤ target A. ★★★ adds
  primary ≤ target B *and* the secondary condition.
- **Targets A/B:** not hand-guessed. Each level's targets come from its bot population (§9.3): A = median, B = 15th
  percentile of the primary metric over passing bot designs. They are frozen into the level file and pinned by a test.
  The scenario numbers below are the design intent. The level author tunes them with the solver bot until the
  **lesson-gate test** holds: the *naive build* fails and the *lesson build* passes (§9.4).
- **Histogram:** the metric plotted on the result screen against **real players' verified solutions** (online leaderboard,
  §12). When the server has fewer than 20 verified solutions for a level/metric (or the game is offline with no cache),
  the histogram shows the bot population instead, clearly labelled "Bot population (offline estimate)". Star targets A/B
  never move with online data; they stay frozen from the bot population.
- Every level has a 2-line story beat from a cast member (names from the region pack; `global` names shown): **Ada Moreno**
  (retiring Chief Engineer, mentor, coach voice), **Tobi Hart** (control-centre night dispatcher, dry humour),
  **Commissioner Vance** (regulator: budgets, penalties), **Nia** (final-year school student in the island village whose
  final exams are the campaign's emotional thread), and townspeople. (NODE's cast uses different names; no cross-game reuse.)

**v0.1 tiers (reviewer decision, §10.1).** **Must-ship (22 + prologue):** P0, L01-L08, L10, L12, L14-L17, L19-L21,
L23-L26, L28. **Stretch (6, built only once M3 must-ship content passes its QA gate):** L09, L11, L13, L18, L22, L27.
Level ids keep their numbers so tests, oracles and docs stay stable; the campaign map simply hides unbuilt stretch
nodes (a chapter is complete when its must-ship levels are). Floor with every stretch cut: 22 levels + prologue.

#### Prologue
**P0 The Night the Lights Went Out** (interactive cold open, ≤ 90 s, skippable, replayable from the title)
- **Why:** minute-one spectacle and the campaign premise. The first-minute hook in the designer's draft was a 10-home
  hamlet; the first true cascade arrived only in Ch 5. The prologue puts the signature moment (bullet-time cascade, the
  hum sagging, the province going dark street by street) in the first 60 seconds.
- **Flow:** night, the full Lumen Province map lit (the L28 grid, scripted). Tobi Hart, the night dispatcher: "Line 7 is
  back from maintenance. Close the breaker, will you?" The player taps/clicks the one glowing breaker (the only legal
  action; coach-driven). Closing it re-routes flow onto an already-hot corridor; an overload timer rings, the clock drops
  into bullet time, three trips cascade, the frequency dial swings, UFLS stages fire and the province goes dark in 11 s.
  Silence, only the hum, then nothing. Ada Moreno: "It wasn't your fault. It was forty years of building it wrong. Start
  again, from the island." Cut to L01 at dusk.
- **Engine:** a normal scripted level on the finale network (no new systems): the closing action is the trigger, the
  cascade is the real §3.9 loop (its golden replay is a test). Autosave off; no stars; Blackout Card offered at the end
  ("your first blackout").

#### Chapter 1: The Island (DC)
**L01 First Light** (Bench, tutorial)
- **Goal:** light the 10-home hamlet at dusk from the solar+battery hut. Each home stays at ≥ 43.2 V (−10% of 48 V) from 18:00 to 23:00.
- **Teaches:** V = IR, current in a series loop, cable resistance R = ρ·2ℓ/A, brownout. The lesson is the size of the copper.
- **Scenario:** 48 V DC battery bank, an ideal source in v0.1. The homes are resistive, 48 W each at 48 V (10 in parallel = 4.8 Ω). The hut site can be anywhere on the beach strip, 120-300 m from the hamlet.
- **Parts:** 2-core Cu cable 2.5/4/6/10/16/25/35/50 mm² (IEC 60228 resistances); hut placement.
- **Constraints:** budget set by the §9.4 budget rule (design intent ≈ US$4k); poles every 40 m (auto); no cable through the mangrove (tiles blocked).
- **Failure modes:** brownout below 43.2 V, shown as lamps dimming (brightness ∝ V²/R, visible); cable overheating above ampacity; over budget.
- **Naive build:** cheapest 2.5 mm² at 300 m gives V_load = 24.9 V (oracle G-01b) and fails.
- **Lesson builds:** 25 mm² at 300 m (44.0 V), or 10 mm² with the hut moved to 120 m (43.98 V). Both pass. ★★★ (losses ≤ 5%) needs 50 mm² at 300 m or 25 mm² at 120 m.
- **Stars and histogram:** cost; ★★★ also needs losses ≤ 5%. Histogram: cost (US$).

**L02 Two Hamlets** (Bench)
- **Goal:** add a second hamlet of 14 homes, 450 m away in another direction, and keep both ≥ 43.2 V.
- **Teaches:** KCL at a junction (current arrows sum, shown numerically at the junction), series vs parallel paths, why a trunk carries the sum of currents.
- **Parts:** L01 cables; a junction box; optional second battery hut (expensive).
- **Constraints:** budget by the §9.4 rule (design intent ≈ US$9k).
- **Failure modes:** far hamlet brownout; trunk overheating (ampacity).
- **Naive build:** a thin shared trunk fails.
- **Lesson builds:** radial (two separate cables) vs trunk-plus-branch with a fat trunk. Both pass at different costs, which gives a real optimisation.
- **Stars and histogram:** cost; ★★★ also needs worst-home voltage ≥ 45 V. Histogram: cost.

**L03 The Price of Distance** (Bench, exam bridge lite)
- **Goal:** power the island school and health centre (5 kW) 1 km away. Line losses (I²R of the cable ÷ power delivered at its far end) must stay ≤ 5%; converter losses count in cost, not in this criterion.
- **Teaches:** P_loss = I²R = (P/V)²R. Raising V by k cuts losses by k² for the same copper. Introduces converters.
- **Parts:** cables up to 50 mm²; a DC-DC converter pair 48 V ↔ 380 V (η 97% each, real 380 V DC building-bus practice).
- **Prediction (optional):** "You raise the voltage 8×. By what factor do the line losses fall?" Answer 64.
- **Naive build:** 48 V needs I ≈ 104 A and R_loop ≤ 0.023 Ω, which is impossible with any catalogue cable. Fails.
- **Lesson builds at 380 V** (exact solve, reviewer-checked: the sending converter holds 380 V, the far converter is a
  constant-power load of 5 kW/0.97 = 5.155 kW; loop = 2 km; IEC 60228 resistances). The naive (P/V)²R estimate at 380 V
  gives 5.03 / 3.63 / 2.68% and is what the Codex shows as "the quick estimate"; the engine's number is the exact one:

  | Cable | V at far end | Line loss (exact) |
  |---|---|---|
  | 25 mm² | 359.1 V | 5.81% (fails) |
  | 35 mm² | 365.2 V | 4.05% (passes) |
  | 50 mm² | 369.2 V | 2.93% (passes ★★★ ≤ 3% with a thin margin; the level author must keep it, see §9.4 lesson gate) |

- **Stars and histogram:** cost; ★★★ also needs line losses ≤ 3%. Histogram: losses %.

#### Chapter 2: Alternating Current
**L04 Spin the Alternator** (Bench: machine bench)
- **Goal:** a micro-hydro on the delta's one waterfall must give 230 V rms ±2% at 50 Hz ±0.5% to the new AC village.
- **Teaches:** EMI. e₀ = NBAω, E_rms = e₀/√2 (rms vs peak: peak is 325 V), f = pN/120 (poles × rpm).
- **Scenario:** the turbine runs at a speed set by the water head (Francis runner, 500 rpm at this head).
- **Choices:** number of poles (2-24), turns per coil N, field B (excitation slider), coil area A.
- **Visual and audio:** a live oscilloscope hologram above the machine draws the waveform. The generator hum is pitched at 2 f, so changing poles or speed is heard as well as seen. This is the first appearance of the "hear the frequency" hook.
- **Failure modes:** wrong frequency (clocks and fans run wrong, shown as fan speed); over-voltage burns bulbs; under-voltage dims them.
- **Naive build:** 4 poles at 500 rpm gives 16.7 Hz and fails.
- **Lesson build:** 12 poles at 500 rpm gives 50 Hz, with N·B·A tuned for e₀ = 325 V.
- **Stars and histogram:** copper mass of the winding (cost proxy); ★★★ needs prediction of V_peak within 1%. Histogram: winding cost.

**L05 Step Up, Step Down** (Grid, single-phase-equivalent AC)
- **Goal:** the mainland village (200 kW at 0.9 pf evening peak) sits 15 km from the hydro bus. Keep it at 0.94-1.06 pu.
- **Teaches:** transformer turns ratio V₁/V₂ = N₁/N₂, I₁/I₂ = N₂/N₁, transformer rating (kVA), why HV.
- **Parts:** 400 V LV line or 11 kV line, on ACSR Weasel/Rabbit/Dog; distribution transformers 100/160/250/400/630 kVA at 11/0.42 kV (IEC 60076 preferred ratings; pack data).
- **Failure modes:** LV-only voltage collapse at the far end (current ≈ 321 A at 400 V); transformer overload (>100% for 2 h trips on thermal); over budget.
- **Naive build:** a 400 V line fails (≈ 321 A at the village).
- **Lesson build:** step up to 11 kV, step down at the village. Both 250 kVA and 400 kVA pass; ★★ prefers right-sizing.
- **Stars and histogram:** cost; ★★★ also needs losses ≤ 3%. Histogram: cost.

**L06 Exam Bridge: The Town Line** (Grid, textbook mode)
- **Goal:** NCERT's classic town line. 800 kW goes over a 15 km two-wire line at 0.5 Ω/km per wire (15 Ω loop), single-phase, unity pf.
- **Mode:** the level states "textbook mode: one phase, two wires, resistive line, ideal transformers" (Codex flag).
- **Step 1, predict:** the line loss at 4000 V. Answer 600 kW (oracle AC-15).
- **Step 2, run:** the town browns out, because 75% of the power is lost.
- **Step 3, build:** choose step-up/step-down transformer ratios to keep the loss ≤ 2%. 40 kV gives 0.75% (oracle AC-16).
- **Stars:** ★ prediction within 2%; ★★ loss ≤ 2%; ★★★ also cheapest transformer pair.
- **Histogram:** prediction error.

#### Chapter 3: Phasors & Power Factor
**L07 The Lagging Mill** (Grid)
- **Goal:** a rice mill (1.2 MW, induction motors, pf 0.70 lagging, 06:00-22:00) and a village (0.5 MW, pf 0.95) share a 4 km 11 kV feeder on ACSR Weasel (115 A). The substation bus is held at 1.03 pu. The feeder must not trip and the mill bus must stay ≥ 0.94 pu all day.
- **Teaches:** S = P + jQ, pf = cos φ, phasor of I lagging V, Q_c = P(tan φ₁ − tan φ₂) (≈ 0.83 MVAr here).
- **Wattless current:** at the 13:00 lunch break the mill motors idle (P ≈ 0.15 MW, Q ≈ 0.9 MVAr). The ammeter stays high while kW drops, and the phasor shows I nearly 90° behind V.
- **Parts:** capacitor banks 300/600/900 kVAr, fixed or auto-switched (switched costs 1.6×); reconductor Weasel→Rabbit (expensive alternative that also passes).
- **Failure modes:** feeder overload trip at the evening peak (122 A on a 115 A conductor); mill under-voltage (motors stall, the mill goes dark).
- **Naive build:** no caps gives 122 A, an overload trip at peak (checked with a 2-bus solve: V = 0.944 pu, loading 1.06).
- **Lesson builds:** ~900 kVAr at the mill bus gives 98 A at 0.957 pu, so it passes.
- **Fixed vs switched:** a fixed bank stays on at night with the mill off. The feeder then runs at a leading pf ≈ 0.56. The ★★★ condition requires |pf| ≥ 0.95 in every block, so fixed caps earn ★★ at most.
- **Stars and histogram:** cost; ★★★ also needs |pf| ≥ 0.95 in all blocks and feeder losses ≤ 4%. Histogram: losses.

**L08 Resonance at the Fifth** (Grid + harmonic bench)
- **Goal:** a textile factory with VFDs (6-pulse drives) joins the L07 feeder, and your capacitor bank starts blowing fuses. Keep voltage THD ≤ 5% at the 11 kV bus (IEEE 519 limit for 1-69 kV) and capacitor rms current ≤ 1.3× rated (IEC 60871), while holding pf ≥ 0.95.
- **Teaches:** LC resonance f_r = 1/(2π√LC). Parallel resonance order h_r = √(S_sc/Q_c) (oracle G-03: 50 MVA, 2 MVAr gives h = 5, 250 Hz). Detuned reactors (7% gives series resonance at h = 3.78, 189 Hz, oracle G-04). Q factor amplification.
- **Parts:** cap banks (from L07); detuning reactors 7% / 14%; relocate the bank; harmonic filter tuned at 4.7 (expensive).
- **Failure modes:** resonance amplifies the 5th harmonic, the cap fuse blows (bank drops out), pf collapses and the feeder overloads.
- **Visual:** the capacitor bank glows and bulges; spectrum bars appear in the Inspector; a waveform distortion overlay rides on the line.
- **Naive build:** keep the L07 bank and fail.
- **Lesson build:** a 7% detuned bank.
- **Stars and histogram:** cost; ★★★ also needs THD ≤ 3%. Histogram: THD.

**L09 The Hundred-Percent Trap** (Grid + scripted fault; **stretch**, §10.1. Replaces the designer's "Exam Bridge: LCR on
the Bench": the series-LCR bench, Q and bandwidth belong to **NODE** (its tickets 7-3 and 7-5), see §2.8.)
- **Goal:** a long 33 kV radial feeder to the hill quarry under-volts at peak. Add series capacitor compensation
  k = X_C/X_L ∈ {25, 40, 55, 70, 100%} so the far end stays ≥ 0.95 pu, and survive a scripted 3-phase fault at the
  quarry bus at 21:00.
- **Teaches (system scale):** series compensation cancels line reactance (voltage drop ΔV ≈ (RP + (X_L − X_C)Q)/V); the
  line + capacitor is a series LC circuit whose resonance moves towards 50 Hz as k → 100%; at k = 100% a fault behind
  the capacitor sees only R, so fault current soars past the feeder breaker's rating. Real practice keeps k ≈ 25-70%.
- **Failure modes:** k too low: far-end under-voltage at peak. k = 100%: the fault current exceeds the feeder breaker's
  rated breaking current and the breaker fails (§3.8 breaker-failure rule). The level author picks the breaker rating with
  the solver so that k ≥ 85% fails and k ≤ 70% passes (lesson-gate test). Series capacitor
  over-voltage protection (MOV bypass) is modelled as a bypass above 2.0 pu capacitor voltage (game value).
- **Naive build:** no compensation fails the peak. "Max it out" (100%) fails the fault.
- **Lesson build:** k = 40-70%.
- **Stars and histogram:** cost; ★★★ also needs far-end voltage ≥ 0.97 pu all day. Histogram: cost.
- The textbook LCR numbers (AC-09/10/11) stay as **engine oracles** of the bench MNA (§9.1) but are not a GRID level.

#### Chapter 4: Three-Phase & Machines
**L10 Balance the Phases** (Bench: 4-wire LV feeder)
- **Goal:** a 230/400 V (IEC 60038) three-phase four-wire street feeder serves 18 houses (single-phase loads 0.5-4 kW, pf 0.8-1.0, including ACs). Drag each house's service drop to phase a, b or c.
- **Pass conditions:** neutral current ≤ 20% of max phase current; every phase voltage at the far pole within 230 V ±10% (EN 50160 supply band; ★★★ needs ±5%); neutral within its rating.
- **Teaches:** balanced 3-phase sums to zero (I_a + I_b + I_c = 0), neutral current as a phasor sum (oracle G-05), neutral shift.
- **Failure modes:** a broken or over-current neutral shifts the star point. The lightly loaded phase over-volts and appliances fail (shown as TV sparks).
- **Naive build:** all houses on phase a fails.
- **Lesson build:** a greedy balance by kW and pf.
- **Stars and histogram:** neutral current (primary); ★★★ also needs feeder losses ≤ 3%. Histogram: I_N/I_max.

**L11 Star or Delta** (Bench)
- **Goal:** an industrial estate at 400 V has motors totalling 500 kW at pf 0.70. Correct to 0.95 using capacitors bought by µF (real LV capacitor units) and connect them Y or Δ.
- **Second goal:** start the 75 kW pump (DOL start draws ~6× current) without the voltage dipping > 10% at the estate bus (flicker complaint).
- **Teaches:** line vs phase quantities, P = √3·V_L·I_L·cos φ, C_Δ = C_Y/3 for the same kVAr (oracle PS-05), Y-Δ starter draws 1/3 of the DOL current.
- **Parts:** capacitor units in µF; DOL / Y-Δ starter / soft starter.
- **Failure modes:** under-correction; voltage dip trips other motors; over-voltage across Y-rated units if they are wired in Δ (the unit fails, shown in-world).
- **Stars and histogram:** cost; ★★★ also needs dip ≤ 6%. Histogram: cost.

**L12 Over the Hill** (Event: SMIB dynamics)
- **Goal:** the Kestrel Falls hydro (2 × 100 MW, H = 3 s) sends 200 MW over a 300 km 220 kV double circuit (Zebra, 210 MVA per circuit) to the city. Survive the scripted loss of one circuit at the 19:30 peak without losing synchronism.
- **Thermal limits are not binding by design:** 200 MW fits on one circuit. The lesson is the angle.
- **Rough numbers:** X'_d + GSU + line ≈ 0.34 pu pre-contingency and 0.47 pu post (100 MVA base), so P_max falls from ≈ 3.4 pu to ≈ 2.5 pu and the post-fault δ is ≈ 54°.
- **Teaches:** P = EV sin δ / X, P_max, excitation (E) and its effect on stability, steady-state limit, pole slip, series compensation.
- **Parts:** excitation set-point (AVR V_ref), 3rd circuit, series capacitor 30/50%, power reduction (re-dispatch).
- **Failure modes:** the first swing passes the unstable equilibrium; the out-of-step relay trips the plant; city frequency and voltage collapse.
- **Visual:** the generator's rotor angle phasor wheel in-world; the P-δ drawer shows the operating point riding the sine curve.
- **Naive build:** low excitation at full output fails the first swing.
- **Lesson builds:** raised excitation plus 30% series compensation, or a 3rd circuit.
- **Stars and histogram:** cost; ★★★ also needs post-event peak δ ≤ 70°. Histogram: peak δ. Final numbers are tuned with the searcher (§9.3).

**L13 Exam Bridge: Generator Phasors** (Bench)
- **Goal:** a cylindrical-rotor generator with V_t = 1.0 pu, I = 1.0 pu at pf 0.8 lagging, X_s = 1.2 pu.
- **Predict:** E (1.970 pu) and δ (29.17°), then P_max (1.642 pu) (oracles PS-27/28).
- **Task:** set the excitation so the generator absorbs 0.2 pu Q at night (under-excited) while δ stays < 60°.
- **Stars:** prediction ★; task ★★; both within 1% ★★★.
- **Histogram:** prediction error.

#### Chapter 5: Load Flow & Voltage
**L14 Per Unit, Please** (Grid)
- **Goal:** a radial chain 11 kV gen → 132 kV → 33 kV → three 11 kV towns. Keep every town bus at 0.95-1.05 pu (Learner 0.94-1.06) for all 96 blocks of a summer day.
- **Teaches:** the per-unit system (one diagram, many voltages; the pu toggle shows it), OLTC taps (±10% in 16 steps of 1.25%), tap direction, tap hunting between cascaded OLTCs.
- **Parts:** OLTC transformers (manual tap, or auto with set-point, deadband and time delay); one switched 5 MVAr cap; a voltage regulator.
- **Failure modes:** evening under-voltage; 03:00 over-voltage; tap hunting when both OLTCs share the same delay (the log shows tap changes each block, mechanism wear costs money).
- **Naive build:** fixed taps fail at either 19:00 or 03:00.
- **Lesson build:** auto-OLTC with a staggered delay (upstream fast, downstream slow).
- **Stars and histogram:** tap operations per day + cost; ★★★ also needs losses ≤ 2.5%. Histogram: tap ops.

**L15 The Long Line** (Grid)
- **Goal:** a 400 kV, 350 km single circuit (twin Moose) runs from the pithead coal plant to the load centre. Keep the receiving end within 380-420 kV (`global` grid-code band: 0.95-1.05 pu at 400 kV; 420 kV = IEC 60038 highest equipment voltage) at night and at peak.
- **Teaches:** distributed parameters, exact π model, Ferranti rise at light load (oracle PS-08/G-11), SIL, line charging MVAr, shunt reactors vs capacitors.
- **Parts:** line reactors 50/63/80 MVAr (switchable, bus or line), switched cap banks 50 MVAr, SVC ±100 MVAr.
- **Prediction:** the no-load receiving voltage.
- **Failure modes:** over-voltage at 03:00 (insulation flashover risk trips the line on over-voltage stage-1 relay at 110% for 5 s); under-voltage at 20:00.
- **Naive build:** no compensation fails at night.
- **Lesson build:** one 63-80 MVAr reactor at the receiving end plus switched caps.
- **Stars and histogram:** cost; ★★★ also needs ≤ 2 switching operations per day. Histogram: cost.

**L16 Loop Flow** (Grid)
- **Goal:** a 6-bus meshed 220 kV ring. A cheap new line (built by your predecessor) overloads every evening because power takes the low-impedance path. Run the day with no line above 100%; ★★★ also needs to survive the N-1 test.
- **Teaches:** power divides by impedance, not intention; Kirchhoff in meshes. The DC load-flow approximation P_ij ≈ (θ_i − θ_j)/x_ij is shown next to the full AC result in the Codex lab.
- **Parts:** new line (Zebra), HTLS reconductoring (2× ampacity, same X), open/close a line (topology switching), re-dispatch (move 100 MW between plants).
- **Failure modes:** thermal overload timer → trip → cascade onto the parallel path.
- **Naive build:** add capacity in the wrong place, then fail.
- **Lesson builds:** reconductor the overloaded line, *or* open a different line to re-route, *or* re-dispatch. Three valid styles.
- **Stars and histogram:** cost; ★★★ also needs N-1 secure. Histogram: max loading %.

**L17 Nose of the Curve** (Event)
- **Goal:** a city (320 MW peak, pf 0.92) fed by a 150 km 220 kV double circuit (`l220-twinzebra`, 420 MVA per circuit, so thermal never binds) from a stiff ring bus. Heatwave afternoon; one circuit trips at 15:00 (city at 300 MW). No voltage collapse, no ENS.
- **Teaches:** the P-V curve and maximum loadability (2-bus nose, oracle G-10). Capacitor Q ∝ V² (weak exactly when needed) vs a STATCOM (constant current). Reactive power doesn't travel well. UVLS.
- **Checked with a 2-bus continuation (exact π), re-run by the reviewer with the catalogue's derived twin-Zebra constants
  (r 0.0418, x 0.302 Ω/km, b 3.72 µS/km; the designer had used x 0.31, b 3.6, and the caps-only case sat 1 MW from the
  trip load, a knife edge, so the trip load moved from 285 to 300 MW):**

  | Remedy | Max loadability after N-1 | Result at 300 MW |
  |---|---|---|
  | None | 266 MW | collapses |
  | 80 MVAr fixed caps | 290 MW | collapses (−3%) |
  | ±100 MVAr STATCOM | 316 MW | passes, 5% margin |
  | ±200 MVAr STATCOM | 368 MW | passes, 23% margin (★★★) |
  | Local 100 MW peaker | — | passes |

  With both circuits in service the limit is 456 MW. The lesson gate (§9.4) re-verifies these with the engine.
- **Parts:** switched caps, STATCOM ±100/±200 MVAr, local gas peaker, UVLS stages.
- **Visual:** the P-V drawer shows the live operating point and the nose; the margin to the nose is a big number.
- **Failure modes:** NR divergence becomes the in-world *voltage collapse*. The continuation finds λ* < 1, the weakest buses' lights fade to dark, and the Codex explains the nose.
- **Naive build:** caps only fail.
- **Lesson builds:** STATCOM at the city bus, a local peaker, or caps plus UVLS (sheds 5% instead of collapsing; ★ only).
- **Stars and histogram:** cost; ★★★ also needs post-contingency margin ≥ 10%. Histogram: margin %.

**L18 Exam Bridge: Gauss-Seidel** (Bench on map)
- **Goal:** the 3-bus textbook system (slack 1.05∠0, PQ load 256.6 + j110.2 MW/Mvar, PV 200 MW at 1.05; data in §9.1 PS-14).
- **Predict (optional, each worth the "Called it" badge, never a gate):** V₂ after GS iteration 1 (1.0138∠−1.752°), the
  converged |V₂| (1.01334), slack P (62.57 MW).
- **Run:** the Codex lab animates GS vs NR on a log-mismatch plot (iteration counts come from the engine, not this doc).
- **Task (the actual level; reviewer change so the level is not a worksheet):** tonight a 60 MW + 30 Mvar load joins bus 2
  and |V₂| sags. Keep |V₂| ≥ 1.00 and every line ≤ 100% at the cheapest cost, using any of: the PV bus set-point (limited
  by its Q_max, so it cannot do it alone), a capacitor at bus 2, or a re-dispatch of bus 3.
- **Stars:** ★ task passes; ★★ cost ≤ A; ★★★ cost ≤ B and ≥ 2 predictions within 0.5%.
- **Histogram:** prediction error.

#### Chapter 6: Frequency & Renewables
**L19 Fifty Hertz** (Event: system frequency)
- **Goal:** the southern region, islanded for maintenance: ≈ 6.9 GW evening load, 12 coal units (500 MW, 588 MVA, H = 3.5 s), 4 hydro units (250 MW, 294 MVA, H = 3 s), solar (zero at 20:00). The largest unit (500 MW) trips at 20:00. ★ = no load shed: nadir ≥ 49.0 Hz (the `global` pack's first UFLS stage). ★★★ also needs nadir ≥ 49.2 Hz (the 800 mHz maximum-instantaneous-deviation design criterion, ENTSO-E SOGL style) and reserve fuel cost ≤ target B. Never reach 47.5 Hz (generator under-frequency trips, total blackout).
- **Teaches:** inertia constant H and RoCoF = ΔP·f₀/(2H·S) at t = 0⁺ (oracle PS-23), the nadir, droop sharing Δf = −ΔP/(Σ1/R + D) (PS-25/26), spinning reserve, the hydro turbine's initial inverse response (G-13), UFLS.
- **Checked with the §3.6 model (RK4 10 ms, offset deadband ±10 mHz, 6-stage `global` UFLS with 200 ms delay; reviewer
  worker re-tuned for the `global` pack, script in REVIEW.md):**

  | Commitment | RoCoF at 0⁺ (analytic = RK4 slope) | Nadir | UFLS |
  |---|---|---|---|
  | Minimum commitment: 12 coal ≈ 491 MW + 4 hydro 225 MW (naive) | −0.478 Hz/s (H_sys 3.42 s, 7,644 MVA) | 48.94 Hz (48.939 with the offset dead-zone, DECISIONS #5) (48.07 Hz without UFLS) | stage 1 sheds 345 MW |
  | 13th coal unit spinning, headroom spread (12 × ≈ 453 MW) | −0.443 Hz/s | 49.59 Hz | none |
  | 13th unit + 200 MW 1%-droop FFR BESS | −0.443 Hz/s | 49.67 Hz | none |

  Robustness: the naive build's post-trip headroom is only 100 MW against a 500 MW trip, so it sheds for any deadband,
  damping (1-2), T_W or hydro dispatch; at 6.7 GW it would sit on the 49.0 Hz knife edge, hence 6.9 GW. BESS alone needs
  ≥ 250 MW to pass (200 MW gives 49.03 Hz, too thin): the level offers BESS in 50 MW steps up to 300 MW.

- **Parts:** commitment (keep extra units spinning at part load: costs fuel), droop per unit 3-6%, reserve allocation, UFLS stage → feeder mapping (protect the hospital), BESS FFR 50-200 MW.
- **Prediction:** RoCoF at t = 0⁺ (the analytic initial slope; the HUD's RoCoF arrow is the 500 ms window slope, which is smaller, and the card says so).
- **Failure modes:** UFLS sheds towns (windows go dark in stages); a cascade below 47.5 Hz.
- **Naive build:** minimum commitment fails ★ (sheds stage 1, 345 MW).
- **Lesson build:** headroom ≥ the largest unit, spread across droop-responsive units, or FFR.
- **Stars and histogram:** fuel cost of reserve; ★★★ also needs nadir ≥ 49.4 Hz with no shedding. Histogram: nadir Hz.

**L20 Sun Goes Down** (Grid)
- **Goal:** a high-solar day: 3 GW solar, net-load evening ramp ~40 MW/min at 17:30. Serve all demand with block frequency inside the standard frequency range (50 Hz ± 50 mHz, ENTSO-E SOGL style) in ≥ 95% of blocks, never outside ± 200 mHz (max steady-state deviation).
- **Teaches:** the duck curve, ramp rates (coal ~1-3%/min, gas 3-10%/min, hydro 50%/min+), min stable load (the pack's coal technical minimum: 40% in `global`, 55% in `in`), storage arbitrage, curtailment.
- **Parts:** OCGT peakers, pumped-storage hydro (generate/pump), BESS 2 h / 4 h, solar curtailment, demand response (irrigation pumps shifted to noon).
- **Failure modes:** the ramp shortfall shows up as frequency excursions; at noon, over-generation below the coal minimum forces curtailment or over-frequency.
- **Naive build:** coal-only fails the ramp.
- **Lesson builds:** BESS/pumped hydro charging at noon, plus shifting irrigation pumps to noon (real practice in several sunny grids: daytime-only solar agricultural feeders).
- **Stars and histogram:** daily cost; ★★★ also needs curtailment ≤ 5%. Histogram: cost.

**L21 Inertia Matters** (Event)
- **Goal:** noon, 70% inverter-based generation. A 500 MW trip. Legacy rooftop PV inverters trip on RoCoF > 1.0 Hz/s (game rule modelled on legacy anti-islanding settings, flagged), which turns a small trip into a cascade (inspired by South Australia 2016). Keep RoCoF ≤ 1.0 Hz/s and the nadir ≥ 49.4 Hz.
- **Teaches:** H_sys = ΣH_i·S_i/S_sys falls as synchronous units go offline. Synthetic/fast frequency response. Synchronous condensers. Must-run.
- **Parts:** synchronous condenser (H = 1.5-2 s on rating, no fuel), grid-forming BESS (FFR within 0.2 s), keep a coal unit at minimum (must-run cost + curtailment), ride-through upgrade for rooftop PV (policy, costly).
- **Naive build:** cheapest dispatch (all coal off) fails.
- **Lesson build:** any mix that keeps the inertia/FFR above threshold.
- **Stars and histogram:** cost; ★★★ also needs nadir ≥ 49.6 Hz. Histogram: RoCoF.

**L22 Exam Bridge: Droop & RoCoF** (Bench)
- **Predict:** (a) RoCoF for a 500 MVA, H = 5 s machine at 60 Hz losing 0.2 pu balance (1.200 Hz/s, PS-23, the textbook uses 60 Hz); (b) Δf for R = 0.05, D = 0.8, ΔP = 0.01 pu (−0.02404 Hz, PS-25); (c) sharing between G1 500 MVA at 4% and G2 300 MVA at 5% for +100 MW (Δf −0.2703 Hz, 67.57/32.43 MW, PS-26).
- **Run:** each case plays on the frequency dial.
- **Task:** set droops so two units share a load step 60:40.
- **Stars:** per prediction.
- **Histogram:** prediction error.

#### Chapter 7: Protection & Markets
**L23 Fault Level** (Event: protection)
- **Goal:** a 33 kV industrial substation. A new 2 × 25 MW captive generator raises the fault level. A scripted 3-phase fault at the busbar must be cleared by the nearest breaker; no breaker may see more than its rated breaking current.
- **Teaches:** Thevenin, symmetrical fault current I_f = V/Z_th (oracle PS-17), fault MVA, parallel sources raise fault level (G-18), sub-transient reactance, current-limiting measures.
- **Parts:** breakers 25/31.5/40 kA (IEC 62271-100 R10 series), series reactor, bus-coupler open (split bus), higher-%Z transformer.
- **Prediction:** fault current in kA.
- **Failure modes:** an under-rated breaker fails to interrupt (explodes, shown in-world). Backup protection clears the whole substation 0.5 s later, blacking out the estate.
- **Naive build:** keep the 25 kA breakers and fail.
- **Lesson builds:** 31.5 kA breakers, or split the bus, or add a reactor (each with trade-offs: losses, reliability).
- **Stars and histogram:** cost; ★★★ also needs prediction within 2%. Histogram: cost.

**L24 Coordination** (Event)
- **Goal:** a radial 11 kV feeder with 4 overcurrent relays (R1 at the substation … R4 at the far end). Set pickup (≥ 1.25× max load current) and TMS on IEC curves so every one of 6 scripted faults is cleared by the nearest upstream relay, and each upstream relay is ≥ 0.3 s slower (CTI) at the max fault current it shares.
- **Teaches:** IDMT t = TMS·k/((I/I_s)^α − 1) (oracles G-06/G-07), grading, selectivity vs speed, the conductor I²t limit.
- **Parts:** relay settings (pickup, TMS, curve SI/VI/EI), fuse at the spur.
- **Visual:** the time-current drawer (log-log) shows the curves and fault lines.
- **Failure modes:** mis-coordination trips the upstream relay and the whole feeder goes dark; too slow, the conductor anneals and the line burns (I²t > limit).
- **Naive build:** identical settings everywhere fail.
- **Lesson build:** graded TMS (e.g. 0.05/0.15/0.25/0.35 at shared currents).
- **Stars and histogram:** sum of clearing times; ★★★ also needs ENS from faults = 0. Histogram: total clearing time.

**L25 Clear It in Time** (Event: transient stability)
- **Goal:** a 400 kV line fault near the Kestrel Falls hydro (SMIB equivalent: P_m = 0.8, P_max = 1.8 pre/post, H = 5 s). Choose relay + breaker so clearing time < the critical clearing time. Textbook case: δ_cr = 84.77°, t_cr = 0.260 s at 60 Hz, oracle PS-24. The level runs at 50 Hz with its own scenario numbers; the 60 Hz case is in L27.
- **Teaches:** the swing equation, the equal-area criterion, critical clearing angle/time, why breaker speed (cycles) matters.
- **Parts:** distance relay zone-1 (instantaneous, 20-30 ms) vs IDMT; breakers 2-cycle vs 3-cycle vs 5-cycle; auto-reclose on/off; fast valving (v0.2).
- **Visual:** the P-δ drawer fills acceleration area A1 and deceleration area A2 live during bullet time.
- **Prediction:** the critical clearing angle.
- **Failure modes:** slow clearing, the rotor slips a pole, and the plant trips out-of-step.
- **Naive build:** an IDMT relay with a 5-cycle breaker fails.
- **Lesson build:** zone-1 with a 3-cycle breaker passes.
- **Stars and histogram:** cost; ★★★ also needs a margin (t_cr − t_clear) ≥ 50 ms. Histogram: margin ms.

**L26 Merit Order** (Grid)
- **Goal:** run a 24-hour dispatch for 6 plants: subcritical coal, supercritical coal, CCGT, OCGT, hydro with a daily energy budget, solar. Minimise total cost with no ENS, respecting ramps, min stable load (pack technical minimum) and a 220 kV corridor limit.
- **Teaches:** equal incremental cost (λ), merit order, why the expensive peaker runs at 19:00, congestion (the corridor splits λ into two prices: LMP preview), hydro energy as an opportunity cost.
- **Parts:** dispatch schedule (blocks × plants), auto-λ button (Learner), commitment, penalty factors toggle (Engineer: losses via the load flow).
- **Prediction:** λ at 20:00.
- **Failure modes:** an infeasible schedule (ramp/min-load) produces imbalance, frequency excursion and ENS; congestion overload trips the corridor.
- **Naive build:** "cheapest first" ignoring the corridor fails at 20:00.
- **Lesson build:** congestion-aware dispatch.
- **Stars and histogram:** daily cost (US$); ★★★ also needs cost within 1% of the engine's optimal λ-dispatch. Histogram: cost.

**L27 Exam Bridge: Faults & λ** (Bench)
- **Predict:** 3-phase fault kA (PS-17), SLG kA (PS-18), the λ and dispatch of the 3-unit example (PS-20), the limits-binding case (PS-21), and (Engineer) the with-losses case (PS-22). Also the 60 Hz CCT case (PS-24).
- **Run:** each plays as a short animated case on the map.
- **Task (reviewer change: a level must have a build, not only predictions):** the L23 substation grows. Choose breaker
  ratings for the fault levels you just predicted (an under-rated breaker fails the scripted fault) and set tonight's
  3-unit dispatch to meet demand at minimum cost within limits.
- **Stars:** ★ task passes; ★★ cost ≤ A; ★★★ also ≥ 4 predictions within tolerance.
- **Histogram:** prediction error.

#### Finale
**L28 Keep the Lights On** (Grid + Events, 3-day run)
- **Scenario:** the whole state (26 buses, 400/220/132 kV, 9 plants incl. solar/wind/pumped hydro/BESS, 12 towns, the Gigawatt Inc. AI datacenter load at 300 MW flat as a franchise nod).
- **Day 1, heatwave:** record peak and voltage stress.
- **Day 2, wet-season storm:** three scripted N-1 trips (a 400 kV line, the largest unit, a 220 kV ICT) plus a lightning SLG fault.
- **Day 3, holiday high-solar low-demand:** over-voltage and low inertia.
- **Budget:** a reinforcement budget in US$ M, set by the §9.4 budget rule.
- **Story stakes:** Nia's final exam is on the morning of Day 3. Her island feeder must not lose supply on the night of Day 2.
- **Stars:** ★ ENS ≤ 0.1% and the island never dark; ★★ cost ≤ A; ★★★ cost ≤ B, zero standard-frequency-range violations ≥ 15 min and losses ≤ 3%.
- **Histograms:** cost, ENS, losses (three tabs).

### 2.7 Sandbox (v0.1)
- **Scenarios:** "Blank state" (a 60-bus capacity map), "Lumen 2030" (the finale grid + 40% solar), "Island" (DC/AC microgrid).
- **Freedom:** any part; the 15-min day-run with editable demand/weather; a contingency tool (trip anything, inject a fault anywhere); all drawers and labs; weather seed.
- **No money failure.** Costs are logged for self-challenge.
- **Career/tycoon** (multi-year expansion, tariffs, regulator) is **v0.2** (§10).
- "Blank state" is stretch (§10.3); "Lumen 2030" and "Island" are must-ship.

### 2.8 GRID vs NODE: the boundary (reviewer decision, binding for both teams)
Both games teach AC circuits. They must feel like different games and must not duplicate levels.

| | **GRID** (this game) | **NODE** (node-circuits) |
|---|---|---|
| Scale | **System**: buses, lines km long, plants, substations, MW/MVAr, kV, pu | **Component**: a perfboard, parts, mA/V, µF, Ω |
| Time scale | 50 Hz phasor steady state + electromechanical seconds (frequency, swings) + 15-min operation | Transients (RC/RL/LC ringing), waveforms, Bode sweeps |
| AC content GRID owns | power factor and capacitor banks at feeder scale; transformers as network elements (taps, %Z, ratings); 3-phase Y/Δ, neutral current; harmonics and *grid* resonance (h = √(S_sc/Q_c)), series compensation; generators, load flow, stability, protection | — |
| AC content NODE owns | — | reactance as a part property; series LCR resonance, Q and bandwidth (its 7-3, 7-5); filters; rectifiers and the mains wall-wart transformer; op-amps |
| Shared, framed differently | Phasors (GRID: V and I at a bus, power triangle); NCERT AC formulas as oracles of the solver | Phasors (NODE: across parts on the scope) |

Consequences applied in this doc: the designer's L09 "LCR on the Bench" is replaced by a system-scale series-compensation
level; Codex entries 12-15 are reframed at feeder scale and the LCR bench lab is dropped (NODE has it). The AC-0x textbook
oracles stay as solver tests in both games (that is shared physics, not shared content). The two Codexes share the
phasor-convention wording (φ = angle by which V leads I) so a student playing both is never contradicted. Cast names do
not overlap (the designers had both used "Meera").

---

## 3. Simulation model

### 3.1 Time model (decided)
Power systems have separated time scales (Kundur ch. 1): electromagnetic transients (µs to ms), electromechanical swings
(0.1-10 s), governors and reserves (s to min), dispatch and economics (15 min to days). GRID simulates three of them, each with
the right model, and never the electromagnetic one (phasor model throughout: simplification **S2**).

| Clock | Step | Model | Used for |
|---|---|---|---|
| **Build** | none (paused) | One instant AC load flow at the current block, re-run on every edit (debounced 100 ms) | Live feedback while placing and sizing |
| **Operator** | **15-minute block** (96 per day) | Quasi-steady state: demand, weather, commitment, dispatch, then a full AC load flow, then limit checks and timers | The day-run, economics, voltage, thermal limits, block frequency |
| **Event** | **10 ms RK4** for frequency (window ≤ 60 s); **1 ms RK4** for SMIB angle (window 3 s); 10 s quasi-static sub-steps for the thermal cascade | Swing equation + governors + UFLS + protection timers; LF re-solved at each topology change | Bullet time: trips, faults, cascades |

**Why 15 minutes:** it is the real imbalance-settlement period in Europe (EU EB GL, 15-min ISP) and in India, so the
operator clock teaches a real practice. It resolves the evening ramp (L20) with 8 blocks per 2 h and costs only
96 load flows per in-game day. At 1× a day plays in **72 s** (0.75 s per block); speeds 0.5×/1×/2×/4×/pause; Learner
auto-pauses on the first red alarm.

**Why a separate event clock:** frequency nadir and RoCoF happen in 2-10 s and protection in 20 ms-1 s. Stepping the whole
day at 10 ms would be 8.6 M steps, impossible on a phone and unreadable for a player. Instead a trip *opens a window*: the
game freezes the operator clock, plays the window in bullet time (0.25× to 1× real time, player-controlled), records it as
a replay, and resumes the operator clock with the post-event state. A day without events costs nothing extra.

### 3.2 Per-unit and conventions
- S_base = 100 MVA three-phase. V_base = nominal line-to-line kV of each zone. Z_base = kV²/MVA (Ω). I_base = MVA/(√3·kV) (kA).
- Transformer ratios are chosen to match zone bases, so ideal transformers vanish in pu. Off-nominal taps remain as `τ`.
- Bench levels (Ch 1-4 benches) work in SI volts/amps/ohms with complex rms phasors. The Inspector converts on demand.
- Every UI number is computed by an engine query. Godot never computes physics.

### 3.3 Network elements and their equations

**Bus** `i`: complex voltage V_i = |V_i|∠θ_i (pu). Types: **slack** (one per energised island: |V|, θ fixed), **PV**
(P, |V| fixed, Q within limits), **PQ** (P, Q fixed).

**Branch** (line or transformer): unified π model (MATPOWER manual, §3.2). Series admittance y_s = 1/(r + jx), total shunt
charging b_c, tap ratio magnitude τ, phase shift θ_sh (0 in v0.1):

```
Y_ff = (y_s + j b_c/2) / τ²       Y_ft = −y_s / (τ e^{−jθ_sh})
Y_tf = −y_s / (τ e^{+jθ_sh})       Y_tt =  y_s + j b_c/2
```
- **Line from catalogue:** per-km z = r + jx (Ω/km), y = jb (S/km), length ℓ (km) = path length on the map (straight
  segments between waypoints × 1.0; terrain only affects cost).
- **Exact equivalent π** for every line (no short/medium/long switch, so no discontinuity):
  γ = √(z·y), Z_c = √(z/y), Z' = Z_c·sinh(γℓ), Y'/2 = tanh(γℓ/2)/Z_c, converted to pu.
  For ℓ → 0 this reduces to the nominal π. The textbook short, nominal-π and long ABCD forms exist as separate pure
  functions (`lineABCD(kind)`) for the Codex labs and the exam-bridge oracles (PS-06/07/08). They are not used in the grid solve.
- **Conductor resistance in grid levels:** r = R_dc,20°C × 1.24 (temperature rise to ~75 °C at α_Al = 0.00403/°C, plus
  ~2% skin effect). This is simplification **S16** (no conductor thermal state). Bench/textbook levels use the stated R exactly.
- **Transformer:** x_t = (%Z/100)·(S_base/S_rated), r_t = x_t / (X/R), no-load loss as shunt conductance at the HV
  side (G = P_nl/S_base pu). Magnetising susceptance is neglected (**S18**).
- **Tap convention (decided; shown in the UI as "LV boost"):** HV is the *from* side. Tap position n ∈ [−8, +8],
  step 1.25%, τ = 1 − 0.0125·n. So **+n raises the LV voltage**. Oracle G-17: τ = 1.05 lowers |V₂| from 0.97825 to
  0.92934 for a 0.5 + j0.2 pu load behind x = 0.1 pu.

**Shunts:** capacitor/reactor bank of rating Q_r (MVAr at rated kV) is a constant susceptance b = ±Q_r/S_base (pu), so
the delivered Q = Q_r·|V|². Switched banks have n steps.
- **SVC:** PV-like within [B_min, B_max]. At a limit it becomes a fixed susceptance (Q ∝ V²).
- **STATCOM:** PV-like within ±I_max. At a limit it delivers Q = I_max·|V| (constant current). That is why it beats caps at the nose (L17).

**Loads:** P = P₀·(a_Z|V|² + a_I|V| + a_P), likewise Q (ZIP). Catalogue default for every demand class is constant power
(a_P = 1), the textbook load-flow assumption, which also makes voltage collapse honest (**S5**). Frequency sensitivity
appears only in the event model (damping D). Fault studies neglect loads (textbook practice, **S5**).

**Generators:**
- **Synchronous unit:** PV bus with [P_min, P_max] and [Q_min, Q_max] from the catalogue capability (rectangular in v0.1, **S21**).
  Event data: H, X''_d, X'_d, droop R, governor type.
- **Inverter-based (PV, wind, grid-following BESS):** a PQ injection with Q capability ±0.33·P_rated (pf 0.95 at rated). Default
  mode is unity pf; the player can switch it to V-control. These units **cannot form an island** (see 3.4).
- **Grid-forming BESS (unlock Ch 6):** it can be an island's slack and provides virtual inertia H_v.

### 3.4 Load-flow solver (Newton-Raphson, polar)
Injection equations (pu), G + jB = Y_bus, θ_ik = θ_i − θ_k:
```
P_i = Σ_k |V_i||V_k| (G_ik cos θ_ik + B_ik sin θ_ik)
Q_i = Σ_k |V_i||V_k| (G_ik sin θ_ik − B_ik cos θ_ik)
mismatch: ΔP_i = P_i^sched − P_i(V,θ) for PV+PQ;  ΔQ_i = Q_i^sched − Q_i(V,θ) for PQ
```
Unknowns: θ for PV+PQ buses and |V| for PQ buses. Use the analytic Jacobian [H N; M L] (Glover/Sarma/Overbye §6.6
formulas, |V|-scaled form). Solve J·Δx = F with **core real dense LU with partial pivoting**.

1. **Start:** warm start from the previous block's solution. Retry once from flat start (|V| = 1 or set-point, θ = 0).
2. **Damping:** backtracking line search on ‖F‖₂. α ∈ {1, ½, ¼, …, 1/64}; accept the first α with ‖F(x+αΔx)‖₂ ≤ (1 − 10⁻⁴α)‖F(x)‖₂.
3. **Convergence:** ‖F‖_∞ < 10⁻⁸ pu (1 W at 100 MVA). At most 25 iterations.
4. **Q limits (outer loop, ≤ 4 passes):** a PV bus beyond Q_max/Q_min becomes PQ at the limit. It goes back to PV only if
   |V| crosses its set-point in the recovering direction. A bus may switch at most twice per solve (hysteresis, no ping-pong).
5. **Islands:** after every topology change, run union-find over in-service branches.
   - An island with ≥ 1 online synchronous unit or grid-forming BESS gets a slack: the unit with the largest
     (P_max − P) headroom, ties broken by id (**S11**: single slack).
   - An island with only grid-following inverters, or nothing, is **de-energised**: all its load counts as ENS. That is a lesson in itself (L21, L28).
6. **Divergence handling, the voltage-collapse mechanic:** if NR fails twice, run a load-scaling continuation.
   - Scale every load (and the matching dispatch) by λ ∈ [0, 1]. Bisect 10 times for the largest convergent λ\*.
   - λ\* < 1 means **voltage collapse**. The engine then sheds load in 5% steps at the buses with the largest dV/dλ
     (from the last convergent Jacobian), the "collapse sheds", until the case converges, and logs everything.
   - The player sees the weakest towns fade to dark. Divergence is never a crash: it is a physical event with a cause.
7. **Gauss-Seidel** (with optional acceleration factor) is implemented only for the L18 exam bridge, the Codex lab
   (side-by-side convergence plot) and the oracle tests. It is never used in play.
8. **DC load flow** (B'θ = P) is implemented for the L16 Codex lab ("the approximation vs the truth"). It is not used in play.
9. **Outputs per solve:** V, θ per bus; S_from, S_to, I, loading per branch; losses per branch and total; slack P/Q;
   Q at PV units; the Jacobian (kept for sensitivities: dV/dQ for coach hints, loss sensitivities for penalty factors).

### 3.5 Bench solver (complex modified nodal analysis)
Bench levels (L01-L04, L06, L08-L11, L13) and the in-level harmonic analysis use **complex MNA** at a single angular
frequency ω, with **core complex LU**:
- Elements: R; L (jωL); C (1/(jωC)); ideal transformer (MNA coupled rows); voltage sources with internal impedance;
  current sources; constant-impedance loads (Z from P, Q at nominal V); converters (ideal power-conserving DC-DC with η).
- **DC (Ch 1):** ω = 0, with inductors as shorts and capacitors open. Loads are resistive (bulb-like); **S22** says real LED drivers
  are constant power, and this is cross-referenced to the L17 voltage collapse.
- **Harmonics (L08):** superposition. For each h ∈ {5, 7, 11, 13} solve the network at h·ω (X_L → hX_L, X_C → X_C/h) with
  the drive modelled as a current source I_h = I₁·(1/h) (6-pulse "1/h" spectrum, **S12**). Outputs:
  V_h, THD_V = √(Σ V_h²)/V₁, capacitor rms current √(Σ I_h²), and a frequency sweep 50-1000 Hz in 5 Hz steps
  (191 solves, < 5 ms) drawn as an impedance-vs-frequency plot with the resonance peak marked.
- **4-wire unbalanced (L10):** phase-domain nodes a, b, c, n per pole. Neutral conductor impedance comes from the catalogue;
  the transformer star point is earthed through 1 Ω (**S23**). Outputs: phase-to-neutral voltages, I_N = I_a + I_b + I_c,
  neutral shift.
- **Machine bench (L04):** closed form, e(t) = NBAω sin ωt, f = p·N_rpm/120.

### 3.6 Frequency dynamics (event window)
States, all deviations from the pre-event operating point:
- system speed deviation Δω (pu, centre of inertia)
- per synchronous unit: governor valve v_i, plus reheat r_i (steam) or water state w_i (hydro)
- per BESS: P_b
- discrete: UFLS stage flags, relay timers, unit online flags

```
Inertia:   S_sys = Σ_online S_i (+ condensers + grid-forming BESS);   H_sys = Σ H_i S_i / S_sys            [s]
Swing:     2 H_sys dΔω/dt = (Σ ΔPm_i + Σ P_b − ΔP_e) / S_sys − D_sys Δω                              [pu/s]
           ΔP_e = disturbance step (MW, + for lost generation or added load) − shed load (MW)
           D_sys = D_load · P_load(t) / S_sys,  P_load(t) = pre-event load − shed so far,  D_load = 1.5 (%ΔP per %Δf; S24)
Steam:     T_G dv_i/dt = −(S_i/R_i)·Δω − v_i ;   T_RH dr_i/dt = v_i − r_i ;   ΔPm_i = F_HP v_i + (1−F_HP) r_i
           T_G = 0.2 s, T_RH = 7 s, F_HP = 0.3   (Kundur §9.2 typical; S25)
Gas (OCGT/CCGT GT): T_G dv_i/dt = −(S_i/R_i)·Δω − v_i ;  ΔPm_i = v_i,  T_G = 0.5 s
Hydro:     T_G dv_i/dt = −(S_i/R_i)·Δω − v_i ;  ΔPm_i = −2 v_i + w_i ;  0.5 T_W dw_i/dt = 3 v_i − w_i
           ⇔ classical non-minimum-phase turbine (1 − T_W s)/(1 + 0.5 T_W s); T_W = 1.5 s; T_G = 0.5 s
           permanent droop only (no transient-droop compensator; S26)
BESS FFR:  T_B dP_b/dt = −(S_b/R_b)·Δω − P_b ;   T_B = 0.2 s (grid-following) ; 0.05 s + H_v (grid-forming)
Deadband:  offset dead-zone (no jump): Δω_e = sign(Δω)·max(0, |Δω| − db); db from the pack (`global`: 10 mHz, the
           FCR frequency-response insensitivity, ENTSO-E SOGL style); db = 0 in oracle/exam cases
Limits:    ΔPm_i ∈ [P_min,i − P0_i, P_max,i − P0_i] (headroom is the reserve) ; P_b ∈ [−P_rated, P_rated] and SoC
Inverter PV/wind: no inertia, no droop (S10)
Frequency: f = f₀·(1 + Δω) Hz, f₀ from the pack (50 Hz in `global`; the engine supports 60 Hz) ;
           RoCoF shown = 500 ms moving-window slope ; RoCoF₀ = analytic t = 0⁺ value (predictions, P17)
```
Integration and events:
- **RK4 with dt = 10 ms.** The fastest constant is 0.05 s and RK4's real-axis stability limit is ≈ 2.79·τ, so 10 ms
  leaves a 14× margin. Oracle G-12: RK4 matches the analytic matrix-exponential solution to 10⁻⁶ Hz.
- **Window:** ends at 60 s, or once t > 20 s and |dΔω/dt| < 10⁻⁵ pu/s.
- **Thresholds** (UFLS stage, RoCoF relay, under-frequency trip) are checked each step. The crossing time is
  linearly interpolated inside the step and logged. Delayed actions (relay + breaker) start a timer at the crossing
  time; the action applies at the end of the step in which the timer expires (±10 ms, **S27**). A stage whose frequency
  recovers above its threshold before its timer expires still operates (relays latch once picked up: game simplification
  noted in S27).

Protection acting in the window (values from the pack's grid code, §4.7; `global` shown):
- **UFLS (`global`: ENTSO-E NC ER Continental-Europe style LFDD):** 6 stages at 49.0 / 48.8 / 48.6 / 48.4 / 48.2 / 48.0 Hz
  shedding 5 / 8 / 8 / 8 / 8 / 8% of demand (45% total). Each stage sheds its mapped feeders. Relay delay 100 ms + breaker
  100 ms (game values). Pumped storage in pump mode and BESS in charging mode disconnect just before stage 1. The
  stage list is pack data (the draft `in` pack keeps its own 4 stages, Appendix A).
- **Generator under-/over-frequency trip:** < 47.5 Hz for 0.5 s; > 51.5 Hz for 2 s (game values, **S28**).
- **Legacy DER RoCoF trip** (L21, L28): rooftop/legacy PV marked "no ride-through" trips at |RoCoF| > 1.0 Hz/s (**S29**).
- **Re-solve on trip:** any unit trip during the window adds its P to ΔP_e and removes its H and droop. Any branch trip
  re-runs the load flow with the current ΔPm as new set-points. That makes a cascade.

**Decoupling (S19):** voltage magnitudes are not integrated in the window. The P-f and Q-V loops are treated as
decoupled, and voltages come from load flows at window start, window end and at each topology change.

**Block frequency (operator clock, no event).** Each block computes the quasi-steady primary-response frequency:
```
β = Σ_{units not at a limit} (S_i / R_i) / 50  +  D_load·P_load/50      [MW/Hz]
Δf_block = −ΔP_imb / β,  ΔP_imb = scheduled demand + losses − deliverable generation (ramp/limit shortfall)   [Hz]
```
This is iterated: units pushed to a limit leave β. It produces the standard-frequency-range metric of L20/L28. There is no AGC/secondary
control in v0.1 (**S9**); the next block's dispatch is the correction.

### 3.7 Rotor-angle stability (SMIB, L12 and L25)
Classical model (**S4**): constant E' behind X'_d, infinite bus V∠0, D = 0 in tests.
```
dδ/dt = ω_s (ω − 1) ;   2H dω/dt = P_m − P_e(δ) ;   P_e = E'V sin δ / X_eq(stage)          (ω_s = 2πf₀ rad/s)
```
- **X_eq per stage** (pre-fault, during fault, post-fault) comes from Kron reduction of the stage's Y_bus to the generator
  internal node and the infinite-bus node (city slack equivalent). Complex LU is used.
- **Integration:** RK4 with dt = 1 ms over a 3 s window.
- **Loss of synchronism:** δ exceeds the post-fault unstable equilibrium δ_u = π − asin(P_m/P_max,post) while ω > 1. The
  out-of-step relay then trips the unit.
- **The P-δ drawer** draws the three sine curves and shades the accelerating area A₁ and the decelerating area A₂ live.
- **Exam mode:** closed-form equal-area δ_cr and t_cr (oracle PS-24: δ_cr = 84.775°, t_cr = 0.25996 s; RK4 agrees within 10 µs).

### 3.8 Faults and protection
**Fault network:** Y_f = Y_bus(network) + Σ_gen 1/(jX''_d) at generator buses (+ condensers). Loads are neglected and motor
contribution is ignored (**S5, S30**).
- **Pre-fault voltage:** from the current load flow in play, or 1.0∠0 in textbook/exam mode (matches the oracles).
- **Zbus columns** are obtained by solving Y_f·z = e_k with core complex LU (no full inverse).

```
3-phase:  I_f = V_k / (Z_kk + Z_f) ;   V_i = V_i^pre − Z_ik I_f ;   I_ij = (V_i − V_j)·y_s,ij (+ shunt terms)
SLG (a-g): I_a = 3 V_k / (Z1_kk + Z2_kk + Z0_kk + 3 Z_f)
LL (b-c): |I_b| = √3 |V_k| / |Z1_kk + Z2_kk + Z_f|
```
**Sequence networks:**
- Z2 = Z1 for every element except generators (X2 from data).
- Line Z0 = 3·Z1 unless the catalogue gives Z0 (**S6**).
- Transformer zero-sequence by vector group:
  - YNyn: passes.
  - YNd: the YN side is connected to the reference through z_t; the d side is open.
  - Dyn: the mirror of YNd.
  - Yy (ungrounded): open both sides.
- Generator X0 per data, through the neutral earthing impedance (×3).
- Oracles PS-17/18/19 fix the conventions. The cross-check confirmed the Δ winding blocks the generator X0.

**Relays:**
- **Overcurrent IDMT (IEC 60255-151):** t = TMS·k / ((I/I_s)^α − 1).
  - Curves: SI (k = 0.14, α = 0.02), VI (13.5, 1), EI (80, 2), LTI (120, 1).
  - Operates only above 1.1·I_s; instantaneous element optional.
  - Oracle G-06: SI, TMS 0.1, I/I_s = 10 gives 0.2971 s.
- **Distance (mho, simplified, S20):**
  - Apparent impedance Z_app = V_relay / I_relay.
  - Zone 1: 80% of the line, 30 ms.
  - Zone 2: 120%, 350 ms.
  - Zone 3: 100% of the line + 120% of the longest adjacent line, 1.0 s.
  - No arc resistance, circular characteristic.
- **Out-of-step:** see 3.7.
- **Over-voltage:** stage 1 at 110% for 5 s; stage 2 at 140% for 100 ms (flagged recall of EHV practice).
- **Under-voltage load trip:** a load bus < 0.85 pu for 2 s loses its motor share (game value).

**Breakers:**
- Total clearing time = relay time + interrupting time: 2, 3 or 5 cycles = 40, 60 or 100 ms at 50 Hz.
- If the symmetrical fault current through the breaker exceeds its rated breaking current (kA), the breaker **fails**.
  Breaker-failure protection then opens every adjacent breaker after 200 ms. DC offset/asymmetry is ignored (**S7**).

**Conductor damage (L24):** adiabatic limit I²t ≤ (K·A)² with K = 76 A·√s/mm² for aluminium. This is a recall-flagged
IEC 60949-style constant and game-tunable (**S31**). When exceeded, the span "anneals": it is out for the rest of the level.

### 3.9 Thermal limits and the cascade
- **Branch loading:** L = max(|S_from|, |S_to|)/S_rating. Rating = thermal MVA per circuit = √3·V·I_amp at the catalogue's
  75 °C column (fixed ambient, no dynamic rating, **S17**).
- **Overload timer** (game rule modelled on a conductor thermal time constant of ~10 min, not a standard; **S8**):
  - Lines: t_trip = 600 s/(L² − 1) for 1.0 < L ≤ 1.5; 5 s for L > 1.5.
  - Transformers: same curve with 1800 s.
  - Timers persist across blocks while L > 1 and reset after one block below 0.95. They are visible as countdown rings on the element.
- **Cascade loop:** trip → islands → load flow (+ collapse handling) → new overloads/voltage relays → the next trip at the
  earliest timer → … until stable or everything is dark.
  - Thermal timers advance in 10 s quasi-static sub-steps.
  - A frequency window opens whenever a trip changes the generation/load balance by > 1% of island load.
  - Every step is appended to the **replay log** (time, element, cause, quantities that caused it).

### 3.10 Demand, weather and renewables
- **Demand per load bus:** P = P_peak × profile_class[block] × (1 + k_T·max(0, T − 30 °C)) × growth.
  - k_T = 1.5%/°C, residential and commercial only (**S32**, game-tunable). Q from the class pf.
  - Six classes, each 96 values: residential, commercial, irrigation pumping (block-scheduled, shiftable),
    industrial (3-shift), city mixed, datacenter (flat 0.95).
  - The shapes are synthetic, anchored to published load-shape facts (§4.8; shape parameters are pack data): evening residential peak; winter early-morning
    minimum (~03:30); a midday net-load dip under high solar. Flagged **S33**.
- **Solar PV:** clear-sky irradiance from solar geometry at the level's latitude (default 23° N), by day of year and block.
  - G_clear = 1000·cos(z)^1.15 W/m² (**S34**).
  - Multiplied by the cloud-field transmittance at the plant's tile, from the seeded clouds that are **drawn on the map**:
    the cloud you see is the cloud that dims the plant.
  - T_cell = T_amb + 25·G/800 °C.
  - P_dc = P_dc,rated·(G/1000)·(1 − 0.004·(T_cell − 25)).
  - P_ac = min(P_dc·0.97, P_ac,rated), with DC/AC ratio 1.25.
  - Oracle G-14: a 100 MW_dc array at 800 W/m² and T_cell = 45 °C makes 73.6 MW_dc.
- **Wind:** P = P_r·(v³ − v_ci³)/(v_r³ − v_ci³) for v_ci ≤ v < v_r; P_r for v_r ≤ v < v_co; 0 otherwise.
  - v_ci = 3, v_r = 12, v_co = 25 m/s (**S35**; oracle G-08: 3 MW at 8 m/s gives 0.8554 MW).
  - Wind speed per block: seeded AR(1) around the level's mean profile.
- **BESS:** SoC_{t+1} = SoC_t + (η_c·P_ch − P_dis/η_d)·Δt / E_rated, with η_c = η_d = √η_rt. SoC is limited to 10-90%.
  Oracle G-09: 50 MW discharged for 1 h at η_rt = 0.86 drops SoC by 53.916 MWh.
- **Pumped hydro:** the same structure with η_rt = 0.75; pump mode is fixed-speed (pumps at rated P only, **S36**).

### 3.11 Commitment, dispatch, cost
- **Unit cost curve** (pack currency/h, US$ in `global`): C_i(P) = a_i + b_i·P + c_i·P².
  - b_i comes from the full-load heat rate × fuel price.
  - a_i and c_i are fitted so the average heat rate at P_min is 8% worse than at P_max, and the incremental cost rises 10%
    from P_min to P_max (**S15**, shape flagged; real part-load heat-rate curves go in this direction).
  - Cost per block = C_i(P)·0.25 h + start-up cost (hot/cold per catalogue) + VOM·P·0.25.
- **Commitment:** the player's schedule, or the auto priority list (full-load average cost order) honouring min up/down,
  start times and a reserve requirement = largest online unit (auto in Learner).
- **Economic dispatch per block:** λ-iteration (bisection on λ; 60 iterations or |ΣP − D| < 10⁻⁶ MW).
  - Bounds: [P_min, P_max] ∩ [P_prev − ramp·15 min, P_prev + ramp·15 min].
  - Oracles PS-20/21 pin the method.
  - **Energy-limited hydro:** water value ν ($/MWh) is solved per day by bisection so that daily energy = budget (**S13**).
  - **Storage:** player schedule or threshold strategy (charge when λ < λ_low, discharge when λ > λ_high).
- **Losses:**
  - Learner: lossless dispatch, the slack absorbs losses.
  - Engineer: penalty factors PF_i = 1/(1 − ∂P_L/∂P_i), with loss sensitivities from the converged Jacobian (Jᵀ solve);
    3 outer ED↔LF iterations. Oracle PS-22 pins the coordination equations with B-coefficients.
- **Congestion** is not auto-relieved: that is the L26 lesson. The L26 ★★★ reference cost is precomputed offline by the
  level's solver bot and stored with the level (no LP solver in the engine for v0.1).
- **Level cost metric** (what histograms show) = capex + operating cost of the run × (365/days_run) (annualised).
  - Operating cost = fuel + starts + VOM + ENS·VOLL + losses·energy price.
  - Unserved energy is priced at VOLL (pack value; `global` US$10,000/MWh, game-tunable, **S37**).
  - Bench-level losses are priced at the pack energy price (`global` US$50/MWh, §4.8).
  - CO₂ is tracked (t) and shown; it is priced only in Sandbox.

### 3.12 Service quality and level-failure rules
| Condition | Effect | Visual |
|---|---|---|
| Load bus V in band (Learner 0.94-1.06; Engineer 0.95-1.05; EHV buses use the pack's kV bands, §4.7) | Served | Windows lit, brightness ∝ V² |
| 0.85 ≤ V < band | **Brownout**, counted as "poor-supply minutes" | Windows dim, amber ring on bus |
| V < 0.85 for 2 s | Motor share trips (ENS) | Flicker then partial dark |
| V > band upper | Over-voltage minutes; > 1.10 trips stage-1 OV | Windows flare, bulbs pop sfx |
| Load shed (UFLS, collapse, de-energised island, breaker) | ENS | Windows dark street by street |

Each level's pass condition picks from: ENS = 0 (or ≤ x%), poor-supply minutes ≤ y, no OV trip, no equipment damage,
frequency criteria, budget. These are listed on the level card and checked by `levelResult(state)`.

### 3.13 Simplifications register (each one becomes a Codex "Honest note" entry)
| Id | Simplification | Why it is acceptable | Where the player meets it |
|---|---|---|---|
| S1 | Grid levels are balanced positive-sequence | Standard planning load flow; unbalance taught on the L10 bench | Ch 5-7 |
| S2 | Phasor model, no electromagnetic transients | Time scales ≥ 10 ms | everywhere |
| S3 | Single centre-of-inertia frequency | Standard for frequency-response studies of one area | Ch 6 |
| S4 | Classical generator model in SMIB | Textbook first-swing analysis | L12, L25 |
| S5 | Constant-power loads in LF; loads neglected in faults | Textbook practice | Ch 5, 7 |
| S6 | Line Z0 = 3·Z1 default | Typical overhead-line ratio | L23, L27 |
| S7 | Breaker duty ignores DC offset | v0.1 uses symmetrical rms only | L23 |
| S8 | Overload timer is a game curve | No conductor thermal model in v0.1 | all grid levels |
| S9 | No AGC | Primary response only; dispatch corrects next block | Ch 6 |
| S10 | Inverter plants: no inertia, no droop unless BESS/grid-forming | Grid-following inverters | Ch 6 |
| S11 | Single slack per island | Standard LF | all |
| S12 | 6-pulse "1/h" harmonic spectrum | Textbook idealisation | L08 |
| S13 | Hydro water value by daily bisection | Simplified hydro-thermal coordination | L26 |
| S14 | Textbook-mode levels (single-phase, resistive line, ideal transformer) | Matches NCERT numbers exactly | L06, L09 |
| S15 | Cost-curve shape | Heat-rate curves vary per unit | Ch 6-7 |
| S16 | Fixed conductor temperature (R × 1.24) | No thermal state | grid levels |
| S17 | Static line ratings | No weather-dependent rating | all |
| S18 | Transformer magnetising branch neglected | < 1% current | all |
| S19 | P-f / Q-V decoupled in event window | Standard decoupling for frequency studies | Ch 6 |
| S20 | Simplified mho distance zones | Teaching level | L25 |
| S21 | Rectangular generator capability | v0.2: capability circle | all |
| S22 | Bench loads are resistive | Linear bench; constant-power loads appear in Ch 5 | Ch 1 |
| S23 | LV star point earth 1 Ω | Typical | L10 |
| S24 | Load damping 1.5 %/% | Typical range 1-2 | Ch 6 |
| S25 | Single reheat-turbine parameter set | Kundur typical | Ch 6 |
| S26 | Hydro governor without transient droop | Simpler; nadir slightly pessimistic | Ch 6 |
| S27 | Discrete events at step end (±10 ms) | Far below relay delays | Ch 6-7 |
| S28 | Generator U/F and O/F trip settings are game values | Real settings vary by plant | Ch 6 |
| S29 | Legacy DER RoCoF trip at 1 Hz/s | Modelled on legacy anti-islanding settings | L21, L28 |
| S30 | Motor fault contribution ignored | Textbook | L23 |
| S31 | Conductor I²t constant K | Recall-flagged | L24 |
| S32 | Temperature sensitivity of demand | Game-tunable | heatwave levels |
| S33 | Synthetic demand shapes | Anchored to published facts, not measured series | all |
| S34 | Simple clear-sky model | Shape matters more than the last 5% | Ch 6 |
| S35 | Generic wind power curve | Typical 3/12/25 m/s turbine | Ch 6 |
| S36 | Fixed-speed pumping | Typical of older PSPs | L20 |
| S37 | VOLL constant | Game-tunable | all |

### 3.14 Numerical stability rules (engine must enforce; each has a test)
1. Everything is solved in pu. Branches with |z| < 10⁻⁶ pu are merged as bus ties before building Y_bus; the UI shows them as couplers.
2. After LU, estimate the conditioning (min/max |pivot|). Below 10⁻¹² the engine returns a teaching error such as "isolated
   or zero-impedance element at …"; it never passes NaN downstream. A finite-number guard runs on every query result (from the GIGAWATT invariants).
3. Deterministic ordering: buses, branches and units are processed in id-sorted order; RNG comes only from the seeded core
   RNG via (seed, day, block, stream id).
4. **Cross-platform determinism:**
   - V8's `Math.sin/cos/exp/log` are not guaranteed bit-identical across versions, and nodejs-mobile ≠ desktop Node.
   - The engine therefore uses the core's deterministic math module (`core/ts/numerics/dmath.ts`, an fdlibm port) for every
     transcendental function. `sqrt` and the arithmetic operators are IEEE-exact already.
   - Golden hashes are taken over values quantised to 1e-9 relative as a second line of defence.
   - **Dependency on cobanana-core** (see final report).
5. NR safeguards: damping; at most 25 iterations; flat-start retry; continuation. Q-limit hysteresis. Voltage magnitudes below
   0.3 pu mid-iteration trigger the line search, never a clamp (a clamp hides collapse).
6. ODE safeguards: fixed-step RK4 (no adaptive step, for determinism). Event interpolation. States are clamped only at the
   physical limits defined in 3.6.

### 3.15 Performance budget (tests enforce it; §9.7)
| Item | Campaign cap | Sandbox cap |
|---|---|---|
| Buses / branches | 30 / 45 | 60 / 90 |
| Synchronous plants (units) / inverter plants / storage | 12 (24 units) / 12 / 4 | 24 (48 units) / 24 / 8 |
| Relays | 24 | 48 |

| Operation (60-bus worst case) | Desktop budget (median) | Pixel 9a budget (nodejs-mobile) |
|---|---|---|
| One NR load flow, warm start (≈ 3 iterations, dense LU of ≈ 115×115) | ≤ 3 ms | ≤ 15 ms |
| One operator block (all systems incl. LF) | ≤ 5 ms | ≤ 25 ms |
| Full day (96 blocks, no events) | ≤ 400 ms | ≤ 2.4 s (spread over 72 s of play) |
| Event window, 60 s at 10 ms RK4 (≤ 40 states) | ≤ 20 ms | ≤ 100 ms |
| Cascade with 10 trips (10 LFs + 2 windows) | ≤ 80 ms | ≤ 400 ms |
| N-1 test, 90 branches | ≤ 400 ms | ≤ 2.5 s, chunked 5 contingencies per frame with a progress ring |
| Fault study (Zbus column, 3 sequences) | ≤ 2 ms | ≤ 10 ms |

Dense linear algebra is enough at these sizes (115³/3 ≈ 0.5 Mflop per factorisation). Sparse LU is not needed in v0.1.
Rendering budget is in §5.7.

---

## 4. Data catalogues (real values, sources, confidence)

Every catalogue row in `src/data/*.ts` carries `source` (URL or document + table/page) and a `confidence` tag:
- `datasheet`: a manufacturer table was opened.
- `standard`: a standard or an official grid-code text was opened.
- `report`: an authoritative report was opened (EIA, Agora, MISO, LBNL).
- `secondary`: a review paper or secondary copy was opened.
- `derived`: computed here from verified inputs with a stated formula.
- `recall`: model recall, not yet opened.
- `game`: a deliberate game value, flagged in the Codex.

**Release gate (test `data.test.ts` with `RELEASE=1`):** no row of a `ship` pack (v0.1: `global`) may be `recall`. Each must
be verified or relabelled `game` with an honest note. Physics-only data (conductor geometry, governor constants) lives in
`src/data/` and is shared by all packs; prices, standards references and grid-code values are pack data (§11). The
designer's India rows (CEA/CERC/IEGC/IS, ₹) are preserved verbatim in Appendix A.3 as the draft `in` pack.

**Reviewer re-sourcing for `global` (2026-11-09/10).** A Sonnet worker downloaded and the reviewer read: EIA AEO2023
Table 1, MISO Transmission Cost Estimation Guide MTEP24 (and the MTEP25 draft), LBNL value-of-service report, IEC 60038:2009,
IEC 60228:2023, IEC 60364-5-52 (text only; its ampacity tables did not extract), a BS 215 ACSR maker's table. The EU
network-code texts (SOGL 2017/1485, NC ER 2017/2196, NC RfG 2016/631) could **not** be fetched from this environment
(EUR-Lex and legislation.gov.uk returned empty pages), so their values below are `recall` with exact clause references:
an M1 data task verifies them (or relabels them `game`, which is honest because Lumen Province's grid code is fictional
and only *modelled on* ENTSO-E).

Sources used below (`global` pack):
- **[EIA23]** EIA AEO2023 Capital Cost and Performance Characteristics, Table 1 (2022 $), https://www.eia.gov/outlooks/aeo/assumptions/pdf/elec_cost_perf.pdf (opened; values re-read by the reviewer).
- **[MISO24]** MISO Transmission Cost Estimation Guide for MTEP24 (1 May 2024): Table 4.1-1 (new single-circuit line $/mile), Table 2.3-7 (power transformer $/MVA), Table 2.3-8 (grid supporting devices $/MVAr), https://cdn.misoenergy.org (opened).
- **[LBNL15]** Sullivan et al., *Updated Value of Service Reliability Estimates for Electric Utility Customers in the United States*, LBNL (2015), cost per unserved kWh tables (opened).
- **[IEC60038]** IEC 60038:2009 Tables 1, 3, 4, 5 (230/400 V; 11/12, 33/36, 66/72.5, 132/145, 220/245, 380-400/420 kV) (opened).
- **[IEC60228]** IEC 60228:2023 class-2 copper max resistance (opened; matches the designer's secondary values).
- **[APAR]** Apar ACSR datasheet, BS 215 Part 2 tables, https://apar.com/wp-content/uploads/2021/02/1.-ACSR.pdf; ratings at 75/85 °C conductor, 45 °C ambient, 0.56 m/s wind, 1045 W/m² sun (designer-opened; BS 215 names are used internationally).
- **[SW]** Southwire spec 80100 (designer-opened).
- **[AGORA]** Agora Energiewende, *Flexibility in thermal power plants* (2017), Table 1 (designer-opened).
- **[PROT]** Protecta relay manual Table 1-1, IEC 60255-151 constants (designer-opened).
- **[H-REV]** inertia review tables citing Kundur: arXiv 2004.02951, 2210.03661 (designer-opened).
- **[IEEE519]** IEEE 519-2014 Table 1 via the Mirus white paper (secondary).
- **[ENTSO-E codes]** SOGL (EU) 2017/1485 Annex II, III, V; NC ER (EU) 2017/2196 Annex (LFDD); NC RfG (EU) 2016/631 Art. 13, 15; EB GL (EU) 2017/2195 Art. 53 (`recall`, see above).

### 4.1 Generators and sources (v0.1: 14 entries)
Game values: one number per field (the range in brackets is the literature spread). Heat rates are full-load. Capex is
overnight 2022 US$ [EIA23] where EIA lists the technology; otherwise `game` anchored to the nearest EIA row. Fuel prices
are `global` pack game constants for 2026: coal **$2.60/GJ**, natural gas **$4.00/GJ** (≈ $4.2/MMBtu), diesel
**$25/GJ**, biomass **$4.00/GJ**, nuclear fuel **$7/MWh_e** (all `game`, order-of-magnitude US 2023-25 delivered costs;
an M1 data task replaces them with EIA Electric Power Monthly Table 7.4 figures and relabels).

| id | Unit | P_min % | Heat rate | Ramp %/min | Start hot / cold | H (s, own MVA) | Droop | Capex US$/kW | CO₂ t/MWh | Confidence & source |
|---|---|---|---|---|---|---|---|---|---|---|
| `diesel-1500` | 1.5 MW genset | 30 | 9.5 MJ/kWh | 20 | 10 s | 1.0 [0.5-1.5] | 5% | 800 (game) | 0.70 | recall (genset datasheets to verify) |
| `microhydro-250k` | 0.25 MW Francis, 500 rpm | 30 | water | 50 | 1 min | 2.0 | 5% | 4,000 (game, above EIA hydro for small scale) | 0 | game |
| `smallhydro-10` | 10 MW | 30 | water | 50 | 3 min | 2.5 [1.5-3] | 5% | 3,421 | 0 | capex [EIA23] conventional hydro (`report`); rest recall |
| `coal-sub-500` | 500 MW subcritical | 40 (pack value; `in` uses 55) | 10.0 MJ/kWh (≈ 9,480 Btu/kWh) | 1.5 [1.5-4] | 2.5 h / 8 h | 3.5 [2.5-6] | 5% | 3,600 (game: below EIA USC) | 0.95 | Ramp/start [AGORA] (`report`); H [H-REV] (`secondary`); heat rate, capex `game` |
| `coal-sc-660` | 660 MW (ultra)supercritical | 40 | **8,638 Btu/kWh = 9.11 MJ/kWh** | 3 [3-6] | 1.5 h / 5 h | 4.0 [2.5-6] | 5% | **4,507** | 0.86 | heat rate, capex [EIA23] USC (`report`); ramp/start [AGORA] |
| `ccgt-418` | 418 MW single-shaft CCGT | 45 [40-50] | **6,431 Btu/kWh = 6.785 MJ/kWh** | 3 [2-4] | 75 min / 3.5 h | 5.0 | 5% | **1,330** | 0.37 | [EIA23], [AGORA] (`report`); H recall |
| `ocgt-105` | 105 MW aeroderivative | 45 [40-50] | **9,124 Btu/kWh = 9.626 MJ/kWh** | 10 [8-12] | 8 min / 8 min | 3.0 | 4% | **1,428** | 0.54 | [EIA23], [AGORA] (`report`); H recall |
| `hydro-250` | 250 MW unit, Francis | 30 | water (daily energy budget per level) | 50 | 3 min | 3.0 [2-4] | 4% | **3,421** | 0 | capex [EIA23] (`report`); H [H-REV]; T_W 1.5 s recall |
| `psp-250` | 250 MW pumped-storage unit | 40 (gen) | η_rt 0.75 | 50 | 3 min (gen), 5 min (pump) | 3.0 | 4% | 2,500 (game) | 0 | recall; pump-mode trip before UFLS stage 1 is a pack grid-code rule |
| `nuclear-1100` | 1,100 MW LWR (renamed from `phwr-700`: PHWR is India-specific; `in` keeps it) | 80 (must-run) | **10,447 Btu/kWh** | 0.5 | days | 4.0 | 5% (limited) | **7,406** | 0 | [EIA23] (`report`) |
| `pv-100` | 100 MW_ac utility PV, DC/AC 1.25, single-axis tracking | 0 (curtailable) | — | irradiance | — | 0 | — | **1,448** (AEO2023 input value 1,443) | 0 | [EIA23] (`report`). Model §3.10 |
| `wind-50` | 50 MW farm of 3 MW turbines (3/12/25 m/s) | 0 | — | wind | — | 0 (type 3/4) | — | **2,098** (input value 1,566) | 0 | [EIA23] (`report`). Curve `game` (S35) |
| `biomass-10` | 10 MW Rankine | 60 | **13,500 Btu/kWh = 14.2 MJ/kWh** | 1 | 8 h | 2.5 | 5% | **4,996** | ~0 net | [EIA23] (`report`) |
| `synccon-100` | 100 MVA synchronous condenser | — | aux losses 1.5% of rating | — | 15 min | 1.75 [1.5-2] | — | **169.5 $/kVAr** | 0 | [MISO24] Table 2.3-8 (`report`); H recall |

**Governor data (S25/S26):** steam T_G 0.2 s, T_RH 7 s, F_HP 0.3; gas T_G 0.5 s; hydro T_G 0.5 s, T_W 1.5 s (Kundur-typical,
`recall`). Deadband, full-activation time and droop range come from the pack grid code (§4.7). Oracle and exam cases use
deadband 0.

**Sub-transient/transient reactances** for faults and SMIB, on own MVA base: X''_d = 0.20 (steam), 0.25 (hydro), 0.15 (gas),
0.15 (diesel); X'_d = 0.30/0.35/0.25/0.25; X2 = X''_d; X0 = 0.08. Textbook-typical `recall`; oracles PS-17/18 use their own stated values.

### 4.2 Conductors and cables (v0.1: 9 ACSR + 8 copper + 1 HTLS; physics data, shared by all packs)
**ACSR** ([APAR] BS 215 Part-2 table unless noted; R is DC at 20 °C; ampacity at 75 °C / 85 °C conductor, 45 °C ambient):

| id | Al/St × mm | Al / total mm² | Dia mm | R₂₀ Ω/km | A @75 / 85 °C | kg/km | Confidence |
|---|---|---|---|---|---|---|---|
| `acsr-weasel` | 6/2.59 + 1/2.59 | 30 / 36.88 | 7.77 | 0.9077 | 115 / 137 | 128 | datasheet |
| `acsr-rabbit` | 6/3.35 + 1/3.35 | 50 / 61.70 | 10.05 | 0.5426 | 156 / 188 | 214 | datasheet |
| `acsr-dog` | 6/4.72 + 7/1.57 | 100 / 118.5 | 14.15 | 0.2733 | 234 / 285 | 394 | datasheet |
| `acsr-wolf` | 30/2.59 + 7/2.59 | 150 / 194.9 | 18.13 | 0.1828 | 319 / 393 | 726 | datasheet |
| `acsr-panther` | 30/3.00 + 7/3.00 | 200 / 261.5 | 21.00 | 0.1363 | 377 / 470 | 974 | datasheet |
| `acsr-zebra` | 54/3.18 + 7/3.18 | 400 / 484.5 | 28.62 | 0.0674 | 551 / 700 | 1,621 | datasheet |
| `acsr-moose` | 54/3.53 + 7/3.53 | 520 / 597.0 | 31.77 | 0.05595 | 612 / 783 | 1,998 | datasheet row matched by stranding ([APAR]); code name not printed → confirm |
| `acsr-drake` | 26/4.44 + 7/3.45 (795 kcmil) | 403 / 468 | 28.1 | **0.0702** | 907 (US rating basis, not comparable) | 1,628 | DC R: [SW] `datasheet`. Ampacity `secondary` (sandbox only) |

BS 215 code names are used across many countries; the EN 50182 designations (e.g. Zebra ≈ 400-AL1/54-ST1A) are shown in the
Inspector as a second name (pack data). Bersimis (765 kV) could not be verified; **v0.1 caps the campaign at 400 kV.**

**Copper cables (2-core, PVC)** [IEC60228] max R₂₀ (Ω/km): 2.5 → 7.41; 4 → 4.61; 6 → 3.08; 10 → 1.83; 16 → 1.15; 25 → 0.727;
35 → 0.524; 50 → 0.387 (`standard`). Ampacity in air: 27, 36, 46, 63, 85, 112, 138, 168 A (these are the commonly reproduced
IEC 60364-5-52 Table B.52-4 reference-method-C figures; the opened copy did not extract the table, so `recall` until an M1
data task reads it). Price (`global`, `game`): $0.10/m per mm² of conductor cross-section per core + $1.0/m sheath +
$150 per pole every 40 m (∝ copper mass; copper ≈ $10/kg).

### 4.3 Line templates (per km, positive sequence; v0.1: 10 templates; physics data, shared by all packs)
**Derived:**
- R = R₂₀ × 1.24 / n_bundle (S16).
- X and B from Glover ch. 4 formulas: L = 2·10⁻⁷ ln(D_m/D_s), C = 2πε₀/ln(D_m/r_eq), using datasheet diameters,
  GMR = 0.81·r, flat phase spacing D (GMD = D·∛2), and bundle spacing 0.45 m (`derived`).
- The spacings are typical tower geometries (`recall`, flagged).
- Thermal MVA = √3·V·I₇₅·n.

- Thermal MVA = √3·V·I₇₅·n.

| id | kV | Conductor | D (m) | R Ω/km | X Ω/km | B µS/km | Z_c Ω | SIL MW | Thermal MVA |
|---|---|---|---|---|---|---|---|---|---|
| `l11-weasel` | 11 | Weasel | 1.0 | 1.1255 | 0.377 | 3.02 | 353 | 0.3 | 2.2 |
| `l11-rabbit` | 11 | Rabbit | 1.0 | 0.6728 | 0.360 | 3.16 | 337 | 0.4 | 3.0 |
| `l11-dog` | 11 | Dog | 1.0 | 0.3389 | 0.339 | 3.37 | 317 | 0.4 | 4.5 |
| `l33-dog` | 33 | Dog | 1.5 | 0.3389 | 0.364 | 3.13 | 341 | 3.2 | 13 |
| `l66-wolf` | 66 | Wolf | 3.0 | 0.2267 | 0.392 | 2.90 | 368 | 11.8 | 36 |
| `l132-panther` | 132 | Panther | 5.0 | 0.1690 | 0.415 | 2.73 | 390 | 44.7 | 86 |
| `l220-zebra` | 220 | Zebra | 7.0 | 0.0836 | 0.417 | 2.72 | 391 | 124 | 210 |
| `l220-twinzebra` | 220 | 2 × Zebra | 7.0 | 0.0418 | 0.302 | 3.72 | 285 | 170 | 420 |
- `l220-twinzebra` was missing from the designer's catalogue although L17 uses it; the reviewer derived it with the same
  formulas (`derived`).
- Zero sequence: Z0 = 3·Z1 (S6).
- **Line costs (`global`, US$ per km per circuit):** 66 kV **1.06 M**; 132 kV **1.24 M**; 220 kV **1.37 M**; 400 kV twin
  **2.4 M** (interpolated between MISO 345 kV $3.5 M/mile and 500 kV $4.4 M/mile); quad **3.1 M** (game ×1.3); from [MISO24]
  Table 4.1-1 (Arkansas/Iowa/Missouri column, $/mile ÷ 1.609; includes 30% contingency and AFUDC; `report`, mapped to the
  nearest MISO voltage class: 69→66, 138→132, 230→220). 11 kV **0.12 M**, 33 kV **0.25 M** (`game`: distribution lines are
  outside MISO's guide). Double-circuit towers cost 1.6× single (`game`).
- Checked against the game: L15 (350 km of `l400-twinmoose`) has |A| = 0.932 and a no-load receiving voltage of
  **429 kV > 420 kV** (re-solved independently by a reviewer worker: 429.14 kV), so the Ferranti lesson fails as intended
  without a reactor. Nominal charging b·ℓ·V² = 192 MVAr; the exact sending-end charging at no load is ≈ 201 MVAr; the
  Inspector shows the exact value and labels it.

### 4.4 Transformers (v0.1: 11 SKUs)
| id | Rating | Voltage | %Z | X/R | OLTC | Losses (no-load / load) | Cost (`global`) | Confidence |
|---|---|---|---|---|---|---|---|---|
| `dt-100/160/250/400/630` | 100/160/250/400/630 kVA (IEC 60076 preferred ratings) | 11/0.42 kV Dyn11 | 4 (≤ 630 kVA, typical IEC practice) | 3 | off-circuit ±5% (2.5% steps) | 0.2/1.8 kW (100 kVA), scaled ∝ S^0.75 | $20/kVA (game) | recall |
| `pt-33-11-10` | 10 MVA | 33/11 kV Dyn11 | 8.35 | 15 | ±10% / 1.25% (16 steps) | 10 / 55 kW | $0.6 M (game) | recall |
| `pt-132-33-50` | 50 MVA | 132/33 kV YNyn0 (+Δ tertiary) | 12.5 | 30 | ±10% / 1.25% | 25 / 180 kW | $5,050/MVA | cost [MISO24] 138/69-class (`report`); rest recall |
| `ict-220-132-160` | 160 MVA | 220/132 kV YNa0 auto | 12.5 | 40 | ±10% / 1.25% | 50 / 350 kW | $5,896/MVA | cost [MISO24] 230/138 (`report`); rest recall |
| `ict-400-220-315` | 315 MVA | 400/220 kV YNa0 auto | 12.5 | 50 | ±10% / 1.25% | 120 / 600 kW | $7,239/MVA | cost [MISO24] 345/230 (`report`); rest recall |
| `gsu-500` | 500/600/800 MVA | 21/400 kV YNd1 | 15 | 60 | none (off-circuit ±5%) | 150 kW / 1.5 MW | $7,239/MVA | cost [MISO24] (`report`, nearest class); rest recall |
| `conv-dcdc-48-380` | 10 kW | 48 V ↔ 380 V DC | — | — | — | η 97% | $800 | game |

### 4.5 Reactive compensation (v0.1: 8 families)
| id | Rating | Notes | Cost (`global`) | Confidence |
|---|---|---|---|---|
| `cap-lv-*` | LV capacitor units 25/50/100 µF per phase at 400 V | L11 (Y or Δ) | $25/kVAr | game |
| `cap-11-300/600/900` | 300/600/900 kVAr at 11 kV | fixed or auto (auto ×1.6) | $15/kVAr | game (MV) |
| `cap-detuned-7/14` | reactor-detuned bank, p = 7% / 14% | series resonance 3.78 h / 2.67 h | ×1.8 of bank | derived (G-04) / game cost |
| `cap-33-5` / `cap-220-50` | 5 MVAr at 33 kV / 50 MVAr at 220 kV | switched steps | $11,873/MVAr | [MISO24] Table 2.3-8 (`report`) |
| `reactor-400-50/63/80/125` | 400 kV shunt reactors | line or bus, switchable (bus) | $19,950/MVAr | [MISO24] 345 kV class (`report`) |
| `svc-100` | ±100 MVAr | susceptance-limited | $114,185/MVAr | [MISO24] (`report`) |
| `statcom-100/200` | ±100/±200 MVAr | current-limited | $226,013/MVAr | [MISO24] (`report`) |
| `series-cap-30/50/…` | % of line X | 33-400 kV | $15,000/MVAr of rating (game, above shunt caps) | game |
- Capacitor overcurrent limit 1.3 × rated rms and over-voltage 1.10 × (IEC 60871-1; clause not opened, `recall`). These drive the L08 fuse rule.
- Harmonic limits: THD_V 8% (≤ 1 kV), 5% (1-69 kV), 2.5% (69-161 kV), 1.5% (> 161 kV) [IEEE519] (`secondary`).

### 4.6 Storage (v0.1: 4 SKUs)
| id | Power / energy | η_rt | Response | SoC window | Cost (`global`) | Confidence |
|---|---|---|---|---|---|---|
| `bess-2h-50` | 50 MW / 100 MWh | 0.86 | 200 ms (grid-following FFR) | 10-90% | $71.5/kW + $236/kWh ([MISO24] Table 2.3-8) = $543.5/kW for 2 h | `report` (cost); η recall (NREL ATB ≈ 85%) |
| `bess-4h-50` | 50 MW / 200 MWh | 0.86 | 200 ms | 10-90% | same formula = $1,015.5/kW (EIA AEO2023 battery storage: $1,270/kW, cross-reference) | `report` |
| `bess-gfm-50` | 50 MW / 50 MWh grid-forming | 0.86 | 50 ms + H_v = 4 s on rating | 10-90% | $500/kW (game: 1 h + inverter premium) | game (H_v) |
| `psp-250` | see 4.1 | 0.75 | minutes | reservoir | — | recall |

### 4.7 Protection and grid code (`global` pack: "Lumen Grid Code", modelled on ENTSO-E Continental Europe)
| Item | `global` value | Confidence |
|---|---|---|
| IEC 60255-151 curves: t = TMS·[k/((I/I_s)^α − 1) + c] | SI 0.14/0.02; VI 13.5/1; EI 80/2; LTI 120/1; c = 0 | **standard** ([PROT] Table 1-1) |
| IDMT setting ranges (game) | I_s 50-200% of CT rating in 5% steps; TMS 0.025-1.2 in 0.025; CTI 0.3 s | game (typical practice) |
| Breakers (IEC 62271-100 R10 series) | 25, 31.5, 40, 50, 63 kA; interrupting 2 / 3 / 5 cycles | recall (standard not openable) |
| Distance relay | Z1 80% inst (30 ms); Z2 120% 350 ms; Z3 1.0 s | recall (common international practice) |
| Fuse (11 kV spur) | K-link curves, game-simplified to EI with fixed TMS | game |
| **Frequency quality** | nominal 50 Hz; standard frequency range ±50 mHz; max steady-state deviation 200 mHz; max instantaneous deviation 800 mHz | recall: SOGL 2017/1485 Annex III (CE) |
| **UFLS (LFDD)** | 6 stages 49.0 / 48.8 / 48.6 / 48.4 / 48.2 / 48.0 Hz; 5 / 8 / 8 / 8 / 8 / 8% (45% total); PSP pumping and BESS charging disconnect before stage 1 | recall: NC ER 2017/2196 Annex (CE: start 49.0 Hz, 5%; end 48.0 Hz, 45 ± 7%; ≤ 10% per step; ≥ 6 steps). Stage spacing and quanta are `game` within those rules |
| **Primary response (FCR)** | insensitivity/deadband ≤ 10 mHz; full activation at ±200 mHz within 30 s | recall: SOGL Annex V |
| Droop | 2-12% allowed (UI offers 3-6%), 5% default | recall: NC RfG Art. 15(2)(d) |
| Generator frequency withstand | 49.0-51.0 Hz unlimited; 47.5-48.5 Hz ≥ 30 min; trip < 47.5 Hz (0.5 s); > 51.5 Hz (2 s) | recall: NC RfG Art. 13 (CE); trip delays `game` (S28) |
| **Voltage limits (steady state), kV max/min** | 400: 420/380 (and 0.90 pu = 360 for short emergencies); 220: 245/198; 132: 145/119; 66: 72.5/59.4; 33: 36/30; 11: 12/10 | upper = IEC 60038 highest voltage for equipment (**standard**, opened); lower 0.90 pu (game, modelled on SOGL Annex II CE 0.90-1.05/1.118 pu ranges, `recall`) |
| LV / MV supply band | 230/400 V ±10% (EN 50160, 95% of 10-min means; `recall`); Learner ±6%, Engineer ±5% for MV load buses (game) | recall / game |
| Settlement period | 15 min | recall: EB GL 2017/2195 Art. 53 |
| Generator U/F, O/F trips; OV stages; UV load trip; DER RoCoF | §3.6/3.8 values | game (S28, S29) |

### 4.8 Demand profiles, weather and grid facts
**Demand classes (96-block arrays generated from these hourly multipliers by linear interpolation; synthetic, S33, `game`;
shapes anchored to the facts below):**

| Class | 00 | 03 | 06 | 09 | 12 | 15 | 18 | 19 | 20 | 21 | 23 | pf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Residential | 0.62 | 0.47 | 0.58 | 0.56 | 0.58 | 0.62 | 0.85 | 0.97 | 1.00 | 0.97 | 0.75 | 0.95 |
| Commercial | 0.30 | 0.28 | 0.35 | 0.85 | 1.00 | 0.98 | 0.70 | 0.60 | 0.50 | 0.42 | 0.33 | 0.90 |
| Irrigation pumps | block schedule: 1.0 during supply blocks (default 00-04 and 10-13), 0.05 otherwise; shiftable to solar hours (L20) | | | | | | | | | | | 0.80 |
| Industrial (3-shift) | 0.85 | 0.85 | 0.92 | 1.00 | 0.95 | 1.00 | 0.95 | 0.92 | 0.90 | 0.88 | 0.86 | 0.85 |
| City mixed | 0.45·res + 0.30·com + 0.25·ind | | | | | | | | | | | 0.92 |
| Datacenter ("Gigawatt Inc.") | 0.95 flat | | | | | | | | | | | 0.98 |

Full residential row, hours 00-23: 0.62 0.55 0.50 0.47 0.46 0.50 0.58 0.62 0.60 0.56 0.55 0.56 0.58 0.60 0.62 0.62 0.63 0.70 0.85 0.97 1.00 0.97 0.88 0.75. Other classes interpolate linearly between the listed hours. Then 96 blocks interpolate linearly between hours.

**Weather presets (6):** clear summer, heatwave (+6 °C, residential +9%), wet season (cloud cover 70%, wind ×1.6),
winter (low solar, morning peak shift), storm (scripted trips + lightning SLG faults), holiday (demand −15%); the `in` pack names the wet preset "monsoon". Seeded cloud fields.

**Facts the `global` Codex may quote (real-world grid stories; region-neutral history):**
- **2003 North America:** US-Canada Task Force final report: a combination of institutional, human and computer failures
  (alarm system failure, tree contact, inadequate situational awareness). `secondary`
- **2016 South Australia black system:** tornado-damaged lines caused repeated faults, and wind-farm ride-through settings
  tripped 9 of 13 farms (AEMO final report, March 2017). This inspired L21. `secondary`
- **30-31 July 2012 Indian blackouts:** roughly 620 million people affected on 31 July, the largest blackout recorded. The
  enquiry committee report of 16 Aug 2012 found a combination of causes, including over-drawal beyond schedule and weak
  inter-regional transmission. `secondary`. (World history, not setting: allowed in `global`.)
- **28 April 2025 Iberian blackout** (stretch story): a voltage-control/over-voltage cascade that blacked out mainland Spain
  and Portugal. `recall`: tell it only once the ENTSO-E expert panel's final report is opened and cited.
- Country-specific demand records, loss statistics and market prices are pack data (`in`: Appendix A.2). The `global` pack
  quotes none; the finale's province is fictional and scaled.
- VOLL: **US$10,000/MWh** (`game`, anchored to [LBNL15]: 1-h interruption costs ≈ $3/kWh residential, ≈ $22/kWh
  medium/large C&I, ≈ $295/kWh small C&I). Loss/energy price for bench levels: **US$50/MWh** (`game`, typical US/EU
  wholesale order of magnitude).

### 4.9 Entry counts for v0.1
| Catalogue | Entries |
|---|---|
| Generators and sources | 14 |
| Conductors and cables | 18 |
| Line templates | 9 |
| Transformers and converters | 10 |
| Compensation | 8 families (≈ 20 SKUs) |
| Storage | 4 |
| Protection and grid code | 13 |
| Demand classes | 6 |
| Weather presets | 6 |
| **Total** | **≈ 100 rows** |

Each row is unit-tested for plausibility per type (no negative R; X/R in range; H in [0.5, 10]; heat rate in [6, 18] MJ/kWh;
ampacity monotonic in area within a family; and so on), for duplicate ids and for `source`/`confidence` presence (GIGAWATT data-test pattern).

---

## 5. World view and art direction

### 5.1 What the player sees (decided)
A **stylised 3D diorama map** in Godot 4 (Forward+ desktop, Mobile renderer on phones).
- **Camera:** tilted ~50°, perspective with a narrow FOV (reads like a tilt-shift model), orbit ±35°, zoom from "state" to "street".
- **Terrain:** low-poly tiles. Land has a subtle elevation; rivers, delta channels, mangrove, forest, desert, hills and city
  blocks are separate tile meshes. The map is a grid whose tile size is set per level: 10 m for island benches up to 10 km for the state.
- It is never a schematic. Schematic views exist only *inside* drawers (P-δ curve, time-current curve, phasors), and the
  world stays visible behind them.

| Object | Model (low-poly, vertex colours + one shared atlas) |
|---|---|
| Town / village | 6-40 instanced buildings with emissive windows. **Window brightness = (V/V_nom)²** of its bus; dark when shed; flicker on brownout |
| Hut / home (bench) | Thatch hut with a visible bulb |
| Lines | Tower model by voltage class: wooden pole (LV), concrete pole (11 kV), lattice tower (132/220 kV), tall lattice with twin/quad bundles (400 kV) |
| Wires | Catenary ribbons, 2-6 per circuit. Bundle count is visible. Sag deepens with loading (cosmetic, L ∝ sag) |
| Substations | Fenced yard with transformer, busbars, breakers (open/closed visibly), cap banks (stacked cans), reactors (round tanks), STATCOM (container hall) |
| Plants | Coal (cooling towers + stack with smoke ∝ output), CCGT, OCGT, hydro dam + spillway (water ∝ output), pumped storage (upper reservoir level = energy), nuclear dome, solar field (panel tilt follows sun), wind turbines (rotor speed ∝ wind), BESS containers (SoC light bar), diesel genset |
| Weather | Drifting cloud volumes (also the PV model input), rain particles during storms, lightning strikes that *are* the scripted faults |
| Sky / time | Day-night cycle driven by the operator clock; town lights matter at night; sunset hue during the evening ramp |

### 5.2 How flows are visualised
1. **Animated power flow (default on):** light pulses travel along each circuit.
   - Pulse **direction** = sign of P. **Speed** ∝ |P|/rating (capped). Ribbon **thickness** ∝ |S|/rating.
   - **Colour by loading:** cyan `#39E1FF` (< 70%), white (70-90%), amber `#FFB020` (90-100%), red `#FF3B3B` (> 100%,
     with a countdown ring around the hottest span).
2. **Reactive overlay (Q key / button):** a second pulse train in magenta `#FF4FD8` along the same ribbon shows Q flow.
   Its direction often opposes P, which is one of the game's "aha" visuals.
3. **Voltage heat map (V):** a soft ground decal around each bus. Diverging palette: deep blue `#3D6BFF` (≤ 0.90) →
   teal (0.95) → neutral white (1.00) → orange (1.05) → magenta-red (≥ 1.10).
   - It is never colour-only: each bus label also shows ▼/▲ and the number.
   - The palette passes a deuteranopia check because the luminance ramp is monotonic either side of 1.0.
4. **Phasor overlay (P key / inspecting a bus):** a floating, slowly rotating phasor diagram above the selected bus.
   - It shows V (white), I (cyan) and the φ arc with "lagging/leading" in words. Bench levels add V_R, V_L, V_C head-to-tail.
   - The rotation runs at 1/50 of real speed (1 rev/s) so it is visible; stopping is a setting.
   - Three-phase levels show the a/b/c star and the neutral phasor.
5. **Frequency dial (HUD, top centre, always visible):** an analogue dial 47.5-52.5 Hz whose central ±0.5 Hz takes half the arc (non-linear scale), with the pack's standard frequency range (`global` 49.95-50.05)
   painted green, UFLS stage ticks at the pack stages (`global`: 49.0 … 48.0 Hz), and a needle with real inertia (the needle is the simulation).
   - A digital readout (2 decimals) sits beside it, plus a RoCoF arrow.
   - It turns into a big centred dial in bullet time.
6. **Rotor-angle wheels (Ch 4, 7):** a translucent wheel at each synchronous plant shows δ relative to the system reference.
7. **Timeline strip (bottom drawer):** a stacked area chart of generation by type vs demand over 24 h, the frequency trace,
   event markers, and a scrubber.

### 5.3 How blackouts look (and become shareable)
- **In-world:** a breaker flashes and clunks open, an arc spark appears at a fault, and the line ribbon goes grey and slack. Towns go
  dark **street by street** (buildings switch off in random-but-seeded order over 0.5-2 s). Sirens are faint and distant; a dog
  barks on the island. A dark state at night is the image players will remember.
- **Bullet time:** the screen desaturates except energised elements. The frequency dial becomes the centre of attention.
  Each relay operation shows a short-lived label: "R3: 2.1 kA > pickup, 0.30 s".
- **Cascade replay:** after any failure, a replay mode shows a timeline with every trip as a node and the first domino
  ringed. Scrub, play at 0.25-4×, click a node to fly the camera there and open its "why" card.
- **Blackout Card (share):** a 1200×675 image of the dark map frame at peak cascade. It carries a title ("Lumen Province, 19:42,
  1.8 million homes dark in 11 s"), the cascade chain (first domino → … → last), the root cause in one plain sentence,
  the level, the design code and a QR-free short code.
  - PNG on every platform (Godot viewport capture).
  - On desktop, an animated GIF/WebP of the 6 s replay (frame capture, encoded by the sidecar with a bundled pure-JS
    encoder; no ffmpeg dependency).
- **Result Card:** stars, the three metrics, and your position on the histogram.

### 5.4 Palette (GRID accent theme for `kit.gd`)
| Token | Hex | Use |
|---|---|---|
| `bg` night indigo | `#0E1330` | Sky at night, drawer backgrounds (85% opacity) |
| `land` | `#1B2440` night / `#C9C2A8` day | Terrain base |
| `water` | `#0A1A2E` night / `#5FA8C8` day | Rivers, sea |
| `accent` grid cyan | `#39E1FF` | Active power, focus rings, primary buttons |
| `reactive` magenta | `#FF4FD8` | Q overlay, reactive devices |
| `warn` amber | `#FFB020` | Near-limit, alarms |
| `bad` red | `#FF3B3B` | Overload, trip, ENS |
| `good` green | `#39D98A` | In band, pass |
| `lights` sodium | `#FFC56B` | Town windows |
| `text` | `#E8ECF8` / dim `#9AA3C7` | UI text (≥ 13 px logical, from the GIGAWATT lesson) |
- **Light theme ("Day shift"):** the same accents darkened for 4.5:1 contrast on `#F4F1E8`. GIGAWATT's light themes failed
  contrast, so the layout audit runs a contrast check on every theme.
- **Typography:** a geometric display face for numbers and dials (tabular figures), a humanist sans for text. Both are open
  licence and bundled. No ALL-CAPS chips three frames deep (the GIGAWATT critique §7): one frame level, sentence case.

### 5.5 Audio direction
- **The hum (signature):** a synthesised 100 Hz fundamental plus 200/300 Hz partials (transformer magnetostriction at
  2× line frequency). Its **pitch scales with f/50**, so a 1 Hz dip is a 2% pitch drop, clearly audible. Its loudness
  follows total load. Near a busy substation the camera hears more hum (positional).
- **SFX:** breaker clunk (closing vs opening differ), relay tick (IDMT timers tick faster as they approach trip), arc
  crackle for faults, OLTC "chunk" per tap step, cap-bank switching thump, town power-down "whomp" + crowd groan, restore
  "click-hum" + a distant cheer (the island school cheer when Nia's lights come on), turbine spool for peakers.
- **Music:** adaptive electronic score in 4 stems (pad, bass, percussion, lead).
  - Stems fade in by **grid stress** = max(loading over 90%, voltage outside band, |Δf| > 0.1 Hz, reserve < largest unit).
  - Calm night-shift ambient when stable; percussion enters on alarms; full track in bullet time; silence and only the hum in a blackout.
  - Five tracks with different structures (the user rejected samey tracks in GIGAWATT), all synthesised by a
    `tools/audio` script as in GIGAWATT, so no licensing.
- **Settings:** master, music, sfx, hum (separate slider; "Hum is a frequency instrument, keep it on" hint), mono, reduced
  dynamic range for phones.

### 5.6 Layout of the screen (all platforms)
```
┌ HUD: level · clock 19:30 Day 1 · ⚙ speed ▶▶ · [  FREQUENCY DIAL  ] · budget $ · goals pill (2/3) · menu ┐
│ Build drawer (left)                 3D MAP (always visible)                   Inspector drawer (right) │
│                                                                                                         │
└ Timeline drawer (bottom): generation stack vs demand, f trace, events, scrubber · alarms ticker ───────┘
```
- Phone: one drawer at a time as a bottom/side sheet (40% default width, the GIGAWATT phone fix). HUD collapses to clock ·
  dial · goals · menu.
- Deck: like phone, with larger focus targets.

### 5.7 Rendering budget
- ≤ 400 draw calls at "state" zoom. Towers, buildings and panels use MultiMesh. Ribbons are one mesh per circuit, with the
  flow pulses in a scrolling-UV shader (per-instance speed/colour uniforms).
- 60 fps desktop and Deck; 60 fps target / 30 fps floor on Pixel 9a. Graphics tiers Potato/Low/Balanced/High from GIGAWATT's
  settings. Potato: no shadows, no clouds volume (flat cloud decals), half-rate pulses.
- No per-block hall rebuilds (GIGAWATT REVIEW-0.6 §3): the world diff-updates only changed elements.

---

## 6. Screens, drawers and input map

### 6.1 Screens and drawers
| Surface | Kind | Contents |
|---|---|---|
| Title | Screen (3D night map of Lumen Province behind; demo runs with **autosave off**, the GIGAWATT B1 lesson) | Continue, Campaign, Sandbox, Codex, Settings, Quit (desktop only) |
| Campaign map | Screen (3D state map, chapters as lit regions) | Level nodes with stars, chapter cards, licence grade |
| Level brief | Card over the map | Goal (no formula), story beat, pass conditions, budget, optional "Predict" field |
| **Build** drawer (left) | Drawer | Parts palette by category (Sources, Lines & cables, Substations, Compensation, Storage, Protection), each with key specs and price; "what this is" one-liner; Learner shows only parts the level allows |
| **Inspector** drawer (right) | Drawer | Selected element: numbers (V, θ, P, Q, I, loading, losses, pf), phasor mini-diagram, settings (tap, droop, relay, cap steps), "why" card if it caused a failure, delete/upgrade |
| **Timeline** drawer (bottom) | Drawer | 24 h stack chart, frequency trace, event markers, scrubber; replay controls in replay mode |
| **Curves** drawer (right, replaces Inspector) | Drawer | Level-specific instrument: P-V curve (L17), P-δ (L12/L25), time-current log-log (L24), impedance-vs-frequency (L08), merit-order stack (L26), GS/NR convergence (L18) |
| **Study** drawer (Engineer) | Drawer | N-1 test with results table (worst loading, min V per contingency), fault study at a bus, P-V at a bus |
| Codex | Overlay (map dimmed, visible) | Entries, labs, honest notes |
| Result | Card | Stars, metrics, histogram, Blackout/Result Card, Retry, Next, design code copy |
| Replay | Mode | Cascade timeline, why cards, export |
| Settings | Modal | Graphics, audio, controls (rebinding), accessibility (colour-blind palettes, reduced motion, text size, high contrast that *works*), layout, units (pu/SI; currency comes from the region pack) |
| Pause menu | Modal | Resume, Restart level, Codex, Settings, Save & quit (desktop) |

Modal discipline comes from the core (one `is_modal_open()`): hotkeys, Space and map clicks are inert behind modals;
Esc/B closes one layer; Android Back = close modal → close drawer → pause menu, never quit (GIGAWATT B2-B7 lessons).

### 6.2 Full input map
Mouse+keyboard (MK), controller (Steam Deck / Xbox layout; only with `CB_PAD=1` or a real pad), touch (phone).

| Interaction | Mouse + keyboard | Controller | Touch |
|---|---|---|---|
| Pan camera | WASD / arrows / middle-drag / edge-pan (off by default) | Left stick | One-finger drag on empty map |
| Orbit / tilt | Right-drag / Q,E | Right stick | Two-finger twist / vertical two-finger drag |
| Zoom | Wheel / +,− | LT/RT held + right stick Y, or D-pad up/down when no drawer focus | Pinch; on-screen +/− buttons |
| Map cursor | Mouse pointer | Virtual cursor on left stick, **snaps to nearest node/element within 48 px**; R3 toggles snap | Tap |
| Select / inspect element | Left-click | A on snapped element | Tap |
| Hover info | Hover tooltip (hides over any UI) | Cursor rest 0.4 s | Long-press 0.4 s shows the tooltip; release closes |
| Open Build drawer / palette | B or 1 | LB (cycles drawers left) or **X opens the radial build menu** at the cursor | "Build" dock button |
| Place a plant / substation / storage | Choose part, click a valid tile (ghost shows validity: green/red with reason), R rotates | Radial menu → part → A to place at snapped tile; Y rotates | Tap part → tap tile → confirm ✓ (two-step, no accidental builds) |
| String a line | Choose line type (voltage + conductor + circuits), click start node, click optional waypoints, click end node; Esc cancels; live length/cost/R/X readout | Choose line, A on start node, move cursor (snaps), A adds waypoint, A on end node; B cancels | Choose line, **drag from start node to end node** (waypoint: pause 0.5 s mid-drag), release on node; ✓ to confirm |
| Upgrade / reconductor / add circuit | Inspector → button | Inspector focus → A | Inspector → button |
| Delete | Select + Delete/X (confirm if it costs money back) | Select + hold Y 0.6 s | Inspector → Delete (confirm) |
| Set transformer tap | Inspector: −/+ stepper, or mouse wheel over the stepper; Auto toggle + set-point field | Inspector: D-pad left/right on stepper; A toggles Auto | −/+ stepper buttons (52 px) |
| Switch cap/reactor steps | Inspector stepper, or hotkey C cycles steps of the selected bank | D-pad on stepper | Stepper |
| Set droop / relay TMS / pickup | Inspector slider with typed field (numeric) | D-pad on slider (fine steps), LB/RB coarse | Slider + numeric keypad field (never full QWERTY) |
| Dispatch / commitment (L26, Engineer) | Curves drawer: drag schedule bars per plant per block; Auto-λ button | Focus grid, D-pad moves cell, LT/RT adjusts MW | Drag bars; tap a cell for a numeric keypad |
| Run / pause the day | Space (pause/resume), Enter "Run day" | Y = run/pause | ▶ button in HUD |
| Speed | 1-4 or `,` `.` | View button (BACK) cycles speed | Speed button cycles |
| Rewind 1 h (Learner) | Ctrl+Z after failure | Hold BACK 0.6 s | Rewind button on Result card |
| Overlays | V voltage, Q reactive, P phasor, F flow, L labels | Hold RB + face button (A=V, B=Q, X=P, Y=F) | Overlay chips row (top-right) |
| Bullet time control | Space pause, scroll = 0.25-1× speed, ←/→ step 100 ms | Y pause, LT/RT speed, D-pad step | Pause, speed chip, step buttons |
| Replay scrub | Drag timeline scrubber; click event node | LB/RB previous/next event, A fly to it | Drag scrubber; tap node |
| Predict (exam bridge) | Type in the field, Enter | Numeric pad dialog (D-pad digits) | Numeric keypad |
| Codex | F1 or 0; "?" on any card opens its entry | START → Codex | Codex dock button |
| N-1 test / fault study (Engineer) | Study drawer buttons; T hotkey runs N-1 | Study drawer, A | Study drawer buttons |
| Close top layer | Esc | B | Android Back / ✕ |
| Pause menu | Esc when no layer is open | START | Menu button / Back on empty |
| Screenshot / Blackout Card | F12 / Result card button | Result card button | Result card button (opens the Android share sheet) |

Rules:
- Every interactive control is pad-focusable (sliders, steppers, checkboxes, option lists; GIGAWATT's controls were not).
- Focus rings use one style.
- Hint-bar glyphs are drawn icons, not font characters (the GIGAWATT glyph bug).
- Touch targets are ≥ 52 px. Drags starting on a button cancel the press.
- Typing in any field never moves the camera.

---

## 7. Teaching design

### 7.1 Principles (from RESEARCH.md, made concrete)
1. **The equation is the rule.** The level's lesson is the binding constraint of its physics. Nothing is quizzed except
   exam-bridge predictions, which are optional and checked against the same engine.
2. **Attempt first, explain after (productive failure).** The brief never shows the formula. The naive build is
   cheap and tempting, and it fails visibly. The explanation uses the player's own numbers. Then the formula is consolidated in the Codex.
3. **Scaffold early, fade later.** Coach on in Ch 1-3 (Learner). Ch 4+ coach only on request. Engineer: Ch 1 only.
4. **Visible cause.** Every failure has a camera fly-to, a highlighted element, a "why" card, and a replay.

### 7.2 Coach (core coach framework; steps advance from real state)
Every coach step is `{id, text, why, target(state) → elementId|ui, done(state) → bool, device-aware text}`. A step never
advances on a timer and never lies about the device (GIGAWATT critique: the tutorial said "right-drag" on phones).

L01 coach script:
1. "Your battery hut is on the beach. Tap it." (done: selection = hut). Why: this is where the energy is stored.
2. "Choose a cable in Build." (done: a cable type is selected).
3. "Drag from the hut to the hamlet." (done: a cable exists).
4. "Press Run to watch the evening." (done: run started).
5. *(After the inevitable dim lights)* "The lamps are dim. Tap the cable." (done: cable selected). The Inspector shows
   R, I and the voltage drop.
6. "Try a thicker cable, or move the hut closer." (done: V_min ≥ 43.2 V in the live LF). Why: resistance falls as the
   copper gets thicker and the cable gets shorter.

Every level has 2-6 coach steps in Learner. Later levels use "**Needs you now**" (one card, the single most important thing)
instead of step chains. It is computed from state:
- the worst violation, ranked: ENS > red timers > voltage out of band > budget;
- with a fly-to button and, in Learner, a suggested fix from sensitivities (e.g. "+20 MVAr at Bus 7 raises Bus 9 by
  ~0.02 pu", from dV/dQ = (J⁻¹) entries).

The coach-follower persona (§8.6) must pass every Learner level by doing only what this card says. **That is the test
that the coach is right.**

### 7.3 Failure explanations (plain words, the player's numbers)
Each failure type has a template filled from the replay log and the state at the moment of failure. Examples (the numbers
come from the engine):

| Failure | Plain-words template (example render) |
|---|---|
| Brownout (DC/AC) | "The lamps in **Hamlet B** got only **24.9 V** instead of 48 V. Your **2.5 mm²** cable runs **300 m** out and back, so it has **4.45 Ω** of resistance. **5.2 A** flowing through it drops **23.1 V** before the power arrives (V = IR). Thicker copper or a shorter cable lowers R." |
| Line overload trip | "**The mill feeder (Weasel, 11 kV)** carried **122 A**, above its **115 A** rating, through the evening peak until its protection opened it. Most of that current was **reactive**: the mill's motors draw current that does no work (pf **0.70**). A capacitor bank near the mill supplies that reactive current locally." |
| Over-correction | "At **02:00** the mill was off but your **900 kVAr fixed** bank stayed on. With no motors to feed, the feeder ran at a **leading** power factor of **0.56**: the bank was pushing reactive current back towards the substation. Switched banks follow the load." |
| Resonance | "Your capacitor bank and the grid's inductance resonate near the **5th harmonic (250 Hz)**: h = √(S_sc/Q_c) = √(50/2) = **5.0**. The textile drives inject exactly that frequency, so the bank's current reached **1.6×** its rating and its fuse blew." |
| Ferranti over-voltage | "At **03:00** the 350 km line carried almost no load. Its own capacitance produced **≈ 190 MVAr** of charging, and the far end rose to **429 kV** (limit 420). A shunt reactor absorbs that charging." |
| Voltage collapse | "As the city's load rose past **λ = 0.93** of tonight's peak, no voltage could satisfy it: the grid passed the **nose of its P-V curve**. Capacitors give less help as voltage falls (Q ∝ V²)." |
| Frequency / UFLS | "Unit **K2 (500 MW)** tripped. The region's spinning mass (**H = 3.4 s** on **≈ 7,600 MVA**) slowed at **0.48 Hz/s**. Your units were running near full output, so their governors had little room to respond. Frequency touched **48.94 Hz** and the first load-shedding stage cut **345 MW**." |
| RoCoF cascade | "With most generation from inverters, inertia was only **1.1 s**. The 500 MW trip made frequency fall at **1.8 Hz/s**. Legacy rooftop inverters disconnect above **1 Hz/s**, which added **700 MW** more to the loss." |
| Pole slip | "Losing one circuit raised the line reactance from **0.25** to **0.50 pu**, so the maximum transferable power fell to **1.04 pu**, below the **1.10 pu** you were sending. The rotor angle ran past **180°**: the plant lost synchronism and tripped." |
| Breaker failure | "The fault current at **Bus 33-A** was **29.4 kA**, but its breaker can interrupt only **25 kA**. It failed, so backup protection opened the whole substation **0.2 s** later." |
| Mis-coordination | "The fault was beyond **R4**, but **R3** tripped first. At **2.1 kA** R3's curve is **0.21 s** and R4's is **0.38 s**. The upstream relay must be at least **0.3 s** slower." |
| Too-slow clearing | "Your relay and breaker cleared the fault in **180 ms**. The critical clearing time for this loading is **142 ms**. By then the rotor had gained too much speed (area A₁ > A₂)." |
| De-energised island | "When the tie opened, **Island East** had only solar and wind. Grid-following inverters need an existing grid to follow, so the island went dark." |

The structure is always: **what happened → the number that broke → the physical reason → one or two kinds of fix**, never
the exact fix in Engineer mode. Learner gets a hint ladder: (1) which element, (2) which quantity, (3) a specific suggestion.

### 7.4 The explain-after flow
1. **Fail.** The world shows it (lights out, sparks). The game auto-pauses and the replay opens on the first domino.
2. **"What happened"** card (template above) appears beside the element; the camera has flown to it.
3. **"Why" link** opens the Codex entry (unlocks on first failure), pre-filled with the player's numbers in the worked example.
4. **Retry options:** "Fix it" (back to build at the failing hour, Learner: rewind 1 h) or "Restart".
5. **On the pass after a failure,** a 2-line consolidation card appears: "You fixed it by adding 600 kVAr: pf went from 0.70 to 0.95 and line
   current fell 27%." It links the formula. The research brief says this consolidation step is where productive failure pays off.

### 7.5 Codex (v0.1 entry list: 44 entries)
Each entry has four parts:
- What it is: one paragraph.
- Why you care in GRID: one paragraph.
- The equation, with a worked example. Default numbers come from the oracles; once the player has met the concept, from their own grid.
- A mini-lab, or a link to a lab.

Every simplification's honest note links from the related entry.

| # | Entry | Lab |
|---|---|---|
| 1 | Voltage, current, resistance (Ohm's law) | Cable slider |
| 2 | Kirchhoff's current and voltage laws | Junction arrows |
| 3 | Resistivity and conductor size | — |
| 4 | Power and I²R losses | Voltage vs loss slider |
| 5 | Why we transmit at high voltage | Town line (AC-15/16) |
| 6 | Electromagnetic induction and the AC generator | Spinning coil + scope |
| 7 | RMS and peak values | Scope |
| 8 | Frequency, poles and speed (f = pN/120) | — |
| 9 | The transformer and turns ratio | Turns slider |
| 10 | Transformer losses and efficiency | — |
| 11 | Phasors | Phasor rotator |
| 12 | Inductive reactance (of lines and motors) | — |
| 13 | Capacitive reactance (of banks and cables) | — |
| 14 | Impedance of a feeder and its load | Feeder phasor drawer |
| 15 | Resonance in a grid (series compensation, parallel resonance) | Grid impedance sweep (shared with 20) |
| 16 | Power factor, real, reactive and apparent power | Power triangle |
| 17 | Wattless current | — |
| 18 | Capacitor banks and PF correction | kVAr calculator from state |
| 19 | Harmonics and THD | Spectrum |
| 20 | Parallel resonance and detuned reactors | Impedance sweep |
| 21 | Three-phase systems, line vs phase | Star/delta toggle |
| 22 | Neutral current and unbalance | 4-wire bench |
| 23 | Star vs delta connections | — |
| 24 | Motor starting and voltage dip | — |
| 25 | The synchronous generator and excitation | Phasor E = V + jXI |
| 26 | Power-angle curve and stability limit | P-δ |
| 27 | The per-unit system | Base converter |
| 28 | Transmission line models (short, π, long) | ABCD lab |
| 29 | Ferranti effect and line charging | Length slider |
| 30 | Surge impedance loading | — |
| 31 | Load flow: why it is non-linear | — |
| 32 | Gauss-Seidel and Newton-Raphson | Convergence plot |
| 33 | DC load flow approximation | AC vs DC |
| 34 | Tap changers (OLTC) and voltage control | — |
| 35 | Reactive power and voltage | dV/dQ from state |
| 36 | Voltage collapse and the P-V curve | Nose lab |
| 37 | Inertia, swing equation and RoCoF | Dial lab |
| 38 | Governor droop and reserves | Sharing lab |
| 39 | Renewables, the duck curve and storage | — |
| 40 | Under-frequency load shedding | — |
| 41 | Fault currents (symmetrical and SLG) and fault level | Fault lab |
| 42 | Circuit breakers and relays (IDMT, distance) | Time-current lab |
| 43 | Transient stability and equal-area criterion | Live A₁/A₂ |
| 44 | Economic dispatch, merit order, congestion | λ lab |

Plus the **Honest notes** section (S1-S37) and **Real-world grid stories**: India 30-31 July 2012, North America 2003,
South Australia 2016. Each story is told in two paragraphs with its official report cited, and linked from the level it
inspired. Facts are restricted to verified items (§4.8).

---

## 8. Engine architecture on cobanana-core

### 8.1 Layout (mirrors GIGAWATT; core supplies the generic parts)
```
grid/
  core/                         git submodule cobanana-core (protocol kit, RNG, registry, persistence, bridge, env, golden,
                                personas, numerics: real/complex LU, NR damping, RK4, dmath; godot addons; qa; android)
  src/
    types.ts                    GameState and all element types
    data/                       region-INDEPENDENT physics data only: line geometry formulas, governor/turbine models,
                                demand-class shapes, weather presets
    regions/                    region packs (§11): global/ (v0.1 default) and in/ (draft). Each: pack.ts (id, rulesetId,
                                currency, f0, gridcode, voltage levels, names), catalogues/*.ts (generators conductors
                                cables transformers compensation storage protection prices), strings/flavour.<locale>.json,
                                examBridges.ts, sources.md
    strings/                    en/*.json: every player-facing engine string (teaching messages, why-cards, coach,
                                Codex, level briefs) keyed; placeholders {chief}, {region}, {currency}… filled from the pack
    leaderboard/                solutionCode.ts (encode/decode), verify.ts (the pure verify export, §12)
    levels/                     L01.ts … L28.ts (map, scenario, allowed parts, pass rules, events, coach, targets, reference
                                solution, naive build) + sandbox/*.ts + histograms/*.json (generated)
    sim/
      network/ ybus.ts lineModel.ts transformer.ts islands.ts
      loadflow/ nr.ts gs.ts dcflow.ts continuation.ts sensitivities.ts
      bench/ mna.ts harmonics.ts fourwire.ts machine.ts
      dynamics/ frequency.ts smib.ts governors.ts
      protection/ faults.ts sequence.ts relays.ts breakers.ts
      thermal/ overload.ts
      dispatch/ commitment.ts ed.ts storage.ts hydro.ts cost.ts
      weather/ solar.ts wind.ts clouds.ts demand.ts
      explain/ diagnose.ts templates.ts needs.ts      (the "why" engine)
      systems/ *.ts  (one per pipeline stage, see 8.3)
      tick.ts                   PIPELINE + advanceBlock(state)
      event.ts                  runEventWindow(state, trigger) → {state, replay}
    engine/ protocol.ts state.ts actions/*.ts queries/*.ts persistence.ts
    env/ env.ts scenarios.ts agents.ts encode.ts (fixed-shape tensors)
    playtest/ personas.ts invariants.ts run.ts
    oracles/ ac.test.ts ps.test.ts game.test.ts (§9.1)
  godot/  main.gd world/{map_view.gd, lines.gd, towns.gd, plants.gd, weather.gd, overlays/*.gd} ui/{drawers,screens,cards}
  scripts/ tools/audio/ docs/ site/ .github/workflows/
```
Rules (GIGAWATT ARCHITECTURE.md, unchanged):
- `sim/` and `data/` never import `engine/`.
- Godot asks queries and sends actions; it never computes physics.
- Every action returns `{ok, message}` with a teaching message.

### 8.2 GameState (TypeScript shape, abridged but complete in fields)
```ts
interface GameState {
  /* extends core BaseState (game, seed, rng, tick = operator block count, mode, level, status, statusReason, log, saveVersion) */
  region: string /* pack id */; rulesetId: string /* pack id + data hash, §11 */;
  clock: { day: number; block: number /*0..95*/; phase: 'build'|'run'|'event'|'replay'|'result'; speed: 0|0.5|1|2|4 };
  map: { tileM: number; w: number; h: number; tiles: string /*terrain classes, base64 of a byte array: core state must be plain JSON*/; latitudeDeg: number };
  buses: Bus[];            // {id, name, x, y, kvNom, kind:'gen'|'load'|'sub'|'junction', vSet?, zone}
  branches: Branch[];      // {id, from, to, kind:'line'|'cable'|'xfmr', catalogId, circuits, lengthKm, waypoints[],
                           //  inService, tap?:{pos, auto?:{vSet, deadband, delayBlocks, counter}}, ratingMVA, timer?:{secLeft}}
  units: Unit[];           // {id, bus, catalogId, kind, online, P, Q, Pset, commit:{schedule[], minUpLeft, startLeft},
                           //  droopPct, H, mva, headroom, gridForming?}
  loads: Load[];           // {id, bus, class, Ppeak, pf, zip, shedFrac, ufls stage?, priority?:'hospital'|'school'}
  shunts: Shunt[];         // {id, bus, kind:'cap'|'reactor'|'svc'|'statcom', mvarStep, steps, on, auto?}
  storage: Storage[];      // {id, bus, catalogId, P, soc, mode:'schedule'|'threshold'|'ffr', schedule?}
  protection: { relays: Relay[]; breakers: Breaker[]; ufls: UflsStage[] };
  weather: { tempC: number; clouds: CloudBlob[]; windMs: number; stormActive: boolean };
  dispatch: { lambda: number; waterValue?: number; auto: boolean; schedule?: number[][] };
  solution: LoadFlowResult | null;   // per bus V, theta; converged, iterations, lambdaStar?, collapse sheds. NOT flows or the
                                      // Jacobian: queries recompute them (pure, deterministic) to keep the state small
  freq: { fHz: number; rocof: number };
  events: { queue: ScriptedEvent[]; log: EventLogEntry[] };
  replay: ReplayLog | null;           // last event only: event list + 20 ms-decimated f/δ traces, quantised; ≤ 64 KB
  actionLog: LoggedAction[];          // every committed player action with its tick: the source of the solution code (§12)
  metrics: { cost: number; capex: number; opex: number;   /* pack currency (US$ in global) */ ensMWh: number; lossesMWh: number;
             poorSupplyMin: number; ovMin: number; minMarginPct: number; nadirHz: number; maxRocof: number;
             tapOps: number; switchOps: number; co2t: number; predictions: Prediction[] };
  budget: { capexLimit: number; spent: number };
  history: HistoryRing;               // per block: demand, gen by type, f, worst V, worst loading, cost
  coach: { stepId?: string; hintsUsed: number; seen: string[] };
  codexUnlocked: string[]; status: 'playing'|'won'|'lost' /* core Status */; stars: 0|1|2|3;
}
```
**State-size rules (reviewer decision; the core engine `structuredClone`s the state on every action and hashes it):**
- Campaign state ≤ 256 KB as JSON, sandbox ≤ 1 MB, tested (`state-size.test.ts`) on the reference solution of every level
  after its full run and on the 7-day sandbox run.
- No typed arrays, Maps, classes or `undefined` tricks (core contract). `history` is a fixed ring of 96 × days entries.
- Derived data (branch flows, Jacobian, sensitivities, overlay colours, curve points) is computed by queries and may be
  memoised **outside** the state keyed by the state hash; never stored in it.
- Codex unlocks and stars across levels live in the profile save (core persistence), not in the level state.

### 8.3 Systems pipeline (operator block, in order; RNG streams are separate per system so insertion does not reshuffle)
1. `clock`: advance the block (day rollover).
2. `weather`: temperature, clouds advect (seeded), wind AR(1), scripted weather events.
3. `demand`: per-load P, Q for the block (profiles × temperature × scripted surges).
4. `renewables`: PV and wind available power; curtailment caps.
5. `commitment`: start/stop timers, min up/down, auto priority list (if auto), reserve check.
6. `dispatch`: λ-ED with ramp windows, hydro water value, storage strategy, (Engineer) penalty-factor loop.
7. `controls`: auto OLTC (delay counters), auto cap switching, queued player operator actions, UVLS.
8. `loadflow`: islands → NR (+ Q-limits, continuation, collapse sheds) → `solution`.
9. `limits`: thermal timers, voltage relays, Q-limits report, brownout accounting.
10. `events`: scripted contingencies/faults due this block, timers expiring → if triggered, call `runEventWindow`
   (frequency + protection + cascade). Returns the new state + replay; may set `status = failed`.
11. `blockFrequency`: quasi-steady Δf from the imbalance (if no event window ran).
12. `economics`: fuel, starts, VOM, losses, ENS·VOLL, CO₂, capex amortisation for the metric.
13. `metrics`: update level metrics (min margin, nadir, poor-supply minutes …).
14. `levelRules`: check pass/fail conditions; at the end of run → result + stars.
15. `explain`: `needsYouNow`, failure diagnosis records, Codex unlocks.
16. `history`: append the ring buffer.

`runEventWindow` (event clock): builds the dynamic model from the state, integrates RK4, and processes protection and the cascade per §3.6-3.9.
It is a pure function; it never mutates its input (same contract as GIGAWATT `advanceMonth`).

### 8.4 Actions (all `engine/actions/*`; each returns `{ok, message}`; invalid → teaching message)
- **build:** `placeUnit(catalogId, x, y)`, `placeSubstation(x, y, kvLevels[])`, `placeLoadTap(x,y)` (sandbox), `stringLine(fromBus, toBus, catalogId, circuits, waypoints[])`,
  `placeTransformer(busHV, busLV, catalogId)`, `placeShunt(bus, catalogId, steps)`, `placeStorage(bus, catalogId)`,
  `placeRelay(branch, end, kind)`, `setBreaker(branch, end, catalogId)`, `upgradeBranch(id, catalogId|circuits)`, `demolish(id)`
- **settings:** `setTap(branchId, pos)`, `setTapAuto(branchId, vSet, deadband, delay)`, `setShuntSteps(id, n)`, `setShuntAuto(id, vBand)`,
  `setDroop(unitId, pct)`, `setRelay(id, {pickupA, tms, curve, inst?})`, `setUflsMap(stage, loadIds[])`, `setInverterMode(id, 'pf'|'v')`,
  `setStorageMode(id, mode, params)`
- **operate:** `commit(unitId, on, atBlock?)`, `setDispatch(unitId, MW, blocks?)`, `setAutoDispatch(bool)`, `shedLoad(loadId, frac)`,
  `switchBranch(id, inService)`, `run()`, `pause()`, `setSpeed(x)`, `stepBlock()`, `rewindHour()` (Learner)
- **study (Engineer, free in time but logged):** `runN1()`, `faultStudy(bus, type)`, `pvCurve(bus)` (these are queries, listed here because the
  env exposes them as tools)
- **meta:** `predict(questionId, value)`, `loadDesignCode(code)`, `startLevel(id, mode)`, `restartLevel()`, `save(slot)`, `load(slot)`

### 8.5 Queries (read-only, `engine/queries/*`; names unique-checked at load)
`levelBrief`, `buildPalette`, `placementCheck(catalogId,x,y)`, `lineQuote(from,to,catalogId,circuits,waypoints)` (length, R, X, B,
rating, cost), `busInfo(id)`, `branchInfo(id)`, `unitInfo(id)`, `phasors(busId)`, `solutionSummary`, `overlay(kind)` (per-element
colours/values for V/Q/flow), `timeline`, `frequencyTrace`, `replay`, `whyCard(eventId)`, `needsYouNow`, `costBreakdown`,
`curves(kind, params)` (P-V, P-δ, TCC, impedance sweep, merit stack, convergence), `n1Results`, `faultResult`, `histogram(levelId,
metric)`, `codex(entryId)`, `codexStatus`, `designCode`, `stars`.

### 8.6 Agent environment and personas
**Env (core Gym kit):** `reset({seed, levelId, mode}) → obs`; `step(action) → {obs, reward, done, truncated, info}`; `legalActions()`
(dry-run probes, as in GIGAWATT); `observe()`; `describe()` (text for LLM agents); `hash()`.

- **Observation:** structured JSON plus a fixed-shape tensor encoding (`env/encode.ts`; GIGAWATT lacked one):
  - per bus (padded to 60): [kvNom, |V|, θ, P_load, Q_load, P_gen, Q_gen, type one-hot, shed frac, x, y];
  - per branch (padded to 90): [from, to, r, x, b, rating, loading, P, Q, in-service, timer];
  - per unit (padded to 24): [type one-hot, P, P_min, P_max, H, droop, online];
  - global: [block, day, f, RoCoF, budget left, ENS, cost, phase].
  - Masks mark the padding.
- **Action space:** parameterised discrete: (action type ∈ 20, target ids, catalogue id, continuous params quantised to
  the UI's steps). `legalActions()` returns the valid set (capped 512, sampled with the seed when larger).
- **Reward:** at the end of a run, +100·stars − cost/cost_A·10 − ENS·5 (per level). Shaping per block:
  −(ENS_block + poor-supply minutes/60). −0.01 per rejected action.
- **Done/truncated:** done on pass/fail; truncated at the step cap (2,000 actions).

**Personas (`playtest/personas.ts`; every persona plays every level in Learner and Engineer):**
| Persona | Behaviour | Must |
|---|---|---|
| `idle` | Presses Run, nothing else | **Fail every level** (no level passes with the initial state) |
| `expert` | Loads the level's authored reference solution, then runs | **★★★ on every level** |
| `searcher` | Solver bot (§9.3): beam search + coordinate descent over the build space, no inside knowledge | **≥ ★ on every level within its budget** |
| `coach-follower` | Only does what the coach / Needs-you-now card suggests (Learner) | **≥ ★ on every Learner level**, ≤ 3 retries |
| `novice` | Heuristic with seeded mistakes: picks the cheapest part first, ignores the Inspector, retries with the next size up after a failure | Passes Ch 1-3 within 5 attempts; produces failure explanations every time it fails (each failure has a template) |
| `greedy-cheese` | Degenerate strategies: diesel at every town, every cap maxed, every line doubled, deliberate load shedding, maxed reserve, all relays instantaneous, opening every line except one | **Never better than ★** (fails or is over budget). Any ★★ is a cheese bug |
| `monkey` | Random legal actions + random runs (Haiku-style soak in the engine) | No invariant violation, no crash, no NaN over 10,000 actions × 20 seeds |

---

## 9. Test plan (quality is the jewel)

The test layers, in the order CI runs them:
1. `tsc --noEmit`.
2. Unit tests per rule module (TDD: written before the module).
3. **Oracle tests (§9.1).**
4. Property and fuzz tests (§9.2).
5. Level tests: solvability, lesson gates, cheese, balance (§9.3-9.5).
6. Golden trajectories (§9.6).
7. Performance budgets (§9.7).
8. Personas sweep.
9. Godot smoke, layout audit and UI tests (§9.8).
10. Playtest rounds with fun hypotheses (§9.9).

Never weaken a test to make it pass. Never regenerate goldens to hide a change.

### 9.1 Textbook-oracle problems (71: 50 textbook, 21 GRID-model)
**How they were produced:**
- Two Sonnet workers solved them independently in Python (numpy/scipy, exact π).
- A third Sonnet re-solved a 15-problem sample blind (C1-C15). It matched every value; one apparent mismatch was an
  ambiguity in the checker's brief.
- The design director re-solved the hardest (3-bus NR, GS iteration 1, CCT, loss-coordinated dispatch, long line,
  2-bus) and computed the G-series.
- Scripts (`ac_oracles.py`, `ps_oracles.py`, `crosscheck.py`, `director_check.py`, and the level-scenario checks `lines.py`, `l07.py`, `l17.py`, `l19.py`) are in `design/grid/oracles/`; implementation copies them to `grid/tools/oracles/`.

**Source labels are honest:**
- Workers labelled rows "NCERT-style / JEE-style / Saadat-style / textbook-style" unless sure of an exact example number.
- None was cited to an exact example.
- **Before v0.1 the educator reviewer attaches exact NCERT XII ch 6-7 example/exercise numbers**, and Grainger-Stevenson /
  Glover / Kothari-Nagrath / GATE numbers where they match (§10.3).
- Numbers are recomputed from the inputs, never copied from memory.
- Where textbooks round (X_L = 8 Ω, X_C = 4 Ω), the exact value is the oracle, the tolerance covers the rounding, and the
  textbook figure is noted.

**What each test calls:**
- the bench MNA (`mna.solve`);
- the line models (`lineABCD`);
- the load flow (`nr.solve`, `gs.iterate`);
- the fault module (`faults.symmetrical/slg/ll`);
- the dispatch module (`ed.lambda`, `ed.withLosses`);
- the dynamics (`smib`, `frequency`);
- or the closed-form exam functions.

Tolerance is relative unless marked abs. **Reviewer rule:** tests compare the engine against the *unrounded* reference
value produced by the oracle scripts (stored with ≥ 10 significant digits in `tools/oracles/expected.json`), never against
the rounded digits printed in these tables; a blind re-solve showed ~18 rows whose printed digits differ from the exact
value by more than their stated tolerance (all rounding, none wrong). Row notes: PS-17/18/19 use S_base 100 MVA, line zone
138 kV, transformer X0 = X1 = 0.10; G-17 puts the ideal tap on the bus-1 side with x_t on the bus-2 side (the §3.3 π
convention); G-04's Q_c is the capacitor's own rating V²/X_c.

#### AC: Class 12 / JEE (NCERT XII ch 6-7 style)
| ID | Topic | Inputs | Expected | Tol |
|---|---|---|---|---|
| AC-01 | RMS in R | R = 100 Ω, V = 220 V rms, 50 Hz | I = 2.200 A; P = 484.0 W | 1e-6 |
| AC-02 | Peak ↔ rms | V_peak = 300 V; I_rms = 10 A | V_rms = 212.1 V; I_peak = 14.14 A | 1e-4 |
| AC-03 | X_L | L = 44 mH, 220 V, 50 Hz | X_L = 13.82 Ω; I = 15.92 A | 1e-4 |
| AC-04 | X_C | C = 60 µF, 110 V, 60 Hz | X_C = 44.21 Ω; I = 2.488 A | 1e-4 |
| AC-05 | LCR \|Z\| | R = 3 Ω, L = 25.48 mH, C = 796 µF, 50 Hz | \|Z\| = 5.005 Ω (textbook 5 Ω with rounded X) | 2e-3 |
| AC-06 | LCR phase | as AC-05 | φ = +53.17° (current lags) | 3e-3 |
| AC-07 | LCR I, pf, P | as AC-05, 230 V | I = 45.96 A; pf = 0.5994; P = 6336 W (textbook 46 A, 0.6, 6348 W) | 3e-3 |
| AC-08 | RC phasor | R = 100 Ω, C = 20 µF, 220 V, 50 Hz | \|Z\| = 187.96 Ω; I leads by 57.86°; I = 1.170 A; pf = 0.5320 | 1e-4 |
| AC-09 | Resonance | L = 2.0 H, C = 32 µF, R = 10 Ω | ω₀ = 125.0 rad/s; f₀ = 19.89 Hz; Q = 25.00 | 1e-6 |
| AC-10 | Bandwidth | as AC-09 | Δω = 5.000 rad/s; Δf = 0.7958 Hz | 1e-6 |
| AC-11 | Voltage magnification | AC-09, 220 V | I = 22.00 A; V_L = V_C = 5500 V | 1e-6 |
| AC-12 | Pure LC, wattless | L = 80 mH, C = 60 µF, R = 0, 230 V, 50 Hz | X_L = 25.13 Ω; X_C = 53.05 Ω; I = 8.238 A rms (11.65 A amp, leads); P = 0 | 1e-4 |
| AC-13 | Transformer turns/currents | 2300/230 V, N_p = 4000, 50 kW ideal | N_s = 400; I_s = 217.4 A; I_p = 21.74 A | 1e-4 |
| AC-14 | Transformer efficiency | 220 V·5 A in, 22 V·40 A out, same pf | η = 80.00% | 1e-6 |
| AC-15 | Town line, low V | 800 kW, 15 Ω loop, 4000 V | I = 200.0 A; loss = 600.0 kW | 1e-6 |
| AC-16 | Town line, high V | 800 kW, 15 Ω loop, 40 kV | I = 20.00 A; loss = 6.000 kW | 1e-6 |
| AC-17 | AC generator emf | N = 20, r = 8.0 cm, B = 0.030 T, ω = 50 rad/s, R = 10 Ω | e₀ = 0.6032 V; I₀ = 0.06032 A; P_avg = 0.01819 W | 1e-3 |
| AC-18 | RL phasor sum | V_R = 120 V, V_L = 160 V | V = 200.0 V; φ = 53.13° | 1e-5 |
| AC-19 | Mutual inductance | M = 1.5 H, ΔI = 20 A in 0.5 s | \|emf\| = 60.00 V | 1e-6 |
| AC-20 | LC frequency | L = 27 mH, C = 30 µF | ω = 1111 rad/s; f = 176.8 Hz; T = 5.655 ms | 1e-4 |
| AC-21 | LC energy | as AC-20, q₀ = 6.0 mC | E = 0.6000 J; I_max = 6.667 A | 1e-6 |
| AC-22 | Choke vs resistor | 220 V, 50 Hz, limit 5 A | Z = 44.00 Ω; resistor 1100 W; L = 0.1401 H; choke 0 W | 1e-4 |

#### PS: EE power systems (Saadat / Glover / Grainger-Stevenson / Kothari-Nagrath / GATE style)
Conventions: angles in degrees, impedances per phase (Y-equivalent) in Ω or pu on stated base, 3φ MVA base, LL kV base,
pre-fault 1.0 pu, S_ij leaves bus i.

| ID | Topic | Inputs | Expected | Tol |
|---|---|---|---|---|
| PS-01 | pu bases | 100 MVA, 132 kV; 20 Ω, 50 Ω | Z_b = 174.2 Ω; I_b = 437.4 A; 0.1148, 0.2870 pu | 1e-4 |
| PS-02 | Change of base | 30 MVA 13.8 kV X = 0.15 → 100 MVA 13.2 kV | 0.5465 pu | 1e-4 |
| PS-03 | Impedance diagram | 100 MVA; zones 13.8/138/69 kV; gen 30 MVA X 0.20; T1 50 MVA X 0.10; line 40 + j100 Ω @138; T2 40 MVA X 0.08 | j0.6667; j0.2000; 0.2100 + j0.5251; j0.2000 | 1e-4 |
| PS-04 | Δ load | 400 V LL, Z = 30∠30° Ω/ph Δ | I_ph = 13.33 A; I_L = 23.09 A; P = 13.86 kW; Q = 8.000 kvar | 1e-4 |
| PS-05 | PF capacitor | 500 kW, 440 V, 50 Hz, pf 0.70 → 0.95 | Q_c = 345.8 kvar; C_Y = 5685 µF; C_Δ = 1895 µF | 1e-3 |
| PS-06 | Short line | Z = 10 + j40 Ω; 50 MW pf 0.8 lag @132 kV | V_S = 147.67 kV; δ = 4.782°; VR = 11.87%; loss 2.242 MW; η = 95.71% | 1e-3 |
| PS-07 | Nominal-π ABCD | Z = 20 + j80 Ω, Y = j5e-4 S; 60 MW pf 0.85 @132 kV | A = 0.9800 + j0.0050; B = 82.46∠75.96° Ω; V_S = 164.0 kV; VR = 26.79% | 1e-3 |
| PS-08 | Long line, Ferranti | 300 km; z = 0.1 + j0.5 Ω/km; y = j3.3e-6 S/km; V_S = 220 kV | A = 0.92663 + j0.014485; Z_c = 393.08∠−5.655° Ω; V_R0 = 237.39 kV (+7.905%) | 1e-3 |
| PS-09 | SIL | L = 1.0 mH/km, C = 11 nF/km | Z_c = 301.5 Ω; SIL₄₀₀ = 530.7 MW; SIL₂₂₀ = 160.5 MW | 1e-4 |
| PS-10 | Loss vs voltage | 100 MW upf, R = 10 Ω/ph, 132 vs 220 kV | 437.4 A, 5.739 MW; 262.4 A, 2.066 MW | 1e-3 |
| PS-11 | Line efficiency | as PS-06 | η = 95.71%; loss 2.242 MW | 1e-3 |
| PS-12 | Y_bus with charging | 1-2: 0.02 + j0.06, B 0.06; 1-3: 0.08 + j0.24, B 0.05; 2-3: 0.06 + j0.18, B 0.04 | Y11 = 6.25 − j18.695; Y12 = −5 + j15; Y13 = −1.25 + j3.75; Y22 = 6.6667 − j19.95; Y23 = −1.6667 + j5; Y33 = 2.9167 − j8.705 | 1e-5 abs |
| PS-13 | 2-bus analytic LF | V1 = 1∠0; Z = 0.05 + j0.15; S_L = 0.8 + j0.4 | \|V2\| = 0.87987∠−6.526°; loss 0.05167 + j0.15501; S1 = 0.85167 + j0.55501 | 1e-4 |
| PS-14 | GS iteration 1 | 3-bus data below; flat start | V2⁽¹⁾ = 1.01331 − j0.03100; Q3⁽¹⁾ = 0.71206 pu; ∠V3⁽¹⁾ = 0.2433° | 1e-5 abs |
| PS-15 | NR converged | 3-bus data below | \|V2\| = 1.01334∠−1.3772°; V3 = 1.05∠0.4751°; ≤ 4 iterations | 1e-5 pu, 1e-3° |
| PS-16 | NR flows and losses | 3-bus data below | Slack 62.565 MW, 61.290 Mvar; Q3 = 60.915 Mvar; S12 = 89.951 + j52.035; S23 = −168.608 − j62.083; loss 5.965 MW, 12.005 Mvar | 1e-4 |
| PS-17 | 3φ fault | gen X 0.15, T X 0.10 (Δ-Yg), line X 40 Ω @138 kV | Z1 = j0.4600; I_f = 2.1737 pu = 0.9094 kA; 217.4 MVA | 1e-4 |
| PS-18 | SLG fault | + gen X2 0.17, X0 0.05 (blocked by Δ), line X0 120 Ω | Z2 = j0.4800; Z0 = j0.7301; I_a = 1.7962 pu = 0.7515 kA | 1e-4 |
| PS-19 | LL fault | as PS-18 | \|I_b\| = 1.8425 pu = 0.7708 kA | 1e-4 |
| PS-20 | ED, no limits | C1 = 500 + 5.3P + 0.004P²; C2 = 400 + 5.5P + 0.006P²; C3 = 200 + 5.8P + 0.009P²; D = 975 MW | λ = 9.163; 482.89/305.26/186.84 MW; 8228.03 $/h | 1e-4 |
| PS-21 | ED, limits binding | same; D = 1000; P1 ∈ [200,450], P2 ∈ [150,350], P3 ∈ [100,300] | λ = 9.580; 450/340/210 MW; 8473.5 $/h | 1e-4 |
| PS-22 | ED with B-losses | C1 = 300 + 8P + 0.004P²; C2 = 250 + 9P + 0.005P²; B11 = 1e-4, B12 = −2e-5, B22 = 1.5e-4; D = 300 | P1 = 213.67; P2 = 91.365 MW; λ = 10.104; P_L = 5.0368 MW | 1e-4 |
| PS-23 | Swing / RoCoF | 500 MVA, H = 5 s, 60 Hz, ΔP = 0.2 pu | KE = 2500 MJ; RoCoF = 1.200 Hz/s | 1e-4 |
| PS-24 | Equal-area CCT | P_m = 0.8, P_max = 1.8 pre/post, terminal 3φ fault, H = 5, 60 Hz | δ₀ = 26.39°; δ_cr = 84.77°; t_cr = 0.2600 s (RK4 0.25996) | 1e-3 |
| PS-25 | Droop Δf | R = 0.05, D = 0.8, ΔP = 0.01 pu, 50 Hz | Δf = −0.02404 Hz | 1e-4 |
| PS-26 | Droop sharing | G1 500 MVA 4%; G2 300 MVA 5%; +100 MW; D = 0; 50 Hz | Δf = −0.2703 Hz; 67.57/32.43 MW | 1e-4 |
| PS-27 | Excitation emf | V_t = 1, I = 1 pf 0.8 lag, X_s = 1.2 | E = 1.9698∠29.17° pu | 1e-4 |
| PS-28 | Max power | E = 1.9698, V = 1, X = 1.2 | P_max = 1.6415 pu; P(29.17°) = 0.8000 | 1e-4 |

**3-bus load-flow data (PS-14/15/16):**
- 100 MVA base, no line charging.
- Bus 1: slack 1.05∠0.
- Bus 2: PQ load 256.6 MW + j110.2 Mvar.
- Bus 3: PV, P_g = 200 MW, |V| = 1.05, no load.
- Lines (series pu): 1-2 0.02 + j0.04; 1-3 0.01 + j0.03; 2-3 0.0125 + j0.025.
- GS order: bus 2 first, then bus 3 using the new V2. The PV magnitude is rescaled to 1.05 after the update.

#### G: GRID model oracles (model definitions and derived checks; director-computed)
| ID | Topic | Inputs | Expected | Tol |
|---|---|---|---|---|
| G-01 | Resistance formula | Cu ρ = 1.724e-8 Ω·m, 2.5 mm², 2 × 300 m, 48 V, 4.8 Ω load | R_c = 4.138 Ω; I = 5.371 A; V_load = 25.78 V | 1e-3 |
| G-01b | L01 naive (catalogue path) | IEC 60228 2.5 mm² = 7.41 Ω/km, 2 × 300 m, 48 V ideal, 4.8 Ω | R_c = 4.446 Ω; I = 5.191 A; V_load = 24.92 V; loss 48.1% | 1e-3 |
| G-02 | L01 lesson builds | 25 mm² (0.727 Ω/km) at 300 m; 10 mm² (1.83) at 120 m | V_load = 44.00 V (loss 8.33%); 43.98 V (8.38%) | 1e-3 |
| G-03 | Parallel resonance order | 11 kV, S_sc = 50 MVA, Q_c = 2 MVAr | h_r = 5.000; f_r = 250.0 Hz | 1e-6 |
| G-04 | Detuned bank | as G-03 + 7% reactor | series h = 3.780; parallel h = 3.015; Q_eff = 2.1505 MVAr | 1e-4 |
| G-05 | Neutral current | I_a = 10∠0, I_b = 6∠−120°, I_c = 4∠120° A | \|I_N\| = 5.2915 A ∠−19.11° | 1e-4 |
| G-06 | IDMT SI | TMS 0.1, I/I_s = 10 | t = 0.2971 s | 1e-4 |
| G-07 | Grading | downstream 0.2971 s; upstream I_s = 600 A at 4000 A; CTI 0.3 s | TMS₂ = 0.1649; (VI/EI at M = 10, TMS 0.1: 0.1500 s / 0.0808 s) | 1e-3 |
| G-08 | Wind curve | 3 MW, 3/12/25 m/s, v = 8 m/s | 0.8554 MW | 1e-4 |
| G-09 | BESS SoC | η_rt = 0.86, 50 MW × 1 h discharge | ΔSoC = 53.916 MWh | 1e-5 |
| G-10 | P-V nose | V₁ = 1, X = 0.15 pu, unity-pf load | P_max = 3.3333 pu; V_nose = 0.7071 | 1e-4 |
| G-11 | Lossless Ferranti | L = 1 mH/km, C = 11 nF/km, 300 km, 50 Hz | β = 1.04195e-3 rad/km; rise = 5.093% | 1e-4 |
| G-12 | Frequency response vs analytic | H = 5, D = 1, R = 0.05, T_G = 0.5 (first-order), ΔP_L = 0.1 pu | Δf(1 s) = −0.302584 Hz; nadir −0.30752 Hz @1.174 s; Δf_ss = −0.238095 Hz; RoCoF₀ = −0.5000 Hz/s; RK4 dt 10 ms = analytic to 1e-6 | 1e-5 abs |
| G-13 | Hydro inverse response | (1 − T_W s)/(1 + 0.5 T_W s), T_W = 2 s, unit step | y(0⁺) = −2; y(1 s) = −0.10364 | 1e-5 |
| G-14 | PV model | 100 MW_dc, G = 800 W/m², T_cell 45 °C, −0.4%/°C | 73.60 MW_dc | 1e-6 |
| G-15 | THD | V₅ = 4%, V₇ = 3% | THD = 5.000% | 1e-6 |
| G-16 | Marginal fuel cost | HR 10.3 MJ/kWh, US$2.60/GJ (`global` coal) | US$26.78/MWh (`in` pack variant: ₹220/GJ → ₹2,266/MWh) | 1e-6 |
| G-17 | Tap convention | V₁ = 1, x_t = 0.1, load 0.5 + j0.2, τ = 1.05 vs 1.00 | \|V₂\| = 0.92934 vs 0.97825 | 1e-4 |
| G-18 | Parallel sources | two 0.2 pu sources | I_f = 10.00 pu | 1e-9 |
| G-19 | f = pN/120 | 4-pole 1500 rpm; 24-pole hydro | 50.0 Hz; 250.0 rpm | exact |
| G-20 | Balanced phasors | 1 + a + a² | 0 | 1e-12 abs |

### 9.2 Conservation and property tests (seeded fuzz: 2,000 random networks per property per CI run; 50,000 nightly)
Random case generator (`oracles/gen.ts`):
- 3-60 buses, connected or with deliberate islands;
- r/x ∈ catalogue ranges; taps ±10%; caps and reactors; PV/PQ mixes;
- loads within 30-120% of a feasible base; seeds logged.

| # | Property | Assertion |
|---|---|---|
| P1 | Power balance | ΣP_gen − ΣP_load − ΣP_loss = 0 and the Q analogue including shunts and charging; \|·\| < 1e-8 pu |
| P2 | KCL at every bus | Σ branch flows out of bus i + shunt = injection S_i; < 1e-8 pu |
| P3 | Tellegen (bench + grid) | Σ over all elements V_k·I_k* = 0 (complex), < 1e-9 relative |
| P4 | Losses ≥ 0 | Every passive branch: P_from + P_to ≥ −1e-12 (r ≥ 0, no phase shift); total losses ≥ 0 |
| P5 | Reciprocity | Y_bus = Y_busᵀ without phase shifters; Z_ij = Z_ji from LU columns |
| P6 | Per-unit consistency | The same network solved in SI (bench MNA, Ω/V, constant-Z loads) and in pu (LF, constant-Z loads) gives identical physical V and I (< 1e-9) |
| P7 | Transformer pu invariance | Impedance referred to HV or LV side is identical in pu |
| P8 | Line-model limits | Exact π → nominal π as ℓ → 0 (error O(ℓ²)); AD − BC = 1; A = D |
| P9 | Ordering invariance | Permuting bus/branch ids gives the same physical solution |
| P10 | NR = GS | Both converge to the same solution (< 1e-8) on cases with a unique high-voltage solution |
| P11 | Warm = flat start | Same converged solution (high-voltage branch) |
| P12 | Q limits honoured | Every PV unit's Q within [Q_min, Q_max] after solve |
| P13 | Islands | De-energised islands have zero flow; their ENS equals their load |
| P14 | Monotonic remedies | In a radial case: lower R never lowers load voltage; adding a capacitor at a PQ bus raises its \|V\| (normal operating region) |
| P15 | BESS energy | Σ(η_c E_ch) − Σ(E_dis/η_d) = ΔSoC over any schedule |
| P16 | Frequency steady state | With deadband 0 and no limits hit, the event window ends at −ΔP/β within 1e-4 Hz. With the ±0.03 Hz deadband, it ends at the deadband-shifted analytic value |
| P17 | RoCoF at 0⁺ | = ΔP·f₀/(2·H_sys·S_sys) within 1e-6 |
| P18 | Dispatch KKT | Units off limits have equal incremental cost (< 1e-6); at max IC ≤ λ; at min IC ≥ λ; ΣP = demand (+losses) |
| P19 | Fault superposition | V_post = V_pre − Z·I_f; KCL at the fault bus; balanced 3φ fault ⇒ zero negative/zero-sequence current |
| P20 | Relay monotonicity | Higher current ⇒ shorter time; higher TMS ⇒ longer time; no trip below 1.1·I_s |
| P21 | Harmonic solver at h = 1 | Equals the fundamental MNA solution |
| P22 | Balanced 4-wire | I_N < 1e-12 A for balanced loads |
| P23 | Determinism | Same seed + actions ⇒ identical per-block hash, twice, and across the bridge (desktop vs headless) |
| P24 | No NaN | Finite-number guard over every query result after random action sequences (monkey) |
| P25 | Continuation correctness | When NR fails, λ\* is convergent and λ\* + 0.01 is not (or λ\* = 1) |

### 9.3 Solvability bot per level
- **`searcher` persona:**
  1. Candidate build actions come from the level's declared **site list** (positions, allowed parts, parameter steps),
     which keeps the space finite.
  2. Beam search (width 32) on build actions, scored by a fast surrogate: a single-block LF at the peak block plus the
     worst event.
  3. Full day-run evaluation of the top 8 per depth.
  4. Coordinate descent on continuous settings (taps, droops, TMS, cap steps) for passing designs.
  - Budget (reviewer fix; 20,000 *full* day-runs at ≈ 400 ms would be > 2 h per level): ≤ 20,000 **surrogate**
    evaluations (single-block LF + worst event, ≈ 3-10 ms) and ≤ 300 **full** runs per level, seeded; ≤ 3 min per level
    on desktop.
  - CI (every push): replays the level's cached searcher result (`levels/search/Lxx.json`, the best passing action list,
    keyed by level hash + rulesetId) through the engine and asserts ≥ ★; a stale cache fails CI. The full search runs
    nightly and in `scripts/build-histograms.mjs`.
- **Assertions per level:**
  - (a) the searcher finds ≥ ★;
  - (b) the authored **reference solution** gives ★★★ (expert persona);
  - (c) the reference cost ≤ target B.
- **Population:** the searcher's distinct passing designs (plus 300 noisy re-runs of the novice persona) form the
  **histogram population** written to `levels/histograms/Lxx.json` by `scripts/build-histograms.mjs`.
  CI fails if the file is stale vs the level hash (like GIGAWATT's wiki staleness check).

### 9.4 Lesson gates and dominant-strategy (cheese) search
1. **Lesson gate:**
   - Each level declares a `naiveBuild` and the expected failure kind (e.g. L07 → `overload|undervoltage`; L08 → `capFuse`;
     L15 → `overvoltage`). The test asserts it fails with exactly that kind, before 80% of the day-run (≤ 58 s real at 1×).
   - Each level also declares a `lessonBuild` that must pass ★.
2. **Lesson-bypass search:** levels whose lesson is a specific capability declare `lessonParts` (L07 capacitors; L15
   reactors/SVC; L19 reserve/droop/BESS; L23 breaker/reactor/split). The searcher, run with those parts removed, must
   **not** find ★. Multi-style levels (L16) list alternative lesson sets; removing all of them must fail.
3. **Greedy-cheese persona:** must score ≤ ★ on every level. Any ★★ is a bug.
4. **Single-knob extremes:** for every continuous parameter, set it to each extreme alone. No single extreme may reach ★★★.
5. **Shedding is never a strategy:** any design that uses deliberate `shedLoad` gets ENS cost at VOLL. A test checks
   that no ★★ design has ENS > 0 unless the level allows it.
6. **Budget sanity:** level budget ≥ 1.3 × the cheapest searcher pass, and < cost of the "everything doubled" overbuild, so
   overbuilding cannot pass.

### 9.5 Balance targets as tests (`balance.test.ts`)
- **Personas:**
  - `idle` fails every built level (must-ship + any stretch built).
  - `expert` gets ★★★ on every built level.
  - `searcher` gets ≥ ★ on all.
  - `coach-follower` gets ≥ ★ on all Learner levels within 3 retries.
  - `greedy-cheese` gets ≤ ★.
- **Pacing:**
  - Every level's naive build fails within 58 s real at 1×.
  - Every level's expert script finishes in ≤ 8 min. The time model is 4 s per build action + run time.
  - Phone levels: ≤ 25 build actions for the reference solution in Ch 1-3, ≤ 40 later.
- **Histograms:** A = median and B = 15th percentile of the population. The reference solution sits ≤ B; targets are frozen
  in the level file (a test fails if the frozen value drifts > 2% from the regenerated population).
- **Exam bridges:** the engine's answers to each prediction question equal the matching oracle (L06 ↔ AC-15/16, L13 ↔ PS-27/28, L18 ↔ PS-14/15/16, L22 ↔ PS-23/25/26, L27 ↔ PS-17/18/20/21/22/24).
- **Region packs, leaderboard, strings, state size:** the §11.4 pack tests, the §12.3 `verify` tests, the §12.6
  string lint and the §8.2 state-size test run in CI.
- **Sandbox:** the "Lumen 2030" scenario run by an operator persona for 7 days has ENS < 0.1% and no invariant violation.
  The monkey runs 20 × 10,000 actions clean.

### 9.6 Golden trajectories (`trajectory.golden.test.ts`; `GOLDEN_UPDATE=1` only for deliberate rule changes, stated in the commit)
- Per level: the reference-solution day-run, with a per-block hash of the quantised state.
- Per level: the naive-build failure, with a hash of the replay event list (element, time to 1 ms, cause).
- Sandbox 2030: a 7-day operator run with per-block hashes.
- Monkey: a 500-action trace on 3 seeds.
- Bridge parity: the same script through the stdio bridge and in-process gives identical hashes.

### 9.7 Performance tests (`perf.test.ts`; desktop budgets in CI; phone budgets in the Pixel pass with `CB_PERF=1` logs)
Assert the §3.15 medians on the 60-bus sandbox case and the finale case. Also assert that the event window of the worst
level cascade stays < 100 ms desktop.

### 9.8 UI tests specific to GRID (Godot; `CB_SMOKE`, `CB_LEVEL`, `CB_SHOT`, `CB_AUDIT`)
1. Smoke: every screen and every drawer on every level opens and closes without script errors (headless), plus a
   `CB_AUTOPLAY=expert` day-run.
2. Layout audit: zero squeezed/overflowing controls at 1280×720, 1280×800, 1920×1080, 2560×1440, 3440×1440, 3840×2160 and
   phone 2424×1080 with insets. Text ≥ 13 px logical. Contrast ≥ 4.5:1 on every theme.
3. **Overlay truth:** the read-back value of every bus decal's shader parameter equals `overlay('V')` from the engine; every
   ribbon's pulse direction equals sign(P); speed and colour band match the loading.
4. **Phasor truth:** the drawn I-arrow angle relative to V (node transforms) equals the engine φ within 0.5°. Bench
   head-to-tail sums close (V_R + V_L + V_C = V).
5. **Dial truth:** the needle angle maps f exactly; in bullet time the needle replays the recorded trace sample by sample.
6. **Town lights truth:** the window emissive energy is monotonic in |V|; shed loads are dark; a test toggles a load shed and checks.
7. **Hum truth:** the audio bus `pitch_scale` = f/50 (±0.001) during a scripted 1 Hz dip (audio test, like GIGAWATT's).
8. **Replay determinism:** the replay twice gives the identical event list, and frame t = 3.20 s screenshots match (pixel hash at Potato tier).
9. **Share export:** the Blackout Card PNG exists at 1200×675 with the expected text fields (OCR-free: fields come from a query
   and are asserted on the scene tree). The desktop GIF is non-empty with the expected frame count.
10. **Input parity scripts:**
    - virtual pad (`CB_PAD=1`, pad.lock) completes L01 and L07 end to end;
    - keyboard only completes L01;
    - the phone touch script (`phone.lock`) completes L01 and strings a line by drag.
    - Every control type is pad-focusable (audit).
11. **Modal discipline:**
    - Space and Run are inert behind cards.
    - Esc and B close exactly one layer.
    - Android Back follows close modal → close drawer → pause, and never quits.
    - The title demo runs with autosave off (regression test from GIGAWATT B1).
12. **Coach device text:** with touch, no step mentions right-drag, wheel or hotkeys; with a pad, no step mentions the mouse.
13. **Numeric input:** predictions and sliders open a numeric keypad on phone, never QWERTY.

### 9.9 Playtest rounds and fun-test hypotheses
The testers are the GIGAWATT roster (`references/tester-prompts.md`) on `:200-:219`: novice (Learner, desktop),
form-factor and settings, phone, pad, monkey (Haiku), code reviewer, plus **fun critic (Opus)** and **educator (Opus)**.
Round 2 verifies the fixes. Write-up in `docs/CRITIQUE-0.1.md`.

| When | Hypothesis (what a tester should feel) | Measured by |
|---|---|---|
| Minute 1 | "The lights came on, and I did that." | Novice reaches first lit hamlet in ≤ 90 s; mentions it unprompted in the report |
| Minute 3 | "The hum changes when I change the speed." (L04) | Tester notices the hum pitch tracks rpm/frequency; asked directly if not mentioned |
| Minute 10 | "I broke it, I could see why, I fixed it." | After the first failure the tester can state the cause in their own words (report question); fixes in ≤ 2 retries |
| Minute 25 | "Oh, *that's* what power factor is." (L07 capacitor aha) | Tester explains reactive current in their own words; watches the phasor overlay |
| Minute 45 | "One more try for ★★★." | Tester voluntarily retries a passed level to beat the median; looks at the histogram |
| Minute 60 | "I want to show someone this blackout." | Tester exports a Blackout Card or describes wanting to; fun critic answers "would you play another hour, what's the hook" |
| Any | No dead air | No stretch > 20 s without a decision or spectacle (fun critic logs timestamps); day-run fast-forward is always available |
| Educator | "A JEE teacher would use L06/L09/L13" | Educator checks exam-bridge numbers against NCERT, the Codex wording against the syllabus, and flags any wrong physics |

---

## 10. Scope, cut lines, risks

### 10.1 v0.1 alpha (MVP): what ships
**Must-ship vs stretch (reviewer decision).** Must-ship is the v0.1 bar; stretch is built only after the M3 QA gate
passes on must-ship content (see BUILD-PLAN.md).

| Area | Must-ship | Stretch |
|---|---|---|
| Campaign | P0 + 22 levels: L01-L08, L10, L12, L14-L17, L19-L21, L23-L26, L28 | L09, L11, L13, L18, L22, L27 |
| Sandbox | "Lumen 2030", "Island" | "Blank state" editor |
| Modes | Learner, Engineer, Sandbox | — |
| Codex | 44 entries (text + worked example), 6 labs: phasor/power triangle, P-δ, P-V nose, frequency dial, time-current, harmonic/grid impedance sweep | 6 more labs: ABCD, GS vs NR, droop sharing, λ/merit stack, feeder phasor, DC-vs-AC flow |
| Honest notes / stories | S1-S37; 3 grid stories (NA 2003, SA 2016, India 2012) | Iberia 2025 (once the official report is opened) |
| Share | PNG Blackout Card, Result Card, design codes | desktop GIF/WebP |
| Leaderboard | client: submit, queue, histogram cache, nickname; `verify.mjs` + manifest | — |
| Audio | hum, full SFX list, 3 adaptive tracks | tracks 4-5 |
| Region packs | `global` (ship), `in` (draft, CI seam tests only) | — |

**Engine:**
- All of §3.
- About 100 catalogue rows, every one sourced or `game`-labelled.
- The Gym env with tensor encoding and the 7 personas.

**Test suite:** §9 in full (71 oracles, 25 properties, per-level solvability, lesson-gate and cheese tests, goldens, perf, UI,
region-pack seam, leaderboard verify, string lint, state size).

**Front-end:**
- Godot 3D diorama map, all overlays, bullet time, replay, Blackout Card (PNG everywhere; GIF desktop is stretch).
- Audio: hum, SFX, 3 adaptive tracks (5 is stretch).
- Full input parity: MK, pad, touch.

**Platforms and release:**
- Linux, Windows, macOS and Android (signed APK, Pixel pass).
- Site, README, CHANGELOG.

**Release bar:** PROGRAM.md quality bar items 1-10, plus the data release gate (§4, `global` pack), the bot-population
histograms (offline fallback + frozen targets) and `verify.mjs` contract tests green.

### 10.2 Later (v0.2+), deliberately not in v0.1
- **Career / tycoon mode**: multi-year state expansion with demand growth, tariffs, a regulator, financing, capacity planning.
  This is the open-ended "tycoon" the pitch implies; v0.1 is a puzzle campaign + sandbox. See the decision in §10.4.
- Level editor and sharing; Steam Workshop. (Online leaderboards moved INTO v0.1 by user decision #2, §12.)
- Black-start and restoration levels (great content: restoring a dark grid island by island).
- Distributed slack and AGC (secondary control); multi-machine transient stability; generator capability circles;
  phase-shifting transformers; HVDC; 765 kV.
- Unbalanced three-phase load flow on grids; dynamic line rating; LMP market with bidding.
- iOS; Hindi localisation first (v0.2, strings are already externalised); the `in` region pack finished and shipped.

### 10.3 Cut lines (if the schedule slips, cut in this order; never cut the protected list)
Stretch items (§10.1) are already outside the bar. If must-ship slips, cut in this order:
1. Weather visuals at Potato/Low tiers (keep weather in the data).
2. Codex labs down to 4 (keep phasor/power triangle, P-δ, frequency dial, time-current).
3. L26 Merit Order's congestion half (keep the λ dispatch; the corridor moves to v0.2).
4. L08 harmonics: replace the harmonic network solve by the closed-form h_r rule on the bench (keeps the lesson).
5. Engineer-mode N-1 study drawer (keep N-1 as a level test in L16/L28).

Floor after all cuts: 22 levels + prologue (no must-ship level is cut; only depth within levels).

**Protected (never cut):**
- Prologue P0 and levels L01, L05, L07, L14-L17, L19, L23, L24 and L28.
- Online leaderboard client + `verify` (user decision).
- Region-pack seam and string externalisation (user decisions).
- The oracle and property suites.
- Bullet time and replay.
- The hum.
- Town lights.
- Input parity.
- The data release gate.

**Must-do before tagging v0.1:**
- The educator pass attaches exact NCERT / standard-text example numbers to the oracle rows that match them.
- A data worker with working network access verifies the remaining `recall` rows of the **`global`** pack (see §4 and
  REVIEW.md: transformer %Z/losses, breaker ratings, LV cable ampacity, H constants, costs not in EIA). The `in` pack's
  rows (CERC/CEA heat rates, technical minimum) are verified only when that pack is promoted to `ship`.

### 10.4 Top risks and mitigations
| # | Risk | Likelihood / impact | Mitigation (owner) |
|---|---|---|---|
| 1 | **Too dry**: it feels like a homework simulator or a SaaS dashboard | High / fatal | Lights as the score; the hum; bullet-time blackouts; story cast with Nia's exam thread; every level ≤ 8 min; first failure within 58 s; world always visible, drawers over it. The fun critic gates each milestone with the §9.9 hypotheses. Kill or redesign any level the fun critic rates "chore" twice |
| 2 | **Accuracy vs fun**: simplifications teach wrong physics, or real physics makes levels unsolvable | Medium / high | 37 named simplifications in the Codex; 71 oracles; 25 property tests; lesson-gate tests prove each level fails without its lesson and passes with it; educator review; Engineer mode tightens tolerances instead of changing physics. Game values are labelled `game`, never presented as real |
| 3 | **Overlap with GIGAWATT** (sibling franchise) | Medium / medium | Different fantasy (the utility, not the customer); level-based optimisation puzzle vs open business tycoon; outdoor state map vs datacenter hall interior; physics teaching vs hardware literacy. Cross-promotion only: "Gigawatt Inc." appears as a 300 MW flat load in L28 and the sandbox. Shared tech via cobanana-core, not shared content |
| 4 | **Overlap with NODE** (analog circuits) on AC basics | Medium / medium | Resolved by the binding boundary in §2.8: GRID is system-scale (buses, lines, plants, MW/kV/pu, 50 Hz phasors + electromechanical seconds), NODE is component-scale (parts, waveforms, transients, Bode). The LCR bench level was removed from GRID; Codex entries 12-15 reframed at feeder scale; shared phasor-convention wording; distinct casts |
| 5 | **Solver robustness** on arbitrary player builds (divergence, islands, zero impedances) | Medium / high | Damped NR + flat-start retry + continuation turns divergence into collapse-as-an-event; bus-tie merging; conditioning check; 50k nightly fuzz; monkey persona 200k actions; finite-number guard on every query |
| 6 | **Phone performance** (nodejs-mobile is slower) | Medium / medium | Caps (30/60 buses), dense LU sized to fit, chunked N-1, budgets as tests and measured on the Pixel |
| 7 | **Cross-platform determinism** (V8 transcendental differences break design codes and goldens) | Medium / medium | Core `dmath` (fdlibm port) for all transcendentals; quantised golden hashes; a bridge-parity test |
| 8 | **Data provenance**: many catalogue values are still recall | High / medium | Every row carries `confidence`; the release gate fails on `recall`; a verification task in phase A; India-context costs labelled; EIA verified cross-references kept |
| 9 | **Scope** (28 levels + labs + 3D + 3 inputs) | High / high | Cut lines above; levels are data files with a shared runtime; the searcher bot and lesson gates make level authoring test-driven; GIGAWATT's harness and core reuse |
| 10 | **Oracle source labels are "-style"** (no exact example numbers yet) | Certain / low | Values are independently computed and cross-checked; the educator pass attaches citations; never copy a remembered answer |
| 11 | **Audience split**: JEE students vs EE undergrads vs Steam players | Medium / medium | Learner/Engineer modes; Ch 1-3 serve Class 12, Ch 5-7 serve EE; Sandbox and histograms serve sim players; exam bridges are optional ★ sources, never gates |
| 12 | **Leaderboard verify cost on serverless** | Medium / medium | `verify` CPU ≤ 300 ms per level (L28 ≤ 2 s) is far above Cloudflare Workers' free 10 ms; needs the paid plan, Docker, or async verification. User decides at deploy time (§12.3) |
| 13 | **Region seam rots** (a regional literal sneaks into physics or strings) | Medium / medium | Pack-switch, leak and physics-invariance tests in CI (§11.4); level files reference pack symbols only |
| 14 | **Unverified grid-code values** (EU network codes could not be opened here) | High / low | `recall` rows block the release gate; fallback is relabelling them `game` (honest: the province's grid code is fictional) |
| 15 | **Knife-edge level tunings** (the designer's L17 caps case was 1 MW from the trip load; L19 naive sat 5 mHz from 49.0 Hz) | Medium / high | Reviewer re-tuned both; the lesson-gate test asserts a margin (naive fails by ≥ 2% of the decisive quantity, lesson build passes by ≥ 2%) on every level |

### 10.5 Decisions taken in this document (so implementers don't have to ask)
| Decision | Rationale |
|---|---|
| Three clocks: 15-min operator blocks, a 10 ms RK4 frequency window, and 1 ms SMIB | Real time-scale separation; 15-min settlement periods (EU, India); phone budget |
| Exact equivalent π for every line | No model discontinuity |
| Dense NR (polar, analytic Jacobian, damped) | Network sizes stay small |
| Collapse-as-event via continuation | Divergence is a physical event, never a crash |
| One slack per island; grid-following-only islands go dark | Teaches what forms a grid |
| Constant-power loads | Textbook practice; honest voltage collapse |
| Positive-sequence grid, with 3-phase on the bench only | Keeps the grid solver standard |
| Tap convention: +n raises LV, τ = 1 − 0.0125n | One direction to learn |
| Level targets come from bot populations (median / 15th percentile) and are frozen | Not hand-guessed |
| Puzzle campaign + sandbox in v0.1; tycoon career in v0.2 | Scope |
| Fictional neutral province (`global` pack) by default; India setting kept as the draft `in` pack | User decision 2026-11-09 (#1, #5); no real-utility claims |
| Campaign capped at 400 kV | 765 kV conductor data unverified |
| US$ in the `global` pack; currency is pack data | User decision #1 |
| Diorama 3D map; schematics only inside drawers | Game, not dashboard |
| Region packs: physics region-independent; `global` ships, `in` is a CI-tested draft | User decision #5 |
| Solution code = replayable action log with ruleset id; pure `verify` export | User decision #2; determinism makes it anti-cheat |
| Star targets frozen from bot populations; online histograms are display only | Stars must not drift with the crowd |
| Must-ship 22 levels + prologue; 6 stretch | Quality over quantity |
| GRID/NODE boundary (§2.8): GRID system-scale, NODE component-scale | No duplicate content |
| First red alarm drops to 0.1× alarm speed; Learner also pauses | The overload timer is otherwise ≈ 2 s real at 1× |
| Governor deadband is an offset dead-zone; UFLS relays latch once picked up | Unambiguous, matches the tuned L19 |
| Engine strings returned as `{message, key, params}` | English now, any locale later |
| The hum at 2f as the frequency instrument | Hear the frequency |

---

## 11. Region packs (user decision #5, 2026-11-09)

### 11.1 The rule
**Physics is region-independent; everything regional is pack data.** The engine's `sim/` never branches on a region id.
It reads parameters (f₀, voltage levels, grid-code thresholds, catalogue rows, prices) from the active pack, which is
part of the level's input like the seed. Region ≠ language: a pack is chosen per save (default `global`), locale per
device (v0.1 English only).

### 11.2 What lives in a pack (`src/regions/<id>/`, schema validated by the core region-pack loader)
| Group | Fields (GRID) | `global` (v0.1 default) | `in` (draft, Appendix A) |
|---|---|---|---|
| Identity | `id`, `rulesetId` = `<id>@<8-hex hash of the pack's rule-relevant data>`, `status: 'ship'\|'draft'` | `global`, ship | `in`, draft |
| Money | currency code + symbol, number grouping, magnitude words | US$, 1,234,567, k/M | ₹, lakh grouping 12,34,567, lakh/crore |
| Frequency | `f0` | 50 Hz | 50 Hz |
| Voltages | LV phase/line V, MV/HV/EHV nominal set, highest equipment voltages, steady-state bands per level | 230/400 V; 11/33/66/132/220/400 kV (IEC 60038); bands §4.7 | 230/415 V; same kV; CEA bands |
| Grid code | standard frequency range, max steady-state and instantaneous deviation, FCR deadband + full-activation time, droop range, UFLS stages + quanta, gen U/F-O/F limits, OV/UV stages, settlement period | ENTSO-E SOGL / NC ER / NC RfG Continental-Europe style values (§4.7) | IEGC 2023 values |
| Catalogues | generator, conductor, cable, transformer, compensation, storage, protection SKUs with prices and `source`/`confidence` | §4 tables (US$, EIA/IEC) | original ₹ tables (CEA/CERC/IS) |
| Fuel & market | fuel prices, energy price for losses, VOLL | US$ (§4) | ₹ |
| Setting | region name, places, cast names + roles, licence titles, town names, flavour strings per locale | Lumen Province; Ada Moreno, Tobi Hart, Commissioner Vance, Nia | Prakash Pradesh; Meera Rao, Sharma-ji, Commissioner Iyer, Asha |
| Climate | latitude, temperature profile, monsoon/winter presets | 23° N, generic hot-summer presets | 23° N, monsoon presets |
| Exam bridges | per bridge level: the question set, sources and citation text | NCERT/standard-text numbers (allowed by decision #1) with neutral framing | the same numbers with JEE/NCERT framing and quotes |
| Real-world stories | Codex grid-story list | NA 2003, South Australia 2016, India 2012, Iberia 2025 | + the IEGC/POSOCO context pages |
| Godot side | `godot/regions/<id>/`: art/audio variants (v0.1: none; the diorama is neutral) | — | — |

**Level files reference pack symbols, never literals,** for anything regional: `pack.gridcode.ufls[0].hz`,
`pack.voltage.lvPhase`, `pack.catalogue('dt-250')`. A level may declare `requires: {f0: 50}` when its lesson depends on it
(L04: 12 poles × 500 rpm = 50 Hz; a 60 Hz pack ships its own L04 numbers via the pack's `levelOverrides`).
Levels whose pass thresholds come from the grid code (L15, L19, L20, L28) are tuned and lesson-gated **per shipping pack**.

### 11.3 Ruleset id and fairness
`rulesetId` hashes every pack field that can change a score (grid code, catalogues, prices, f₀, level overrides) but
not names or flavour text. It is stored in the save, carried in every solution code and leaderboard submission, and the
server compares scores only within the same `(levelId, levelHash, rulesetId)`. Changing a price is a new ruleset
(old codes still verify against the old ruleset if the engine keeps it; v0.1 keeps only the current one and the server
marks older-ruleset entries "legacy").

### 11.4 Tests (added to §9)
1. **Pack schema:** every pack validates (core loader); every catalogue row has `source` + `confidence`; the `ship` pack
   passes the data release gate (no `recall`), a `draft` pack may contain `recall` rows.
2. **Pack switch (seam test, user decision #5):** for each pack: load the whole campaign, start every level, run its
   reference solution (expert ★★★ in `global`; ≥ ★ in `draft` packs) and its naive build (fails) and the searcher (≥ ★,
   nightly). Switching pack mid-profile restarts the level cleanly and never mixes catalogues.
3. **Leak test (core helper):** with the `global` pack active, render every player-facing string (all level briefs, coach
   steps, why-card templates with sample numbers, Codex, catalogue display names, Blackout Card text) and assert none
   contains a token from the other packs' setting/currency dictionaries (`₹`, `lakh`, `crore`, `Prakash`, `Meera`,
   `Sharma`, `Iyer`, `Asha`, `IEGC`, `CEA`, `CERC`, `IS 398`, …) and that every currency rendering uses the active pack.
   The reverse runs for `in`.
4. **Physics invariance:** a fixed network solved under each pack gives identical V, θ, flows (only prices, limits and
   labels differ): proves no physics branches on region.

---

## 12. Online leaderboards (user decision #2)

### 12.1 What the player sees
- Result card: the histogram of verified solutions for this level and metric (tabs per metric: cost, losses, primary
  metric), the player's marker and percentile, the count ("1,284 verified solutions"), and a "Submit" toggle (on by
  default after the first opt-in prompt). Empty state (< 20 verified, or offline with no cache): the bot population,
  labelled "Bot population (offline estimate)".
- First submission asks once for an optional nickname (profanity-filtered on the server; default "Engineer-7F3A").
  Anonymous player id = random 128-bit id created on first run, stored in the profile. No friends lists, no accounts.
- Offline-first: the game is fully playable offline; submissions queue; histograms are cached per level with their
  fetch time ("updated 3 days ago").

### 12.2 Solution code (= the "design code" of §1.3)
A solution code is everything needed to replay a run exactly, and nothing else:
```
GRID1.<rulesetId>.<levelId>.<levelHash8>.<payload>.<crc8>
payload = base64url( varint-encoded action list )
action  = (tick delta, action-name index from a frozen table, args encoded by per-action schema: ids as varints,
           catalogue ids as table indices, numeric settings as integer UI steps, never floats)
crc8    = first 8 hex of CRC-32 over everything before it (typo detection, not security)
```
- Example size: L07 reference ≈ 12 actions → ≈ 40 characters of payload; L28 ≈ 200 actions → ≈ 1.2 kB.
- Mode (Learner/Engineer) is part of the code header (`levelId` suffix `:e` for Engineer); Learner-only aids (rewind,
  auto-dispatch) are actions, so they replay too. Hints used are recorded (★★★ rules).
- The action-name table and per-action schemas are frozen per code version (`GRID1`); adding an action appends to the
  table; a breaking change bumps to `GRID2` and the decoder keeps `GRID1`.
- `levelHash8` = hash of the level file + engine rules version; a code for a changed level is rejected with a teaching
  message ("This design was made for an older version of L07").
- The in-game "Copy design code" / "Paste design code" uses the same format; pasting replays the build and shows it
  before running.

### 12.3 The pure `verify` export (`src/leaderboard/verify.ts`)
```ts
export function verify(levelId: string, solutionCode: string):
  { ok: true; metrics: Record<string, number>; stars: 0|1|2|3; rulesetId: string; levelHash: string; ticks: number }
| { ok: false; error: 'malformed'|'crc'|'unknown-level'|'stale-level'|'ruleset-mismatch'|'illegal-action'|'did-not-finish'|'budget'; detail: string }
```
- Pure: newGame(seed = level seed, mode) → startLevel → apply each action at its tick through the normal engine (illegal
  ⇒ reject) → run to the level end → `levelResult`. No I/O, no globals, no Node APIs, no `Date`/`Math.random`; dmath
  everywhere, so the server (V8 in Workers or Node) reproduces the client bit-for-bit.
- Bundled as a separate entry (`dist/verify.mjs`, esbuild, ES2022, no Node built-ins) that the `cobanana-scores` server
  imports per game. Size budget ≤ 1.5 MB minified (engine + catalogues + levels; no Godot, no strings).
- CPU budget (desktop Node, median): ≤ 300 ms for any must-ship level except L28 (≤ 2 s, 3-day run with events).
  **Risk for the user's hosting choice:** Cloudflare Workers' free plan allows 10 ms CPU per request, so GRID needs the
  paid plan (CPU limit raised) or the Docker host, or a queue that verifies asynchronously. See BUILD-PLAN risks.
- Metrics reported: `cost`, `capex`, `opex`, `ensMWh`, `lossesPct`, the level's primary metric, `stars`.
- Tests: `verify` of every level's reference solution returns its expected metrics; a tampered payload/crc/level hash is
  rejected; a code made in-game on desktop verifies identically in the Node server build and in nodejs-mobile (bridge
  parity test); fuzzed garbage strings never throw (always `{ok:false}`).

### 12.4 Client (Godot + engine)
- Engine queries: `solutionCode` (from `actionLog`), `decodeSolution(code)`; action `loadDesignCode(code)`.
- Godot `leaderboard.gd` (game-side, on core's HTTP helper if provided): submit `{game:'grid', levelId, rulesetId,
  levelHash, code, playerId, nickname?, clientMetrics}`; the server's verified metrics are authoritative (client metrics
  only for a mismatch log). Queue in `user://scores_queue.json`; retry with backoff on launch, on result screen, every
  10 min while online; drop after the server says `stale-level`. Histogram cache `user://hist/<level>.<ruleset>.json`.
- Server URL is a setting with a compiled default; `CB_SCORES_URL` env hook for tests; `CB_SCORES=off` disables
  networking (tests, CI, testers by default).
- Privacy: no personal data; the player id can be reset in Settings; one line in the README/site.

### 12.5 What is not GRID's job
The server itself (Hono, Workers + D1 or Docker + SQLite, histograms, profanity filter, rate limits) is the separate
`cobanana-scores` repo shared by all five games. GRID provides `verify.mjs`, a `levels.json` manifest (ids, metric names
and units, better-is-lower flags, histogram bin hints) and contract tests.

### 12.6 Strings (user decision #3)
Every player-facing string (Godot UI, engine teaching messages, coach, why-card templates, Codex, level briefs,
catalogue display names) is a key in `strings/en/*.json` (engine) or `godot/locale/en.po`-style tables (Godot). Engine
actions return `{ok, message, key, params}`: `message` is the English rendering (tests, env, LLM agents), `key + params`
let Godot render any locale. Region names and cast come from the pack and are injected as params, so one English string
serves every pack. A lint test fails on any literal player-facing string in `godot/**/*.gd` or `src/**` outside the
string tables (allow-list for debug/log text).

---

## Appendix A. Draft region pack `in` (India) — preserved designer content, NOT shipped in v0.1

> **Status: draft.** This is the designer's original India setting, kept verbatim where it was regional, per user
> decision #5. The physics, levels and tests in §1-§12 are unchanged by it; only pack data differs. It need not ship in
> v0.1, but the pack-switch and leak tests (§11.4) run it in CI so the seam stays honest. `recall` rows are allowed in a
> draft pack; the data release gate applies only when its status becomes `ship`.

### A.1 Setting, cast and framing (pack `setting` + `strings/flavour.en.json`)
| Key | `in` value (designer original) | `global` value |
|---|---|---|
| region | **Prakash Pradesh**, a fictional Indian state ("prakash" = light) | Lumen Province |
| Ch 1 place | Sundar delta | Seaglass Delta |
| hydro valley | Kaveri Valley hydro | Kestrel Falls hydro |
| mentor / coach voice | Meera Rao, Chief Engineer (must be renamed even in `in`: NODE also uses "Meera"; suggestion: Meera → Kavya Rao) | Ada Moreno |
| night operator | Sharma-ji, State Load Despatch Centre night operator | Tobi Hart, control-centre dispatcher |
| regulator | Commissioner Iyer | Commissioner Vance |
| student | Asha, Class 12 student whose **board exams** are the emotional thread | Nia, final-year student, final exams |
| licence titles | Junior Engineer → Assistant → Executive → Superintending → Chief Engineer (real Indian utility titles) | Graduate → Engineer → Senior → Principal → Chief Engineer |
| fantasy line | "I am the engineer the whole state depends on on the night of the board exams." | see §1.2 |
| hook line | "IS 398 conductor names and CEA voltage limits" | BS 215 / IEC 60038 / ENTSO-E style |
| Blackout Card title | "Prakash Pradesh, 19:42, 1.8 million homes dark in 11 s" | "Lumen Province, …" |
| sandbox scenario | "Prakash Pradesh 2030" | "Lumen 2030" |
| L20 flavour | agri pumps shifted to noon (real Indian practice: solar agricultural feeders) | irrigation pumps |
| money | ₹ (lakh = 1e5, crore = 1e7); designer had a Settings toggle to US$ at a fixed ₹84/$ | US$ |
| L01/L02 budgets | ₹1.5 lakh / ₹3 lakh | §9.4 budget rule |
| LV | 415 V three-phase (433 V transformer secondary), band 230 V ±6% (Indian LV supply-code band, unverified) | 230/400 V, EN 50160 ±10% |
| EHV band (L15) | 380-420 kV (CEA Grid Standards 2010) | §4.7 |
| frequency band (L20, L28) | IEGC 49.90-50.05 Hz | ±50 mHz |
| UFLS (L19) | IEGC cl. 29.12: 49.4 / 49.2 / 49.0 / 48.8 Hz, 5/6/7/7%; designer's L19 table: naive nadir 49.40 Hz, stage 1 sheds 337 MW; one extra coal 49.55 Hz; + 200 MW FFR 49.63 Hz (6.7 GW island, ±0.03 Hz deadband). Note: the 49.40 nadir sits on the stage-1 knife edge; the `in` pack must re-tune L19 (as was done for `global`) before shipping | §3.6, L19 |
| governor deadband | ±0.03 Hz (IEGC 2023 FGMO), full response within 45 s, sustained 5 min | 10 mHz, 30 s |
| settlement block | IEGC/CERC DSM 15-min blocks | EU ISP 15 min |
| exam bridges | NCERT XII ch 6-7 / JEE framing and quotes (allowed) | same numbers, neutral framing |
| localisation | Hindi first (v0.2), then other Indian languages | — |
| VOLL / loss price | ₹50/kWh; ₹4.5/kWh (≈ 2025 IEX day-ahead average) | §4 |
| G-16 oracle | HR 10.3 MJ/kWh × ₹220/GJ = ₹2,266/MWh | US$ variant in §9.1 |

### A.2 Grid facts the `in` pack's Codex may quote (designer-sourced, `secondary`)
- All-India peak demand met: 250 GW on 30 May 2024 (PIB document https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/feb/doc2025221507201.pdf) and 256.1 GW on 25 Apr 2026 (https://www.downtoearth.org.in/energy/decoding-indias-record-256-gw-power-peak-demand-dispatch-and-dilemmas).
- AT&C losses 15.04% in FY2024-25 (Ministry of Power via https://www.tndindia.com/overall-atc-losses-of-distribution-utilities-improve-to-15-04-per-cent-in-fy25/).
- IEX day-ahead monthly averages in 2025 ≈ ₹4.4-5.2/kWh (powerline.net.in).

### A.3 Original data catalogue, verbatim (designer's §4, India context)
The block below is the designer's §4 exactly as written (₹ costs, CEA/CERC/IEGC/IS references, confidence tags). It is
the seed for `src/regions/in/catalogues/*.ts`. Physics-only rows (conductor geometry, line templates' R/X/B, governor
constants) are shared with `global` and live in `src/data/`.


Every catalogue row in `src/data/*.ts` carries `source` (URL or document + table/page) and a `confidence` tag:
- `datasheet`: a manufacturer table was opened.
- `standard`: a standard or an official grid-code text was opened.
- `report`: an authoritative report was opened (EIA, Agora, IEGC slides).
- `secondary`: a review paper or secondary copy was opened.
- `derived`: computed here from verified inputs with a stated formula.
- `recall`: model recall, not yet opened.
- `game`: a deliberate game value, flagged in the Codex.

**Release gate (test `data.test.ts` with `RELEASE=1`):** no row may ship as `recall`. Each must be verified or relabelled
`game` with an honest note. The verification workers could not open cercind.gov.in, cea.nic.in or posoco.in from this
environment (connections refused), so the implementation phase includes a data-verification task with a different network
path (§10.3).

Verified sources used below:
- **[APAR]** Apar ACSR datasheet (BS 215 Part 2 and IS 398 Part II tables), https://apar.com/wp-content/uploads/2021/02/1.-ACSR.pdf.
  Ratings are given at 75/85 °C conductor temperature, 45 °C ambient, 0.56 m/s wind and 1045 W/m² sun.
- **[SW]** Southwire spec 80100, https://cabletechsupport.southwire.com/tile/23/spec/80100/?country=US
- **[EIA23]** EIA AEO2023 Capital Cost and Performance Characteristics, Table 1 (2022 $), https://www.eia.gov/outlooks/aeo/assumptions/pdf/elec_cost_perf.pdf
- **[AGORA]** Agora Energiewende, *Flexibility in thermal power plants* (2017), Table 1, https://www.agora-energiewende.org/fileadmin/Projekte/2017/Flexibility_in_thermal_plants/115_flexibility-report-WEB.pdf
- **[IEGC]** CERC IEGC 2023 summary slides (IIT Kanpur CER), https://cer.iitk.ac.in/assets/downloads/CBP/presentation/Day2/IEGC_2023.pdf.
  Covers clauses 29.12 (AUFLS), 30 (frequency band, deadband) and 30.10(m) (primary response).
- **[PROT]** Protecta relay manual, Table 1-1 (IEC 60255-151 constants), https://www.protecta.hu/files/files/41666/toc51_v3.1.pdf
- **[H-REV]** inertia review tables citing Kundur: https://arxiv.org/pdf/2004.02951, https://arxiv.org/pdf/2210.03661
- **[IEC60228]** class-2 copper resistances via https://mycableengineering.com/conductor-resistance/ (secondary, checked against BS EN IEC 60228:2024 Tables 3-4 per that page)
- **[IEEE519]** IEEE 519-2014 Table 1 via the Mirus white paper (secondary)
- Grid facts: see §4.8.

#### A.3 · orig 4.1 Generators and sources (v0.1: 14 entries)
Game values: one number per field (the range in brackets is the literature spread). Heat rates are full-load; fuel prices are
game constants for 2026.

| id | Unit | P_min % | Heat rate | Fuel | Ramp %/min | Start hot / cold | H (s, own MVA) | Droop | Capex | CO₂ t/MWh | Confidence & source |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `diesel-1500` | 1.5 MW genset | 30 | 9.5 MJ/kWh (0.26 L/kWh) | diesel ₹2,500/GJ (₹90/L ÷ 36 MJ/L) | 20 | 10 s | 1.0 [0.5-1.5] | 5% | ₹0.5 cr/MW | 0.70 | recall (Cummins/Cat datasheets to verify) |
| `microhydro-250k` | 0.25 MW Francis, 500 rpm | 30 | water | 0 | 50 | 1 min | 2.0 | 5% | ₹10 cr/MW | 0 | recall |
| `smallhydro-10` | 10 MW | 30 | water | 0 | 50 | 3 min | 2.5 [1.5-3] | 5% | ₹9 cr/MW | 0 | recall (CERC RE tariff) |
| `coal-sub-500` | 500 MW subcritical | **55** (technical minimum) | **2,390 kcal/kWh = 10.0 MJ/kWh** | coal ₹220/GJ | **1.5** [1.5-4] | **2.5 h / 8 h** [2.5-3 / 5-10] | **3.5** [2.5-6] | 5% | ₹6.5 cr/MW | 0.95 | Heat rate: CERC existing norm (draft-stage docs, `secondary`). Ramp/start: [AGORA] common hard coal (`report`). H: [H-REV] (`secondary`). P_min, capex, fuel, CO₂: `recall` |
| `coal-sc-660` | 660 MW supercritical | 55 (40 after flexibilisation) | 2,250 kcal/kWh = 9.42 MJ/kWh | ₹220/GJ | **3** [3-6] | 1.5 h / 5 h | 4.0 [2.5-6] | 5% | ₹8.5 cr/MW | 0.86 | Ramp/start: [AGORA] state-of-the-art (`report`). Heat rate cross-check: EIA USC 8,638 Btu/kWh = 9.11 MJ/kWh HHV [EIA23]. Rest `recall` |
| `ccgt-418` | 418 MW single-shaft CCGT | 45 [40-50] | **6,431 Btu/kWh = 6.785 MJ/kWh** | LNG ₹800/GJ (≈$10/MMBtu) | **3** [2-4] | **75 min / 3.5 h** | 5.0 | 5% | **$1,330/kW** (₹11.2 cr/MW) | 0.37 | Heat rate, capex: [EIA23] (`report`). Ramp/start/min: [AGORA] (`report`). H, fuel: `recall` |
| `ocgt-105` | 105 MW aeroderivative | 45 [40-50] | **9,124 Btu/kWh = 9.626 MJ/kWh** | ₹800/GJ | **10** [8-12] | **8 min / 8 min** [5-11] | 3.0 | 4% | **$1,428/kW** | 0.54 | [EIA23], [AGORA] (`report`). H: `recall` |
| `hydro-250` | 250 MW unit, Francis | 30 | water (daily energy budget per level) | 0 | 50 | 3 min | **3.0** [2-4] | 4% | ₹12 cr/MW | 0 | H: [H-REV] (`secondary`). T_W = 1.5 s (Kundur typical, `recall`). Rest `recall` |
| `psp-250` | 250 MW pumped-storage unit | 40 (gen) | η_rt 0.75 | grid energy | 50 | 3 min (gen), 5 min (pump) | 3.0 | 4% | ₹6.5 cr/MW | 0 | `recall`. IEGC: PSP in pump mode trips before UFLS stage 1 ([IEGC], `standard`) |
| `phwr-700` | 700 MW PHWR (nuclear) | 80 (must-run, base) | 12 MJ/kWh | ₹0.3/kWh fuel | 0.5 | days | 4.0 | 5% (limited) | ₹15 cr/MW | 0 | `recall` (NPCIL). EIA LWR $7,406/kW is a US cross-reference |
| `pv-100` | 100 MW_ac utility PV, DC/AC 1.25, single-axis tracking | 0 (curtailable) | — | 0 | irradiance | — | 0 | — | **$1,448/kW** (EIA) / ₹4.0 cr/MW_ac (India) | 0 | [EIA23] (`report`). India cost `recall`. Model §3.10 |
| `wind-50` | 50 MW farm of 3 MW turbines (3/12/25 m/s) | 0 | — | 0 | wind | — | 0 (type 3/4) | — | **$2,098/kW** table ($1,566/kW regional footnote) / ₹6.5 cr/MW (India) | 0 | [EIA23] (`report`). India `recall`. Curve `game` (S35) |
| `biomass-10` | 10 MW Rankine | 60 | 4,200 kcal/kWh = 17.6 MJ/kWh | ₹1,300/GJ | 1 | 8 h | 2.5 | 5% | ₹6.5 cr/MW | ~0 net | `recall` (CERC RE norms) |
| `synccon-100` | 100 MVA synchronous condenser | — | aux losses 1.5% of rating | — | — | 15 min | 1.75 [1.5-2] | — | ₹4 cr/MVA | 0 | `recall` |

**Two capex columns:** India-context ₹ costs drive balance; EIA US costs are verified cross-references. The relative ordering
(PV < wind < coal < nuclear per MW, peakers cheap per MW but costly per MWh) is what matters for play.

**Governor data (S25/S26):**
- steam T_G 0.2 s, T_RH 7 s, F_HP 0.3; gas T_G 0.5 s; hydro T_G 0.5 s, T_W 1.5 s. All Kundur-typical `recall`.
- **Deadband ±0.03 Hz** on every governor in grid levels; primary response must be fully delivered by 45 s and sustained
  5 min ([IEGC] cl. 30, 30.10(m), `standard`). Oracle and exam cases use deadband 0.
- Droop default 5%, player range 3-6% (IEGC droop text `recall`; the verifier did not find it in an official source).

**Sub-transient/transient reactances** for faults and SMIB, on own MVA base: X''_d = 0.20 (steam), 0.25 (hydro), 0.15 (gas),
0.15 (diesel); X'_d = 0.30/0.35/0.25/0.25; X2 = X''_d; X0 = 0.08. Textbook-typical `recall`; oracles PS-17/18 use their own stated values.

#### A.3 · orig 4.2 Conductors and cables (v0.1: 9 ACSR + 8 copper + 1 HTLS)
**ACSR** ([APAR] BS 215 Part-2 table unless noted; R is DC at 20 °C; ampacity at 75 °C / 85 °C conductor, 45 °C ambient):

| id | Al/St × mm | Al / total mm² | Dia mm | R₂₀ Ω/km | A @75 / 85 °C | kg/km | Confidence |
|---|---|---|---|---|---|---|---|
| `acsr-weasel` | 6/2.59 + 1/2.59 | 30 / 36.88 | 7.77 | 0.9077 | 115 / 137 | 128 | datasheet |
| `acsr-rabbit` | 6/3.35 + 1/3.35 | 50 / 61.70 | 10.05 | 0.5426 | 156 / 188 | 214 | datasheet |
| `acsr-dog` | 6/4.72 + 7/1.57 | 100 / 118.5 | 14.15 | 0.2733 | 234 / 285 | 394 | datasheet (IS 398 Part II row: 0.2792 Ω/km, 231/282 A) |
| `acsr-wolf` | 30/2.59 + 7/2.59 | 150 / 194.9 | 18.13 | 0.1828 | 319 / 393 | 726 | datasheet |
| `acsr-panther` | 30/3.00 + 7/3.00 | 200 / 261.5 | 21.00 | 0.1363 | 377 / 470 | 974 | datasheet (IS 398 Part II row: 0.1390, 374/465 A) |
| `acsr-zebra` | 54/3.18 + 7/3.18 | 400 / 484.5 | 28.62 | 0.0674 | 551 / 700 | 1,621 | datasheet (IS 398 Part II row: 0.06868, 546/693 A) |
| `acsr-moose` | 54/3.53 + 7/3.53 | 520 / 597.0 | 31.77 | 0.05595 | 612 / 783 | 1,998 | datasheet row matched by stranding in IS 398 Part II ([APAR]); the code name is not printed → confirm |
| `acsr-drake` | 26/4.44 + 7/3.45 (795 kcmil) | 403 / 468 | 28.1 | **0.0702** | 907 (US rating basis, not comparable) | 1,628 | DC R: [SW] `datasheet`. Ampacity `secondary` (sandbox only) |
| `htls-casablanca` | ACCC "Panther-class" HTLS | ≈ Panther | ≈ 21 | 0.136 | 2 × Panther at 180 °C | lighter | `recall`. Reconductoring option (L16); cost 3× Panther |

Bersimis (765 kV quad) could not be verified ([SW] has no Bersimis row). **v0.1 caps the campaign at 400 kV.** 765 kV is v0.2.

**Copper cables for the DC island and LV** (2-core, PVC) [IEC60228] max R₂₀ (Ω/km): 2.5 → 7.41; 4 → 4.61; 6 → 3.08;
10 → 1.83; 16 → 1.15; 25 → 0.727; 35 → 0.524; 50 → 0.387 (`secondary`). Ampacity in air (`recall`, to verify against
IS 694 / manufacturer tables): 27, 36, 46, 63, 85, 112, 138, 168 A. Price per metre: `game` (₹ ∝ copper mass: ₹0.9/m per mm²
of conductor + ₹25/m sheath + ₹1,200 per pole every 40 m).

#### A.3 · orig 4.3 Line templates (per km, positive sequence; v0.1: 9 templates)
**Derived:**
- R = R₂₀ × 1.24 / n_bundle (S16).
- X and B from Glover ch. 4 formulas: L = 2·10⁻⁷ ln(D_m/D_s), C = 2πε₀/ln(D_m/r_eq), using datasheet diameters,
  GMR = 0.81·r, flat phase spacing D (GMD = D·∛2), and bundle spacing 0.45 m (`derived`).
- The spacings are typical tower geometries (`recall`, flagged).
- The derived values match the published typical figures cited by the first worker (400 kV twin Moose SIL ≈ 515 MW CEA).
- Thermal MVA = √3·V·I₇₅·n.

| id | kV | Conductor | D (m) | R Ω/km | X Ω/km | B µS/km | Z_c Ω | SIL MW | Thermal MVA |
|---|---|---|---|---|---|---|---|---|---|
| `l11-weasel` | 11 | Weasel | 1.0 | 1.1255 | 0.377 | 3.02 | 353 | 0.3 | 2.2 |
| `l11-rabbit` | 11 | Rabbit | 1.0 | 0.6728 | 0.360 | 3.16 | 337 | 0.4 | 3.0 |
| `l11-dog` | 11 | Dog | 1.0 | 0.3389 | 0.339 | 3.37 | 317 | 0.4 | 4.5 |
| `l33-dog` | 33 | Dog | 1.5 | 0.3389 | 0.364 | 3.13 | 341 | 3.2 | 13 |
| `l66-wolf` | 66 | Wolf | 3.0 | 0.2267 | 0.392 | 2.90 | 368 | 11.8 | 36 |
| `l132-panther` | 132 | Panther | 5.0 | 0.1690 | 0.415 | 2.73 | 390 | 44.7 | 86 |
| `l220-zebra` | 220 | Zebra | 7.0 | 0.0836 | 0.417 | 2.72 | 391 | 124 | 210 |
| `l400-twinmoose` | 400 | 2 × Moose | 11.0 | 0.0347 | 0.327 | 3.43 | 309 | 518 | 848 |
| `l400-quadmoose` | 400 | 4 × Moose | 11.0 | 0.0173 | 0.266 | 4.18 | 252 | 635 | 1,696 |
- Zero sequence: Z0 = 3·Z1 (S6).
- Line costs (₹ lakh/km per circuit, `recall` → verify against CEA/PGCIL cost data): 11 kV 6; 33 kV 12; 66 kV 25; 132 kV 60;
  220 kV 100; 400 kV twin 180; quad 250. Double-circuit towers cost 1.6× single.
- Checked against the game: L15 (350 km of `l400-twinmoose`) has |A| = 0.932 and a no-load receiving voltage of
  **429 kV > 420 kV**, so the Ferranti lesson fails as intended without a reactor. Total charging is 192 MVAr.

#### A.3 · orig 4.4 Transformers (v0.1: 10 SKUs)
| id | Rating | Voltage | %Z | X/R | OLTC | Losses (no-load / load) | Cost | Confidence |
|---|---|---|---|---|---|---|---|---|
| `dt-100/250/400/630` | 100/250/400/630 kVA | 11/0.433 kV Dyn11 | 4.5 | 3 | off-circuit ±5% (2.5% steps) | 0.2/1.8 kW (100 kVA), scaled ∝ S^0.75 | ₹3-12 lakh | recall (IS 1180) |
| `pt-33-11-10` | 10 MVA | 33/11 kV Dyn11 | 8.35 | 15 | ±10% / 1.25% (16 steps) | 10 / 55 kW | ₹1.3 cr | recall (CEA spec) |
| `pt-132-33-50` | 50 MVA | 132/33 kV YNyn0 (+Δ tertiary) | 12.5 | 30 | ±10% / 1.25% | 25 / 180 kW | ₹5 cr | recall |
| `ict-220-132-160` | 160 MVA | 220/132 kV YNa0 auto | 12.5 | 40 | ±10% / 1.25% | 50 / 350 kW | ₹10 cr | recall |
| `ict-400-220-315` | 315 MVA | 400/220 kV YNa0 auto | 12.5 | 50 | ±10% / 1.25% | 120 / 600 kW | ₹20 cr | 315 MVA is a CEA standard rating (confirmed). Rest recall |
| `gsu-500` | 500/600/800 MVA | 21/400 kV YNd1 | 15 | 60 | none (off-circuit ±5%) | 150 kW / 1.5 MW | ₹30 cr | recall |
| `conv-dcdc-48-380` | 10 kW | 48 V ↔ 380 V DC | — | — | — | η 97% | ₹0.6 lakh | game |

#### A.3 · orig 4.5 Reactive compensation (v0.1: 8 SKUs)
| id | Rating | Notes | Cost | Confidence |
|---|---|---|---|---|
| `cap-lv-*` | LV capacitor units 25/50/100 µF per phase at 415 V | L11 (Y or Δ) | ₹ per kVAr 400 | recall |
| `cap-11-300/600/900` | 300/600/900 kVAr at 11 kV | fixed or auto (auto ×1.6) | ₹1,500/kVAr | recall |
| `cap-detuned-7/14` | reactor-detuned bank, p = 7% / 14% | series resonance 3.78 h / 2.67 h | ×1.8 of bank | derived (G-04) / recall cost |
| `cap-33-5` / `cap-220-50` | 5 MVAr at 33 kV / 50 MVAr at 220 kV | switched steps | ₹7 lakh/MVAr | recall |
| `reactor-400-50/63/80/125` | 400 kV shunt reactors | line or bus, switchable (bus) | ₹18 lakh/MVAr | recall (CEA standard sizes) |
| `svc-100` | ±100 MVAr | susceptance-limited | $75/kVAr | recall |
| `statcom-100/200` | ±100/±200 MVAr | current-limited | $120/kVAr | recall |
| `series-cap-30/50` | 30%/50% of line X | 132-400 kV | ₹ per % per km (game) | game |
- Capacitor overcurrent limit 1.3 × rated rms and over-voltage 1.10 × (IEC 60871-1; the clause text was not openable, so `recall`).
  These drive the L08 fuse rule.
- Harmonic limits: THD_V 8% (≤ 1 kV), 5% (1-69 kV), 2.5% (69-161 kV), 1.5% (> 161 kV) [IEEE519] (`secondary`).

#### A.3 · orig 4.6 Storage (v0.1: 4 SKUs)
| id | Power / energy | η_rt | Response | SoC window | Cost | Confidence |
|---|---|---|---|---|---|---|
| `bess-2h-50` | 50 MW / 100 MWh | 0.86 | 200 ms (grid-following FFR) | 10-90% | $1,270/kW (EIA table; duration not stated) → game ₹9 cr/MW for 2 h | EIA `report` (cost); η `recall` (NREL ATB ≈ 85%) |
| `bess-4h-50` | 50 MW / 200 MWh | 0.86 | 200 ms | 10-90% | ₹14 cr/MW | recall |
| `bess-gfm-50` | 50 MW / 50 MWh grid-forming | 0.86 | 50 ms + H_v = 4 s on rating | 10-90% | ₹10 cr/MW | game (H_v), recall |
| `psp-250` | see 4.1 | 0.75 | minutes | reservoir | — | recall |

#### A.3 · orig 4.7 Protection and grid code (v0.1: 13 entries)
| Item | Value | Confidence |
|---|---|---|
| IEC 60255-151 curves: t = TMS·[k/((I/I_s)^α − 1) + c] | SI 0.14/0.02; VI 13.5/1; EI 80/2; LTI 120/1; c = 0 | **standard** ([PROT] Table 1-1) |
| IDMT setting ranges (game) | I_s 50-200% of CT rating in 5% steps; TMS 0.025-1.2 in 0.025; CTI 0.3 s | game (typical practice) |
| Breakers (IEC 62271-100 R10 series) | 25, 31.5, 40, 50, 63 kA; interrupting 2 / 3 / 5 cycles | recall (standard not openable) |
| Distance relay | Z1 80% inst (30 ms); Z2 120% 350 ms; Z3 1.0 s | recall (POWERGRID practice) |
| Fuse (11 kV spur) | K-link curves, game-simplified to EI with fixed TMS | game |
| **AUFLS stages** | **49.4 / 49.2 / 49.0 / 48.8 Hz**; PSP pumping and ESS charging disconnect before stage 1 | **standard** ([IEGC] cl. 29.12) |
| AUFLS quanta | 5 / 6 / 7 / 7% of demand (≈ 25% total) | secondary (news summary of IEGC 2023) |
| **Frequency band** | **49.90-50.05 Hz**, nominal 50 Hz | **standard** ([IEGC] cl. 30) |
| **Primary response** | deadband ≤ ±0.03 Hz; full response within 45 s; sustained 5 min (FGMO) | **standard** ([IEGC] cl. 30.10(m)) |
| Droop | 3-6%, 5% default | recall |
| **Voltage limits (CEA Grid Standards 2010), kV max/min** | 765: 800/728; 400: 420/380; 220: 245/198; 132: 145/122; 66: 72/60; 33: 36/30 | secondary (several copies agree; gazette not opened) |
| Distribution bands (game) | 11 kV and LV: ±6% (Learner), ±5% (Engineer) | game (Indian supply codes vary by state) |
| Generator U/F, O/F trips; OV stages; UV load trip; DER RoCoF | §3.6/3.8 values | game (S28, S29) |

#### A.3 · orig 4.8 Demand profiles, weather and grid facts
**Demand classes (96-block arrays generated from these hourly multipliers by linear interpolation; synthetic, S33, `game`;
shapes anchored to the facts below):**

| Class | 00 | 03 | 06 | 09 | 12 | 15 | 18 | 19 | 20 | 21 | 23 | pf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Residential | 0.62 | 0.47 | 0.58 | 0.56 | 0.58 | 0.62 | 0.85 | 0.97 | 1.00 | 0.97 | 0.75 | 0.95 |
| Commercial | 0.30 | 0.28 | 0.35 | 0.85 | 1.00 | 0.98 | 0.70 | 0.60 | 0.50 | 0.42 | 0.33 | 0.90 |
| Agricultural pumps | block schedule: 1.0 during supply blocks (default 00-04 and 10-13), 0.05 otherwise; shiftable to solar hours (L20) | | | | | | | | | | | 0.80 |
| Industrial (3-shift) | 0.85 | 0.85 | 0.92 | 1.00 | 0.95 | 1.00 | 0.95 | 0.92 | 0.90 | 0.88 | 0.86 | 0.85 |
| City mixed | 0.45·res + 0.30·com + 0.25·ind | | | | | | | | | | | 0.92 |
| Datacenter ("Gigawatt Inc.") | 0.95 flat | | | | | | | | | | | 0.98 |

Full residential row, hours 00-23: 0.62 0.55 0.50 0.47 0.46 0.50 0.58 0.62 0.60 0.56 0.55 0.56 0.58 0.60 0.62 0.62 0.63 0.70 0.85 0.97 1.00 0.97 0.88 0.75. Other classes interpolate linearly between the listed hours. Then 96 blocks interpolate linearly between hours.

**Weather presets (6):** clear summer, heatwave (+6 °C, residential +9%), monsoon (cloud cover 70%, wind ×1.6),
winter (low solar, morning peak shift), storm (scripted trips + lightning SLG faults), holiday (demand −15%). Seeded cloud fields.

**Verified facts used in story text and the Codex:**
- All-India peak demand met: **250 GW on 30 May 2024** (news + PIB document,
  https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/feb/doc2025221507201.pdf) and **256.1 GW on
  25 Apr 2026** (https://www.downtoearth.org.in/energy/decoding-indias-record-256-gw-power-peak-demand-dispatch-and-dilemmas).
  `secondary`
- AT&C losses **15.04% in FY2024-25** (Ministry of Power statement via https://www.tndindia.com/overall-atc-losses-of-distribution-utilities-improve-to-15-04-per-cent-in-fy25/). `secondary`
- IEX day-ahead monthly averages in 2025 of about ₹4.4-5.2/kWh (powerline.net.in trading data). This is the basis of the
  ₹4.5/kWh loss price. `secondary`
- **30-31 July 2012 Indian blackouts:** roughly 620 million people affected on 31 July, the largest blackout recorded. The
  enquiry committee report of 16 Aug 2012 found a combination of causes, including over-drawal beyond schedule and weak
  inter-regional transmission. `secondary`; the Codex story must cite the report itself once it is opened.
- **2016 South Australia black system:** tornado-damaged lines caused repeated faults, and wind-farm ride-through settings
  tripped 9 of 13 farms (AEMO final report, March 2017). This inspired L21. `secondary`
- **2003 North America:** US-Canada Task Force final report: a combination of institutional, human and computer failures
  (alarm system failure, tree contact, inadequate situational awareness). `secondary`
- Installed capacity and hourly all-India curves were *not* verified. The game does not quote them. The finale's state grid is
  fictional and scaled.

#### A.3 · orig 4.9 Entry counts for v0.1
| Catalogue | Entries |
|---|---|
| Generators and sources | 14 |
| Conductors and cables | 18 |
| Line templates | 9 |
| Transformers and converters | 10 |
| Compensation | 8 families (≈ 20 SKUs) |
| Storage | 4 |
| Protection and grid code | 13 |
| Demand classes | 6 |
| Weather presets | 6 |
| **Total** | **≈ 100 rows** |

Each row is unit-tested for plausibility per type (no negative R; X/R in range; H in [0.5, 10]; heat rate in [6, 18] MJ/kWh;
ampacity monotonic in area within a family; and so on), for duplicate ids and for `source`/`confidence` presence (GIGAWATT data-test pattern).
