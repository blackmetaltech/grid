# GRID: depth (v1, Opus, 2026-11-10). From Class 9 to junior power-systems engineer.

Binding amendment to DESIGN.md (user direction 2026-11-10): *"add game complexity and components … difficult terrain that
requires special equipment … technical detail on cables, supports and other infrastructure … construct transmission centres
… don't make the game only about connecting two places … start at std 9 and reach an employable knowledge state."*
Where this file and DESIGN.md disagree, this file wins. UI.md still governs the look.

## 0. The problem with v0.1 as built
Chapter 1 is "pick a peg, pick a reel, pull the breaker": one decision with a closed-form answer, solved in two tries and then
over. A real line is the opposite: hundreds of coupled small decisions (route, supports, spans, conductor, insulation, earthing,
protection, substations), each governed by a rule a junior engineer must know, and the network then **lives**: demand grows,
storms and salt and trees attack it, parts age, budgets bind. Depth = more *kinds* of decision that interact, each one real.
Not more of the same slider.

## 1. Design principles for depth
1. **Every new part exists because the terrain or the physics demands it.** No catalogue bloat: a pile foundation appears the
   first time a line must cross a swamp, an anti-fog insulator the first time salt fog trips a line.
2. **Fail first, in the world, with the real mechanism.** A span that sags too low flashes over to a mango tree at 19:40 when
   the evening load heats the conductor; the incident report shows the sag equation with the player's numbers.
3. **The network persists within a chapter** (district play). Jobs 2-4 of a chapter are built on the map you left: your old
   line is still there, carrying more load each year. Bad early choices come back. This is where replay and long-term play live.
4. **Two currencies of quality**: capital cost (US$) and *service* (unserved energy, SAIDI/SAIFI per IEEE 1366, losses).
   Stars and leaderboards use both, so "cheapest that passes" is never the whole story.
5. **The engine owns every rule** (sag, clearance, creepage, ampacity, angle classes, protection timing). GDScript only draws.
   Every rule has an oracle test (textbook or independent script) before it reaches a level.
6. **Honest simplification.** Each simplification is a Codex "honest note" (DESIGN §3.13 S-numbers continue at S38+).

## 2. Learning-outcome ladder
| Rung | Audience equivalent | Player can… (assessed in-game by) | Chapters |
|---|---|---|---|
| R1 | Class 9-10 (NCERT IX-X Electricity) | use V = IR, P = VI, series/parallel, heating I²R; size copper for a voltage limit (L01-L03 pass + incident explanations) | 1 |
| R2 | Class 11-12 (NCERT XII ch 6-7) | explain EMI, rms vs peak, f = pN/120, turns ratio, why HV transmission (L04-L06 predictions, exam bridge) | 2 |
| R3 | Diploma / ITI lineman, 1st-yr B.Tech | read a single-line diagram; pick conductor (ACSR family) by ampacity, loss and mechanics; compute **sag and ground clearance**; choose support types by span and **line angle**; size **insulators by creepage** for pollution; earth a line and place a shield wire; know when to go underground/submarine and what cable **charging current** costs | 2-3 |
| R4 | B.Tech EE 2nd-3rd yr | power factor and compensation, per-unit, transformer taps/OLTC, three-phase, load flow, voltage control, fuse/recloser/IDMT **coordination**, fault levels, **substation bus schemes** | 3-5, 7 |
| R5 | B.Tech final yr / GATE | frequency control, inertia, droop, UFLS, stability (equal area), economic dispatch, N-1 security | 6-7, F |
| R6 | Junior planning/operations engineer | run a **district for years**: demand forecast, reinforcement plan under budget and tariff, N-1, maintenance outages, reliability indices, standards compliance report | Career (v0.2), chapter district jobs from Ch 2 |

The Codex grows a **"Field manual"** section (R3+) written like a utility construction standard: tables the player has
actually used (span limits, angle classes, creepage classes, clearances), each row with its source and confidence tag.

## 3. Terrain that needs special equipment (engine: `src/sim/route/terrain.ts`)
Maps for Ch 2+ are tile maps (25 m tiles for distribution, 100-250 m for transmission) whose tiles carry *properties*, not
just looks. Each property maps to a rule and an equipment answer:

| Terrain | Property in the engine | What goes wrong without the right kit | Equipment answer (cost driver) | Source / confidence |
|---|---|---|---|---|
| Farmland, scrub | normal soil, ROW cheap | — | standard pole/tower, pad/chimney foundation | baseline |
| Mangrove / swamp | soil class *soft*; no access for cranes | a standard foundation **settles and the support leans** (fails inspection, refused at build) | **pile foundation** (×2.5 foundation cost, ×1.6 build time) or route around (longer = more R) | practice: utility manuals use pile/well foundations in marshy soil (`recall`) |
| River | width w (m), high-water level, navigable flag | a span cannot exceed the support family's max span; a navigable river needs extra clearance over high water | **river-crossing towers** (tall lattice, dead-end both banks, long-span); or a **submarine/under-river cable** | clearance over navigable water: `game` value 20 m above HWL (to be checked against EN 50341 / CEA reg. 58) |
| Hill / ridge, rock | elevation per tile; rock flag | sag clearance changes with ground profile (a span over a dip has more room, a span over a crest less); rock defeats normal foundations | **rock-anchor foundations**; towers on crests; **tension/angle towers** where the route bends | profile clearance is real practice (`standard` method); costs `game` |
| Coast (≤ 2 tiles from sea), estuary | pollution class II-IV (IEC 60815) | **salt fog flashover** on insulators with too little creepage during fog nights → line trips | **longer insulator strings / anti-fog discs / polymer** sized by specific creepage distance (mm/kV) | IEC 60815 (1986) classes I-IV = 16 / 20 / 25 / 31 mm/kV of Um (phase-phase) (`standard`, widely reproduced); IEC TS 60815-1:2008 USCD 22 / 27.8 / 34.7 / 43.3 / 53.7 mm/kV (`standard`) |
| Cyclone belt | basic wind speed zone (m/s) | towers/poles of a lower wind class **fold in a storm** (scripted cyclone nights) | **wind-load class** of the support (cost ∝ class); shorter spans (wind load ∝ span × diameter) | wind load on conductor F = q·C·d·L with q = ½ρV² (IEC 60826 method; zone speeds `game` per region pack) |
| Forest | tree height | **vegetation faults**: trees grow into an uncleared right of way; persistent maps grow trees each year | **ROW clearing** (cost per tile, recurring trimming budget) or **covered conductor/ABC** | ROW widths in region pack (`recall`) |
| Lightning-prone plateau | ground flash density Ng (/km²/yr) | lightning back-flashover / shielding failure trips lines | **shield (earth) wire** + **tower footing earthing** (footing resistance ≤ 10 Ω target) and surge arresters | IEEE 1243 / IEC 60071 concepts; Ng per pack (`recall`) |
| Town / protected area | overhead forbidden or very costly | — | **underground XLPE cable** (×5-10 cost of overhead; capacitance ~0.2-0.5 µF/km → charging current) | cable C typical 11 kV XLPE (`recall`; to be verified on a datasheet) |
| Sea strait | depth, length | only cable can cross | **submarine cable**; AC charging current limits length (I_c = V·ωC per km) | real constraint (`standard` physics); costs `game` |

## 4. Conductors and lines: the technical layer (engine: `src/sim/route/`, data in region packs + `src/data/conductors.ts`)
### 4.1 Conductor data (adds mechanical columns to DESIGN §4.2)
| id | stranding | UTS kN | E GPa | α ×10⁻⁶/°C | kg/km | Source |
|---|---|---|---|---|---|---|
| acsr-weasel | 6/1 | 11.5 | 79 | 19.1 | 128 | BS 215-2 table (manufacturer reprint, Lumino) UTS + mass `datasheet`; E/α by stranding WBSEDCL ACSR spec §6 `datasheet` |
| acsr-rabbit | 6/1 | 18.4 | 79 | 19.1 | 214 | same |
| acsr-dog | 6/7 | 32.7 | 75 | 19.8 | 394 | same |
| acsr-wolf | 30/7 | 69.2 | 80 | 17.8 | 726 | same |
| acsr-panther | 30/7 | 92.3 | 80 | 17.8 | 974 | same |
| acsr-zebra | 54/7 | 131.9 | 69 | 19.3 | 1,621 | UTS/mass `datasheet`; E/α for 54/7 `recall` |
AAAC (all-aluminium alloy) rows for coastal corrosion (no steel core) come in M-depth-2 (`recall` until a datasheet is opened).

### 4.2 Sag, tension, clearance (the R3 core; oracles S-01..S-08 below)
- Span L (m), conductor weight per metre w = m·g (N/m), horizontal tension H (N). Parabolic sag **D = w·L²/(8H)**
  (catenary D = (H/w)(cosh(wL/2H) − 1) is the oracle check; parabola within 0.5 % for D/L < 5 %).
- **Everyday tension** stringing rule: H₁ ≤ 20 % of UTS at the everyday temperature (15 °C still air) (`recall`: common
  practice/EDS limit, CIGRÉ; the region pack holds the value).
- **State-change equation** (parabolic) to the hot case t₂:  H₂²·[H₂ − H₁ + (w₁²L²EA)/(24H₁²) + α(t₂−t₁)EA] = w₂²L²EA/24.
  Solved with core numerics (Newton, bracketed); unique positive root.
- **Conductor temperature from current** (S38 honest note, simplified IEEE 738 balance): T_c = T_amb + (T_max − T_amb)·(I/I_rated)²,
  with I_rated the catalogue ampacity at T_max = 75 °C and T_amb = 45 °C basis. So *the evening peak literally makes the line sag*.
- **Clearance**: support attachment height h (m) minus insulator string drop minus sag (at the point of the span, parabolic
  profile y(x) = 4D·x(L−x)/L², plus the ground profile under the span) must be ≥ the clearance for the voltage class:
  `global` pack (Lumen code, `game` modelled on EN 50341): ≤ 1 kV 5.5 m; 11 kV 6.0 m; 33 kV 6.5 m; 66 kV 7.0 m; 132 kV 7.5 m;
  over roads +1 m; over navigable water 20 m above HWL. `in` draft pack: CEA (Measures relating to Safety and Electric Supply)
  Regulations 2010 reg. 58 / old IE Rule 77: LV/11 kV across street 5.8 m, along street 5.5 m, elsewhere 4.6 m; 33 kV 5.2 m;
  above 33 kV 5.2 m + 0.3 m per 33 kV (`recall`, verify against the gazette before `in` ships).
- **v0.3 decision (honest note S38):** L05 checks clearance at the *design* temperature (75 °C) at the evening peak, for every line,
  whatever its current: real practice designs for the worst night, and the game makes the evening peak that night. The current-driven
  conductor temperature (`conductorTempC`) arrives with dynamic line rating in a later chapter.
- A span that violates clearance at the **actual** conductor temperature during the run **flashes over**: the line trips
  (protection clears it), the incident shows the span, its sag and the equation.

### 4.3 Supports (engine: `supports.ts`, data per pack)
| family | voltage | attach h (m) | design span (m) | max span (m) | foundations | cost (`game`) |
|---|---|---|---|---|---|---|
| wood pole 9 m | LV, 11 kV | 7.5 | 50 | 70 | earth | $600 |
| concrete (PCC) pole 11 m | 11, 33 kV | 9.0 | 70 | 100 | earth / pile | $1,100 |
| steel tubular pole 13 m | 11, 33 kV | 11.0 | 90 | 130 | earth / pile / rock | $3,500 |
| lattice tower 33-66 kV | 33, 66 kV | 15 | 200 | 300 | pad / pile / rock | $18,000 |
| lattice tower 132 kV | 132 kV | 21 | 300 | 400 | pad / pile / rock | $45,000 |
| river-crossing tower | any | 45 | 600 | 900 | pile / pad, always dead-end | $260,000 |
Heights/spans are typical distribution and transmission practice (`recall`); costs are `game` and sit in the region pack.
**Line-angle classes** (deviation at the support): suspension 0-2°, small-angle 2-15°, medium-angle 15-30°, large-angle/
dead-end 30-60° (+ terminal). Heavier class costs ×1.0 / ×1.4 / ×1.8 / ×2.4 (`game`); classes follow the common A/B/C/D
tower-type practice (`recall`, IS 802-based utility specs). The engine assigns the class from the route geometry; the player
sees it on the support's tag and pays for every bend.
Foundations: earth ×1.0, pile ×2.5, rock-anchor ×1.8 of the support's foundation share (40 % of support cost) (`game`).

### 4.4 Insulation and earthing (engine: `insulation.ts`)
- Required creepage = specific creepage (mm/kV, from the tile's pollution class) × Um (highest system voltage: 12 kV for
  11 kV, 36 for 33, 72.5 for 66, 145 for 132; IEC 60038 `standard`).
- Strings: standard disc 255×146 mm, creepage 295 mm; anti-fog disc 255×146, creepage 430 mm; 11 kV pin insulator 320 mm;
  polymer long-rod sized to need (`recall`, catalogue values to verify). Discs n = ⌈required / per-disc⌉.
- Fog/salt nights (scripted in levels, seeded in career): a string below its class's creepage **flashes over** with
  probability 1 at fog severity ≥ its class (deterministic in campaign; probabilistic only in career with seeded RNG).
- Earthing: tower footing resistance from soil resistivity ρ (Ω·m, tile property) and electrode choice (rod / counterpoise);
  shield wire on/off. Lightning nights: trip if no shield wire, or back-flashover if footing R > limit (S39 honest note: a
  threshold model, not EMTP).

### 4.5 Underground and submarine cable
XLPE cable: R, X, **C (µF/km)**, ampacity, cost per km per pack. Charging current I_c = V_ph·ω·C·ℓ is shown on the tag; long
AC cable needs a **shunt reactor** (Ch 5 link) and HVDC is a v0.2 teaser. Ch 2's finale is the submarine cable to the island.

## 5. Buildable infrastructure (unlock order)
| Asset | What the player decides | Physics/practice it teaches | Unlock |
|---|---|---|---|
| Distribution transformer (pole-mounted / plinth) | kVA rating, location, off-circuit tap | turns ratio, kVA, loading, no-load + load losses | Ch 2 |
| **Substation** (placeable building on a flat site) | voltage levels, **bus scheme** (single bus → sectionalised → double bus → breaker-and-a-half), number of **bays** (each line/transformer needs one), transformer(s), earthing grid | single-line diagrams; why bus schemes matter for maintenance and N-1; bays cost money | Ch 3 (first), Ch 5 (schemes) |
| **Switching station** | where lines meet without transformation | sectionalising, N-1 rerouting | Ch 5 |
| Transformer with OLTC | taps, AVR set-point, dead band | voltage control | Ch 5 (DESIGN L16) |
| Capacitor banks / reactors | size, fixed/auto | reactive power, Ferranti | Ch 3 / Ch 5 |
| **Protection**: fuses, recloser, sectionaliser, IDMT relays, breakers | ratings, curves, TMS, coordination margins | coordination; transient vs permanent faults (≈ 80 % of overhead faults are transient, `recall`) | Ch 3 (fuse/recloser), Ch 7 (relays) |
| **Control centre** + SCADA RTUs | which substations are telemetered | without telemetry an outage is found from customer calls (+45 min restoration in the model, `game`); with it the breaker is seen at once → SAIDI | Ch 6 |
| Dispatch desk | unit commitment, merit order | economic dispatch (DESIGN §3.11) | Ch 7 |

## 6. Long-term play
### 6.1 District jobs (from Ch 2): the network persists
A chapter's 3-5 jobs share one map. Each job is "next year": demand grows (region pack growth rate, e.g. 6 %/yr), a new
customer appears (mill, school, cold store, the island), an event class is introduced (fog, storm, trees, lightning). What you
built stays (and is re-checked against the new year's load, which is where undersized early choices bite). Star targets are
per job; a **district score** sums cost + service over the chapter and is the chapter's leaderboard. Replaying job 1 with a
better plan improves every later job: real planning.
### 6.2 Service quality as score
Unserved energy (MWh) and IEEE 1366 indices: SAIFI = Σ customers interrupted / customers served; SAIDI = Σ customer-minutes
interrupted / customers served. Interruptions come from events the network failed to withstand. Restoration time = detection
(SCADA or not) + travel (distance from the depot over terrain) + repair (part type).
### 6.3 Maintenance and ageing (career, and Ch 5+ district jobs)
Parts have condition; trees grow into uncleared ROW; insulators pollute between washes. A maintenance budget and planned
outages (N-1 lets you take a line out without dropping customers) are the operations half of the job.
### 6.4 Career / sandbox (v0.2, designed now so the systems fit)
A seeded province, 10-20 in-game years, tariff income per MWh served, regulator penalties per SAIDI minute, a capital plan
each year, storms and growth. The end-of-year report is a real utility annual report (losses %, SAIDI, SAIFI, capex, N-1
violations). This is the "employable" layer: it is exactly a junior planning engineer's annual cycle.

## 7. Chapter map after the amendment
| Ch | Region | Jobs (ids kept; new ids continue at L29) | New depth |
|---|---|---|---|
| 1 | The Island (DC) | L01, L02, L03 | ladder R1; unchanged (polish only) |
| 2 | **The Mainland Line** (district map: waterfall, river, mangrove, ridge, coast, market town) | L04 Spin the Alternator; **L05 The River Line** (first route: supports, spans, sag/clearance, swamp piles, river crossing, step-up/step-down); L06 Exam bridge (Town Line); **L29 Salt Wind** (coastal extension: creepage, fog night, earthing); *As built (v0.4, 2026-11-10):*
- The run is 18:00 → 07:00 so the fog falls before 80 % of the night.
- The L05 transformers are dt-400, because the harbour adds load.
- Insulator prices are pin $25, disc2 $70 and fog1 $95 per phase per support. disc2 is the cheaper strong option but hangs 0.30 m lower; fog1 drops 0.15 m.
- A coast insulator applies on class ≥ III tiles.
- Pollution classes by distance to the sea: ≤1 tile IV, ≤2 III, ≤6 II.
- New rule `darkLoadsLose` on fog jobs: an unserved harbour cannot win.
- Bots exclude wood-9, because its clearance verdict differs by pack.
- The reference design is Weasel on pcc-11, 90 m spans, disc2 throughout.
- Frozen global targets: budget $55k, A $49.6k, B $46.4k.
- UI: salt whitening by class, fog banks from 02:00 to 05:00, and violet corona on salt-short insulators as the fog thickens.

**L30 Bring the Island Home** (submarine cable to Saltmarsh: cable charging current, the island joins the grid; chapter finale) | R2 + R3 core |
| 3 | Mill Town (district) | L07 Lagging Mill, L08, L09; **L31 The First Substation** (bays, single bus, transformer, fuse/recloser on the feeder, trees on the ROW) | R3-R4 |
| 4 | Industrial belt + hydro valley | L10-L13 | R4 |
| 5 | State ring | L14-L18; **L32 Ring the Substations** (bus schemes, switching station, N-1 maintenance outage) | R4-R5 |
| 6 | Solar desert | L19-L22; **L33 Eyes on the Grid** (control centre, SCADA, SAIDI) | R5 |
| 7 | Interconnect | L23-L27 | R5 |
| F | Whole state | L28 | all |
| Career | seeded province | v0.2 | R6 |

## 8. First slice (build order, v0.3.0 "The Mainland Line")
1. **Engine, TDD** `src/sim/route/`: terrain tiles + properties; support catalogue; sag/state-change; clearance with ground
   profile; angle classes; insulation creepage; route → supports, spans, BOM cost, line length → network branch parameters.
   Oracles S-01..S-08 (below) in `tools/oracles/route_oracles.py` (independent catenary + cubic) → `expected.json`.
2. **L05 The River Line** on the Ch 2 district map: hydro bus (from L04) → market village 6-8 km away across the river,
   a mangrove strip and a low ridge. Player places waypoints (route), picks support family per section (or auto), conductor,
   voltage (400 V vs 11 kV) and transformer sizes. Run: the evening peak heats the conductor; under-clearance spans flash over;
   the LV option collapses (≈ 321 A, DESIGN L05). Lesson-gate test: naive (400 V, wood poles straight across) fails; lesson
   (11 kV, concrete poles, pile foundations in the swamp, river-crossing pair) passes; reference earns 3 stars.
3. **UI**: route tool (click waypoints, engine `routePreview` query draws supports coloured by class, spans coloured by
   clearance margin), span tag with D = wL²/8H and the player's numbers, support tag (class, foundation, cost), the meter of
   Ch 2 = **clearance gauge** for the worst span + village voltmeter. Cute layer: linemen climbing the poles you place, a
   crocodile sulking in the mangrove until you choose piles, the conductor visibly sags lower as the hamlet's bulbs turn on.
4. L29, L30, L04, L06 follow in that order.

## 8b. Chapter 2 jobs after L05 (design, Opus)
**District persistence.** Each later Ch 2 job starts from the player's own verified solution code of the previous job (profile save;
the level's reference build when there is none). The engine replays that code in `place()`, so the old line stands, now in "year 2".

**L29 Salt Wind** (year 2). The harbour (fish market + ice plant, 150 kW at pf 0.85, all night) sits on the south coast. Extend 11 kV
from Brightwater's yard down to it. Tiles ≤ 1 from the sea are pollution class IV (31 mm/kV), ≤ 2 class III, ≤ 6 class II.
- New choice per line: insulators — pin (320 mm, $25), 2-disc string (590 mm, $70, drops the conductor 0.30 m), 1 anti-fog disc
  (430 mm, $55, drop 0.15 m). Um = 12 kV: class III needs 300 mm (pin passes), class IV 372 mm (pin fails; disc string or fog disc).
- Event: sea fog 02:00-05:00 (severity rises to IV at 04:00). A support whose creepage < its tile's need flashes over → line trips →
  the ice plant warms (Cute: the fish look worried, then sad). Incident: "Pole 12 stands 40 m from the surf (class IV: 31 mm/kV × 12 kV =
  372 mm). Its pin insulator offers 320 mm."
- The drop of a disc string eats clearance (§4.2), so the long spans the player liked in L05 may now fail clearance: the two rules meet.
- Naive: pin insulators all the way along the beach → flashover at 04:00. Lesson: fog discs on the coastal stretch (or route inland,
  longer). ★★★: cost ≤ B and every coastal support at class IV.

**L30 Bring the Island Home** (chapter finale, year 3). Saltmarsh Island, 4 km offshore, joins the mainland: a submarine 11 kV XLPE cable
from the harbour (only cable can cross the sea; no supports), an 11/0.42 kV transformer and an inverter at the island's battery hut.
- Teaches cable vs overhead (cost ×6-10, capacitance: the cable makes Q = V²ωCℓ ≈ 46 kvar at 4 km, shown on its tag as the Ch 3 teaser),
  energy vs power, and **N-1 at Class-12 level**: at 21:00 a trawler's anchor cuts the cable (scripted). The island must ride through
  until 23:00 on its own battery: kWh ≥ load × hours. The player sizes the island battery (kWh) and the inverter (kW).
- Naive: cable only (cheapest) → island dark at 21:00. Lesson: battery ≥ 2 h × island evening load + inverter ≥ peak kW.
- Story payoff: Nia's exam results arrive on the island's first mainland-powered night; Ada retires; Tobi: "Island's on the grid. Mind
  the anchor."

## 8c. Next layers after chapter 2 (design, Opus, 2026-11-10 night)
**District persistence, done properly (v0.6).** Today L29 and L30 start from the *reference* builds of the earlier jobs.

Engine:
- `reset({ inherit: { L05: actions[], L29: actions[] } })` replays the player's own verified actions in `place()` instead of the reference, falling back to the reference when the inherited plan does not pass the earlier job's checks.
- The run's verdict uses the inherited network, so an undersized L05 transformer (dt-250) shows up in L29 as an overload the player must fix, by paying to swap it.

UI:
- The profile save keeps each job's last *passing* design (the actions that `_grid_design` already rebuilds) and passes them on job start.
- The work order shows "Your River Line (year 1) still stands: 4.0 km, concrete, 11 kV".

Leaderboard: a **district score** (sum of the chapter's spend plus unserved energy at a $/kWh penalty) on the chapter card.

**L31 The First Substation (Ch 3, Mill Town district; v0.7).**

Map and setting:
- A new 100×44 district map: a river valley mill town fed at 33 kV from the north.
- The player places a 33/11 kV substation on a flat site and picks its **bays**: one per incoming line, transformer and outgoing feeder, each bay a priced item.
- The player picks the transformer MVA and builds two 11 kV feeders: the mill and the town.

The night's events:
- Storms bring transient faults. A branch on the line clears by itself, as about 80 % of overhead faults do (`recall`).
- A **fuse** blows and stays dark until a crew drives out: 45 min plus the travel distance, at `game` speeds.
- A **recloser** opens and recloses in 2 s, and stays open only on a permanent fault.

Learning: the player discovers the recloser is worth its price on the long rural feeder but not on a short town cable. Trees growing into an uncleared right of way turn transient faults into permanent ones, which links back to the forest clearing cost in L05.

Scoring, oracles and teaching:
- Score: SAIDI and SAIFI (IEEE 1366) for the night plus cost; ★★★ needs SAIDI ≤ X minutes.
- Oracles: SAIDI and SAIFI by hand for a scripted fault list; fuse I²t versus the recloser fast curve is a v0.8 teaser, not modelled.
- Teaches: single-line diagrams, bays, transient vs permanent faults, reliability indices (Diploma/B.Tech, R4).

**L32 Ring the Substations (Ch 5)** and **L33 Eyes on the Grid (Ch 6)** keep §7's plan: bus schemes and N-1 maintenance outages, then SCADA detection time versus customer calls, measured in SAIDI.

## 9. Oracles for the route module (added to DESIGN §9.1; computed by an independent script, never by the engine)
| id | problem | expected (tolerance) |
|---|---|---|
| S-01 | Dog, span 100 m, H = 20 % UTS (6.54 kN), w = 0.394·9.80665 N/m: parabolic sag | D = 0.7385 m (1e-3) |
| S-02 | same span, catenary sag vs parabola | diff < 0.1 % |
| S-03 | Dog, 100 m, 15 °C → 75 °C state change (E 75 GPa, A 118.5 mm², α 19.8e-6, no wind) | H₂, D₂ from the cubic (script) |
| S-04 | clearance: 11 kV PCC pole (9.0 m attach, 0.3 m pin drop), Rabbit 70 m span hot sag vs 6.0 m | margin from S-03-style solve |
| S-05 | creepage: 11 kV (Um 12 kV) class III 25 mm/kV → 300 mm → one 320 mm pin insulator passes; class IV 31 → 372 mm → needs 2 discs (295 mm) | counts |
| S-06 | angle class of a 25° bend → medium (15-30°) | class |
| S-07 | route over 3 swamp tiles + river 180 m with concrete poles → refused (span > 100 m) | refusal key |
| S-08 | conductor temperature at I = 0.8·I_rated, T_amb 45 °C → 45 + 30·0.64 = 64.2 °C | 1e-9 |
Numbers in S-01 are computed here only as a smoke value; the script output in `expected.json` is authoritative.

## 10. Sources (opened 2026-11-10 unless marked)
- BS 215-2 ACSR table as reprinted by Lumino Industries (luminoindustries.com, "BS-215-1970.pdf"): stranding, areas, diameters,
  mass, breaking load, R₂₀, ampacities. Opened.
- WBSEDCL technical specification for ACSR conductor §6: final modulus and expansion by stranding (6/1, 6/7, 30/7). Opened.
- IEC 60815 (1986) and IEC TS 60815-1:2008 creepage classes; IEC 60038 Um; IEC 60826 wind loading method; IEEE 1366 reliability
  indices; IEEE 738 conductor thermal balance; EN 50341-1 clearance method; CEA Safety Regulations 2010 reg. 58 / IE Rules 77.
  Not opened in this session → values marked `standard` (widely reproduced) or `recall`; a data task verifies them before ship.
