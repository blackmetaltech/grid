# GRID 1.1 "Employable": design

Opus iterator, 2026-11-20. This document drives the 1.1 wave from [CRITIQUE-1.0.md](CRITIQUE-1.0.md). In that review, depth to "employable" scored 4 and long-term play scored 3. This file amends DESIGN.md and design/DEPTH.md. Where they disagree, this file wins for 1.1.

The goals are three. First, close the 1.0 findings. Second, add a chapter that teaches the half of the job a junior engineer actually does first: distribution feeders, reliability, protection on a radial feeder and substation firm capacity. Third, add a long-term **Career** mode: run a utility district for ten years. Targets for CRITIQUE-1.1 are depth 6.5 or more and long-term play 6 or more, with no other criterion below its 1.0 score.

Every rule still lives in the engine. Every new formula gets an oracle in `tools/oracles/` (Python, independent of the TypeScript) before a level uses it. Every level has a naive build that must fail and a reference build that must pass.

---

## Part A: the 1.0 findings

| # | Finding (CRITIQUE-1.0) | 1.1 status / plan |
|---|---|---|
| 1 | Clicking a bus's name does not pick it | **Done** 82cc5cf: the column from the peg to the name picks the bus. |
| 2 | A second click on a tray cell cancels silently | **Done** 82cc5cf: the part stays in hand; the chip says "Esc or right-click puts it down". |
| 3 | L09 series capacitor needs the spot under the line | **Done** 82cc5cf: a line picks anywhere along its wires. |
| 4 | L15 never says to switch the bank | **Done** 82cc5cf: coach and try text name Automatic on the bank's tag. |
| 5 | Retry after an incident is confusing | **Done** 82cc5cf: locked tools say how to Retry once the job is over; Retry never replays the docket. Still to do: the coach step counter restarts at step 1 after Retry (it re-derives from the action log). Plan: Retry carries the coach index forward. |
| 6 | One-click wins (L12), third lamps that ask nothing new | **Plan A1, A2 below.** |
| 7 | L16 report and card disagree (73 % vs 64 %) | Plan: the card labels its number "now"; the report says "worst moment of the day, at hh:mm". |
| 8 | Speed dial wraps | **Done** 82cc5cf: the notches pick directly. |
| 9 | L20 step counter jumps; Size reads 20 MW before arming | Plan: the knob cell shows "rating" until a unit is armed; the step jump follows from #5. |
| 10 | L11 cans step by 5; right-click for 1 is not shown | Plan: the caption reads "± 5 · right-click ± 1". |
| 11 | No phone, pad, Windows or macOS pass | Out of the code's reach in an unattended wave; stays a known gap unless a device is attached. |

### A1. L12 "Over the Hill" must not be a one-click win
In 1.0, setting the AVR to 1.05 pu passes for $0 and earns two lamps (pass, and spend ≤ budget A, because $0 ≤ A). The fix is a rule for the whole campaign rather than a patch to L12.

**Lamp rule (all levels, 1.1).** The second lamp is never awarded to the cheapest single action that passes. On a level with a spend lamp, a design that spends $0 earns the spend lamp only if the pass itself required a change of the system (not only a set-point). In L12 this splits the lamps as follows:
- **Pass** (no pole slip) still needs only the AVR. That is the lesson: E' sets P_max.
- **Lamp 2** becomes "first swing ≤ 80°". The AVR alone gives a first swing between 80° and 90°. The oracle must confirm the exact figure before tuning (tools/oracles/ch4_oracles.py, `l12_peak(v, series, third, red)`). If the figure falls outside that range, tune the night transfer, not the threshold.
- **Lamp 3**: "first swing ≤ 70° and spend ≤ B" (unchanged threshold, new combination).

The bot population is regenerated and the frozen targets re-pinned (`level.test.ts` checks drift).

### A2. Third lamps that ask for something new
| Level | 1.0 third lamp | 1.1 third lamp |
|---|---|---|
| L06, L13, L18, L22 (exam bridges) | identical to lamp 2 when nothing is bought | Lamp 2: all predictions within 5 %. Lamp 3: within 1 % **and** the "why" card answered (a one-of-three choice of the governing equation). |
| L23 | prediction condition invisible | The work order lists "predict the fault level within 10 %" as the lamp-3 line, and the report shows predicted vs actual. |
| L27 | same | Same treatment. |
| L02, L05, L12, L16 | no pointer after a pass | The shift report's "what to try" line names the lamp-3 lever ("losses: a fatter trunk", "N-1: a second path", …) from a per-level `star3HintKey`. |

---

## Part B: Chapter 8 "The Feeder" (distribution)

Placement: after chapter 7 and before the finale. Chapter number 8; the finale moves to chapter 9 (data only; the finale card keeps its own panel). The setting is **Brightwater**, the mainland market town from chapter 2, ten years on. It now has a 33/11 kV primary substation and five 11 kV feeders.

The engineer's question changes from "will it run tonight?" to "how often, how long, and at what cost will customers lose supply over a year?".

### B1. Levels
| Id | Title | The idea | Player decisions | Pass / lamps |
|---|---|---|---|---|
| L31 | **The Long Feeder** | Voltage drop along a radial feeder: ΔV ≈ (R·P + X·Q)/V per section, cumulative; off-load distribution-transformer taps (±2.5 %, ±5 %); conductor upgrade vs a mid-feeder voltage regulator. | Conductor per section (Weasel/Rabbit/Dog/Hyena), tap per distribution transformer, optional voltage regulator. | Every customer within +10/−6 % of 230 V at peak and at minimum load (EN 50160 style band, global pack); lamp 2 spend; lamp 3 losses ≤ 4 %. |
| L32 | **Count the Outages** | Reliability indices (IEEE 1366): SAIFI = Σ customers interrupted / customers served; SAIDI = Σ customer-minutes / customers; CAIDI = SAIDI/SAIFI. Expected annual values from failure rate × length and repair or switching time. | Place up to N sectionalisers (manual or remote), a normally-open tie to the next feeder, fuse every spur. | SAIDI ≤ target and SAIFI ≤ target within budget; lamp 3 ENS (energy not supplied) ≤ X. |
| L33 | **Fuse Saving** | Fuse-recloser coordination on a radial feeder: a recloser's fast curve clears temporary faults (about 80 % of overhead faults) before the spur fuse melts; its slow curve lets the fuse clear a permanent fault. Coordination range where fast < fuse minimum-melt and slow > fuse total-clearing. | Recloser fast and slow curves (time dial), fuse link size per spur, number of fast shots. | No customer outside the faulted spur loses supply for a permanent spur fault; temporary faults cleared without blowing a fuse; lamp 3 margin ≥ 0.2 s everywhere. |
| L34 | **Firm Capacity** | Substation N-1: firm capacity = total capacity minus the largest transformer; cyclic and emergency ratings from IEC 60076-7 hot-spot ageing (relative ageing rate doubles per +6 K above 98 °C); load transfer through feeder ties after a transformer trip. | Third transformer vs a bigger pair vs ties and remote switching vs demand response; bus-section breaker. | After the worst transformer outage at peak, all load restored within 3 h with no transformer hotter than its emergency limit; lamp 3 loss of life ≤ 1 day. |
| L35 | **Sun on the Roofs** | Reverse power flow and voltage rise on an LV/11 kV feeder with rooftop PV; hosting capacity; OLTC with line-drop compensation; PV inverter volt-var. | PV connection limit per feeder, OLTC set point, volt-var curve on/off, an extra cable. | No customer above +10 % at noon, none below −6 % at the evening peak; lamp 3 hosting ≥ X MW. |
| L36 | **Exam Bridge: Feeder Numbers** | Givens on screen; predict the far-end voltage drop, SAIFI and SAIDI of a small feeder before the run. | Three predictions and a "why" choice. | All within 5 % (lamp 2), within 1 % and the why (lamp 3). |

### B2. Engine (`src/sim/distrib/`, lane E1)
- `radial.ts`: a backward-forward sweep load flow for radial feeders (complex, per phase, per section). It is cross-checked against the existing Newton-Raphson on meshed-free cases. Oracle: ΔV per section and losses on a 5-section feeder (hand formula and a Python sweep).
- `reliability.ts`: analytical reliability (failure-mode effect analysis). Each section has λ (faults/km/yr) and r (repair h). Each switch has a switching time. The output is SAIFI, SAIDI, CAIDI, ENS and customer-minutes per section. Oracle: a 3-section feeder from the textbook method (Billinton and Allan style), computed in Python independently.
- `tcc.ts`: time-current curves. Recloser fast and slow use the IEEE C37.112 inverse forms. Fuse minimum-melt and total-clearing curves are piecewise log-log curves from a catalogue table with source tags; values not checked against a datasheet are flagged `recall`. Coordination margin queries.
- `thermal-tx.ts`: IEC 60076-7 top-oil and hot-spot (exponential equations, ONAN defaults) and the relative ageing rate V = 2^((θh − 98)/6). Oracle: the standard's worked example where available, else an independent Python integration.
- `hosting.ts`: voltage rise with PV injection, volt-var (Q(V) piecewise), OLTC with line-drop compensation.
- Catalogue rows (`src/regions/{global,in}/catalogues/dist*.ts`): reclosers, fuse links, sectionalisers, regulators, distribution transformers 100-1000 kVA, primary transformers 10-40 MVA, typical failure rates (overhead 11 kV about 0.1-0.2 faults/km/yr, underground about 0.03-0.07; repair 3-8 h; manual switching about 1 h, remote a few minutes), all source-tagged.

### B3. UI (`godot/ui/ch8/`, lane U1)
A feeder diagram panel (single-line, sections as a tree with customers per node) beside the world view of Brightwater. Clickable sections take conductor and switch choices; spurs take fuse links. A **year bar** shows the expected annual outages per section as a heat strip, and the SAIDI/SAIFI gauges sit in the card. L33 gets a TCC chart (log-log, reusing the chapter 7 chart code). L34 gets a transformer thermometer (top-oil and hot-spot through the outage day). The phone layout follows the chapter 4 and 7 scaled-panel pattern.

---

## Part C: Career "The Utility" (long-term play)

Unlocked after chapter 8 (or from the title screen in Engineer mode).

**The fantasy.** You are the new district engineer at Lumen Distribution, responsible for Brightwater and two neighbouring towns: about 40,000 customers, 2 primary substations and 9 feeders. You have ten years. The regulator sets your allowed revenue and rewards or fines reliability. The council wants new connections (a hospital, an industrial park, rooftop solar, EV chargers). The assets are old.

### C1. The loop (one turn = one quarter, 40 turns)
1. **Plan.** Choose projects from a board. Each project has a capital cost, a lead time in quarters, a crew requirement and an effect: reconductor, new feeder, new primary transformer, tie and remote switch, recloser, vegetation clearing, inspection and replacement of the worst-health assets, voltage regulator, battery, a demand-response contract. Projects are the chapter 8 decisions at district scale.
2. **Run the quarter.** The engine runs the expected-value model (B2) and then a seeded set of events: storms with a fault count drawn from the quarter's weather, transformer failures drawn from asset health, heatwave peaks, and new connection requests with deadlines. The player gets an incident card for each major event and may act during it: switch ties, dispatch a crew, shed load.
3. **Quarter report.** SAIDI and SAIFI to date against the regulator's targets, losses, spend against allowed revenue, connections delivered, and asset health.
4. **Annual review** (every 4th turn). The regulator (Ms Okafor), the finance director (Vance, from the campaign) and the crew chief (Tobi) each judge one axis. The incentive scheme pays or fines on SAIDI/SAIFI relative to target, RIIO-style (performance-based regulation, simplified and labelled as such).

### C2. Models (engine lane E2, `src/career/`)
- **Load growth** per feeder: a base rate of 1-3 %/yr, plus step loads from connections, rooftop PV and EVs with a time-of-day shape.
- **Asset ageing:** each asset has an age and a health index from 1 to 10. The failure rate follows Weibull λ(t) = (β/η)(t/η)^(β−1), with β about 2-4 and η about 40-50 years (source-tagged as typical). Inspection reveals true health; replacement resets it.
- **Reliability:** the expected value comes from B2. Realised outages are a seeded Poisson draw per section and quarter, so luck matters but the expected value is shown beside it.
- **Money:** allowed revenue per year (a regulated asset base × WACC + depreciation + opex allowance, simplified), capex and opex spend, the incentive pay or fine, and a cash balance. Bankruptcy and licence revocation (three years of fines over a cap) are endings.
- **Endings:** Chief Engineer (targets met in ≥ 8 of 10 years and the network healthier than at the start), Steady, Bailed out, Licence revoked.
- **Determinism:** a career is a seed plus an action list. A career code reproduces it, and the leaderboard verifies it like a level.
- **Personas for tests:** idle, firefighter (only reacts), gold-plater (builds everything), planner (reference). The test expects planner > firefighter > idle on the 10-year score and gold-plater bankrupt or fined. A 50-seed sweep confirms the ordering holds on at least 90 % of seeds.

### C3. UI (lane U2, `godot/ui/career/`)
A district map using the world view with feeders as coloured lines (health, loading). A project board drawer (cards with cost, lead time and effect, and a "why this helps" line from the engine). A quarter report sheet and an annual review sheet in the paper style of the shift report. Incident cards. A 10-year timeline strip at the top (quarters as pips, review years marked).

---

## Part D: lanes, files and order

Machine rules: at most 2 subagents at once, one desk tester, vitest `--maxWorkers=4 --minWorkers=1`, Godot one run at a time. Lanes run on disjoint files. Each builder commits through a private `GIT_INDEX_FILE` on top of HEAD (as in 1.0-rc). Opus integrates and verifies.

| Lane | Owner | Files | Depends on |
|---|---|---|---|
| A (findings A1, A2, #5, #7, #9, #10) | Opus | src/level/levels/l12.ts, ch4 oracles, shift_report.gd, work_order.gd, the exam-bridge level specs | — |
| E1 dist engine + oracles | Sonnet builder | src/sim/distrib/**, tools/oracles/ch8_oracles.py, src/regions/*/catalogues/dist*.ts | — |
| L8 chapter 8 level specs + locales | Sonnet builder | src/level/levels/l31-l36.ts, src/level/chapters/ch8.ts, src/locales/ch8.en.ts, ch8 tests | E1 |
| U1 chapter 8 UI | Sonnet builder | godot/ui/ch8/**, godot/tests/ch8_flow.gd | L8 |
| E2 career engine | Sonnet builder | src/career/**, career tests and personas | E1 |
| U2 career UI | Sonnet builder | godot/ui/career/**, godot/tests/career_flow.gd | E2 |
| Docs | Opus | README.md, CHANGELOG.md, docs/CRITIQUE-1.1.md | all |

**Tags.**
- v1.1.0-rc.1: Part A done.
- rc.2: E1 engine with oracles green.
- rc.3: chapter 8 playable to a win on desk.
- rc.4: Career engine with personas.
- rc.5: Career UI playable for ten years on desk.
- v1.1.0: after a campaign + career smoke by a fresh tester and CRITIQUE-1.1.

## Honest simplifications (to carry into the Codex)
- Reliability uses expected values from failure rates and repair times. Real utilities add protection mis-operation, common-mode failures and storm correlation; the Career's seeded storms are a coarse stand-in.
- Fuse curves are catalogue-like piecewise curves, not a particular manufacturer's published TCC unless tagged.
- The regulator's scheme is a simplified performance-based regulation: no rate case, no inflation indexing, one incentive rate.
- Load growth and ageing parameters are typical values, source-tagged; they are not a particular utility's data.
