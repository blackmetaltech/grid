# Changelog

All notable changes to GRID. The release workflow publishes the section whose heading contains `[x.y.z]`.

## [1.8.0] - "Pad and progress" (tag v1.8.0; driven by docs/CRITIQUE-1.7.md; review in docs/CRITIQUE-1.8.md)
### Fixed
- **The finale's frame rate.** On the software-GL QA desk the finale ran at 3-8 fps in 1.7. Four causes, four fixes:
  - **Draw calls.** The static and homes layers now gather their polygons, lines, circles and rects into one vertex-coloured mesh per run. L28 went from 22,398 to 2,111 draw calls a frame; the paused frame went from 156 to 56 ms (7 to 21 fps, load 19).
  - **The tick blocked a frame.** The tick and mission-claim requests now run on a worker thread (`ui/grid_ticker.gd`; core 54ef457 adds a mutex to the bridge). The main thread applies one snapshot and one refresh per tick, where 1.7 did two. `tests/ticker_flow.gd` counts main-thread tick requests (none) and frames drawn while a tick is in flight, so it does not depend on wall-clock speed.
  - **A rebuild on every tick.** A town's house count followed live demand once demand passed its peak, so the heatwave changed it on every tick, and every change rebuilt the whole map. It now follows the stable peak.
  - **Repaints for light and loading.** The wires have their own layer, so a line's loading band repaints only the wires. A change of light tints the cached island, which repaints only after the night has moved 0.15. Span bands repaint at most once a second instead of rebuilding.
- **L20 Sun Goes Down.**
  - The brief is 45 words and gives the order: build before 14:00, then run.
  - The coach starts with the build. A tester followed the old "press Run and watch" step, got an hour of flat night at 50 Hz and never built.
  - The control-room card no longer says "tap it, press Start".

### Added
- **A full gamepad pass at 1280x800.** Every screen was reached with the pad alone; shots are in the CRITIQUE.
  - **A number pad.** A on a focused number box opens an on-screen pad with digits, point, minus, delete and OK. The D-pad wraps inside it and B cancels. Before this, the chapter 2, 4, 5, 6 and 7 exam predictions could not be answered with a pad.
  - **GRID's own button strip.** In a level it reads A select, B back, X run/pause, Y next tag, LB/RB parts, D-pad move, Start menu. Over menus it shows only D-pad, A and B. The shell's "LB/RB drawers" pointed at drawers GRID does not have.
  - Tray tips say "D-pad and A" in pad mode, not "Click", and B puts a part down.
  - Paper buttons (jobs, work order, reports) focus with an amber ring; the old ink ring was lost against a row's border.
  - The Career map is walked with LB/RB (the primaries, then every feeder section), and focus stays on the same control after an action.
- **A guided first year in the Career.**
  - Quarter 1 shows one job: your weakest asset, already picked on the map, its Start row, then End quarter.
  - The storm-readiness card opens in quarter 2, tree cutting in quarter 3 and every project in quarter 4.
  - "Show every tool now" ends the guide.
- **QA.**
  - `CB_PADSEQ` scripts a pad tour inside one game window (debug builds only, no machine-wide virtual pad).
  - `CB_FPS` logs the ticker state.

### Changed
- `scripts/release-local.sh` uploads to the public repo; the upload still happens only after the headless smoke run.
- The release workflow publishes nothing when the tag already has a (locally smoke-tested) release.

### Known gaps
- Fps under load. At 4× the desk shows 6-9 fps at load 31-39 (another session's jobs) and 13-20 fps at load 17-22. Each 5 s still holds 0.3-0.7 s of UI refresh after ticks. An idle-machine number is still owed.
- No human has played with a physical pad: the pass used scripted pad events in the game window.
- The Career guide names the weakest feeder section, but the worst-assets card lists substation plant first, so its row is third.
- A human listening pass on the music is still owed.

## [1.7.0] - "Sound and speed" (tag v1.7.0; driven by docs/CRITIQUE-1.6.md; review in docs/CRITIQUE-1.7.md)
### Added
- **A music catalogue.** Four synthesised night-shift tracks, 156-195 s each, play in turn. 1.6 looped one 8-bar phrase of 27 s.
  - "Night Shift": D dorian, 70 BPM, warm pad, music box.
  - "Load Follow": F lydian, 84 BPM, glass pad, eighth-note bass, plucks.
  - "Low Frequency": A aeolian, 58 BPM, drone, ostinato bass, flute.
  - "Morning Ramp": G mixolydian, 100 BPM, reed pad, walking bass, bells.
  - Each has its own form. A section heard again is varied, with a re-seeded motif, a different answer in its last bar and an opened voicing.
  - The next track renders on a worker thread while the current one plays.
- **Six new sound cues:**
  - a detent click on the speed keys;
  - a protection trip (relay chatter, the breaker's open, a falling whine);
  - a blackout spin-down;
  - coins when the regulator pays;
  - a register when a project starts;
  - the ledger closing at the end of a quarter.

  Trips and blackouts were silent before.
- **The audio is measured, not just claimed.** `godot/audio/render_samples.gd` renders every cue and track, and `tools/audio/analyse_audio.py` measures them. Results are in `docs/audio/ANALYSIS.md`, with spectrograms in `docs/audio/spec/` and compressed copies in `docs/audio/ogg/`:
  - loudness (EBU R128), true peak and clipping;
  - each track's section map from bar-by-bar chroma;
  - a cross-track structure and harmony check;
  - a one-shot similarity check.

  **A human listening pass is still owed.**
- **A strike alarm on the Career HUD.** When the year, projected and averaged the way the regulator will average it, ends over the SAIDI target, the top strip says so. It also says whether that would be a licence strike (with the count) or only a fine.
- **Local private releases.** `scripts/release-local.sh` exports Linux and Windows, bundles the Node runtime and the engine sidecar, smoke-runs the Linux build headless, writes SHA256SUMS and creates a private GitHub release. v1.6.0 and v1.7.0 were released this way.
### Changed
- L13: the − / + buttons step the excitation by 0.01 pu (right-click or Shift: 0.001). The arrow keys step it while the pointer is over the slider. The status line no longer overlaps itself.
- Exams with nothing to build (L13) drop the cost line, the loss line and the build-cost histogram from the result card.
- L27's dispatch sum updates as you type.
- The event log names the elements it lost ("T27, the Capital 400 / Capital 220 transformer") rather than bare ids. The 10-bus trip-day golden was regenerated for this log text only, in its own commit.
- Storm readiness: the stand-down offer says that "settled" means storms are unlikely, not impossible, and its button goes once used.
- Incident cards: a feeder with no tie gets a note instead of a dead button, and "exceptional" is explained.
### Known gaps
- No human has listened to the new music or cues.
- The Career's first screen is still dense for a newcomer. L20's briefing is long, and its commit-then-start order is unclear (fun-critic tester).
- In L01, dragging a cable can also pan the camera.

## [1.6.0] - "Truth Pass" (tag v1.6.0; driven by docs/CRITIQUE-1.5.md; review in docs/CRITIQUE-1.6.md)
### Added
- **Text truth test.** Every clock time and every quantity that a level's brief, place line, story, coach line, "why?" or debrief template quotes is checked against the engine. The test runs on all levels in both packs and replays each level's lesson build.
  - Times must be ones the engine uses: the start and end, scripted events, `*Block` fields, and the blocks where the load steps.
  - Quantities must match state, levelInfo or the chapter data tables to the printed precision. The few numbers a sentence derives (a rated current, a capacitor size) are listed with the engine function that gives them.
  - A control case checks that invented numbers and times are caught.
- **Storm Coast, the passive player:**
  - When cash sits idle while SAIDI heads past its target, the quarter report names the free cash and what readiness or hardening would buy.
  - Readiness shows its running cost and what has been spent on it so far.
  - After a settled forecast, the quarter report offers a **Stand readiness down** button.
- **L27 breaker sizing from the givens.** The givens card now lists the grown board's Z1, Z2, Z0 and I_b, so the breaker rating can be worked out rather than guessed.
### Fixed
- Found by the text truth test:
  - L19's coach said to run to 22:30; the shift ends at 21:30.
  - L19's place line said 20:00 for a shift that starts at 16:00, which explains the "16:00" stamp on the coach card. The brief now says both times.
  - The finale's debrief printed the frequency band as 49.90-50.05 Hz in every pack. It now prints the band the count used (49.95 in `global`).
  - The finale's "about 760 MVAr" for the 400 kV ring is now computed from the line data.
- L07's debrief names the supply point's P (what the card shows) next to the loads' P, and the feeder losses between them.
- L23's fault result was drawn under the prediction box ("(1726 MVA)" peeking out). It now sits beside the unit label.
- **Retry keeps chapter 7's designs and the player's predictions.** After a Retry, L27 used to say "0 of 0 predictions" while the boxes still showed the old numbers, and it reset the dispatch and breaker without a word.
- L36's lamps read "Mean prediction error ≤ …" (was "Score ≤ …"). Its result card prints the error in % rather than as money ("$0").
- The finale's debrief says that the short dips after a trip are reported, not counted against the band (a tester read "dipped 4 times" against "0 blocks outside").
### Changed
- **The speed dial is now three full-width keys, 1× 2× 4×, each about 60 px square.** The old knob's notches were a 16 px target.
- The weekly board's verifier accepts game version 1.6.0 on the same rules (1.5.0, epoch 2): 1.6 changed no scoring rule.

## [1.5.0] - "Storm Plan" (tag v1.5.0; driven by docs/CRITIQUE-1.4.md; review in docs/CRITIQUE-1.5.md)
### Added
- **Storm levers: a storm year is now a decision, not a dice roll.**
  - Each quarter has a **forecast**: settled, unsettled or deep lows. It is honest but noisy, read from the quarter's own storm draw and blurred.
  - **Storm readiness** is set for the coming quarters and charged each quarter:
    - level 0: ordinary rosters;
    - level 1: pre-storm switching and crews on standby, storm customer-minutes −30 % and interruptions −15 %;
    - level 2: mutual aid booked from the neighbours, minutes −55 %.
  - **Storm hardening** is a new project on a feeder: covered conductor, wider clearance and stronger poles. It cuts storm faults on that feeder by 60 % and pays back in 3-4 years on a storm-prone district.
  - The planner persona books readiness from the forecast.
- Career codes gain the readiness token `r:<level>`.
### Changed
- **The board no longer shifts under the pointer.** After a Start, the cards keep their order, and the started card or row stays in place as a same-height "Started" placeholder until the quarter or the selection changes. Both 1.4 testers misclicked because of this.
- **Targets follow a fast-healing network.** Each year's tightening is 1.5 %. While the network's expected SAIDI × 1.3 is well under the target, it is more, up to 8 % a year, and the review says by how much. Old Iron's targets no longer wait for the five-year reset while a rebuilt network runs far under them.
- Over 50 Home Counties seeds the planner now reaches Chief Engineer on 18 (was 13) and beats the firefighter on 47.
- The weekly board's rules are now 1.5.0, epoch 2: a fresh board, because scoring changed.
- After the full-campaign regression playtest (a returning student who last played 1.0 sampled one level per chapter plus the finale's first day and three Storm Coast years: 7 of 9 levels passed first try, 0 script errors):
  - **Retry keeps chapter 5's settings.** L14's cap bank and automatic tap changers were dropped while the radio said the build still stood; a new `controlDesign` query rebuilds shunts, steps, tap positions and automatic modes.
  - L19's lesson compares the player's RoCoF (or nadir, settled frequency, shed) prediction with what happened.
  - The regulator names the licence strike ("strike 2 of 3"), or says plainly that a fine does not count toward the licence. Before, the same threat was printed every poor year.
  - A transformer out of service after a failure says when it will be back, so firm margin −100 % is explained.
  - An incident that interrupted nobody no longer asks for a decision.

## [1.4.0] - "Old Iron" (tag v1.4.0; driven by docs/CRITIQUE-1.3.md; review in docs/CRITIQUE-1.4.md)
### Added
- **The weekly district has a leaderboard.** It runs on the shared cobanana-scores service.
  - `src/scores.ts` is a pure verifier. The server replays a finished weekly career from its code and checks three things: the seed and charter are that week's district, every action is legal, and the career has ended. It then recomputes the score bit for bit.
  - There is one board per ISO week (`career.<YYYY>-W<ww>`, whole points), from 2026-W47 to 2027-W13. Golden samples are generated by the planner persona.
  - The bundle is vendored into cobanana-scores (rules 1.4.0).
  - The Career docket shows the first-run notice, the week's top three, an online on/off switch and "Delete my online data". The ending sheet submits the career and shows its rank.
  - **GRID ships no scores host.** The board appears only when `CB_SCORES_URL` points to a server. It was tested against a local development server; nothing is public.
- The tree-cutting card states what each level buys: the expected SAIDI after a year at that level, and its cost.
### Changed
- Chapter 8 on the phone layout opens at the bottom of its pan, where the charts clear the coach card and the panel. A tab says there is more above. The title card and clock stay faded while panned.
- The phone menu button sits on a dark disc, so it reads as a button over a stage's text card.
- A weekly career keeps its week when it is saved and continued. The weekly bests now survive saves (1.3 rewrote the save file and lost them).
- The ending sheet rounds the score the same way as the career bar.
- After the Old Iron playtest (an asset-management graduate played all ten years and reached Chief Engineer, scoring it 7/10):
  - The worst-assets card lists substation plant first: each transformer or switchboard with at least a 5 % chance of failing this year, that chance, and what an emergency replacement would cost. Before this the list showed only feeder sections, because expected SAIDI does not count plant failures.
  - The quarter report warns about any plant at 10 % or more.
  - The final year no longer announces a reset or next year's targets.
  - A storm that faults nothing raises no incident card.
  - The ending sheet lists the years the targets were missed.
  - The tree-cutting deltas are signed.
- After the Lean Years playtest (a finance analyst played all ten years and ended Steady with 7 of 10 years met, scoring it 6/10):
  - The ending sheet breaks the score into its parts. Missed connection requests cost 25 points each, which nobody had been told.
  - The quarter report projects the regulator's three-year average from this year so far plus the expected rest. A good year still dragged under by bad ones is flagged before the review, not after.
  - Lean Years now cuts 4 % of all allowed revenue on top of 5 % of the opex allowance. The tester ended with $12M and found it "not lean". In that charter the planner persona borrows only for urgent work, and it still beats the firefighter on 8 of 12 seeds.

## [1.3.0] - "Charters" (tag v1.3.0; driven by docs/CRITIQUE-1.2.md and CRITIQUE-1.0's long-term score; design in docs/DESIGN-1.3.md, review in docs/CRITIQUE-1.3.md)
### Added
- **District charters.** A Career can start in one of seven districts. Each charter pushes a different pressure far enough to change which strategy wins. Targets still come from each district's own expected performance, so all of them can be won.
  - Home Counties: the 1.2 game, bit for bit.
  - Storm Coast: storms 1.7× as often.
  - Boomtown: 1.6× the connection requests and faster growth.
  - Old Iron: every asset 8 years older.
  - Solar Valley: 3× rooftop PV, heatwaves, and voltage complaints that cost 6×.
  - Lean Years: 5 % less opex allowance and little cash.
  - Forest Line: trees closer and more storms.
  - Over 12 seeds of each charter, the planner persona beats the firefighter on 8 to 10.
- **The weekly district.** Each ISO week has one seed and one charter, the same for everyone. The Career docket offers it with this device's best score for the week, and the ending sheet records the score.
- Career codes `C2/<seed>/<charter>/<actions>`. `C1` codes still load, as Home Counties.
- The career bar shows the district's charter.
### Changed
- **Planner persona restored to 45 of 50.** When the network cannot meet its targets even in fair weather, the planner switches to a reliability emergency mode:
  - every feeder is a candidate for reliability projects;
  - up to four projects a quarter;
  - it may borrow and use the crews held back for capacity;
  - it trims more trees.
  - Over 50 seeds it now beats the firefighter on 46 (was 41), reaches Chief Engineer on 13 (was 11) and loses its licence on 2 (was 6). The test floors are back at 45 and 12.
- **Debt caps the ending.** Ending the ten years with any negative cash keeps a career below Chief Engineer. The finance director's review says so, and the ending sheet lists in words everything that kept the career from Chief.
- **No target cliff.** A five-year reset tightens a target by at most 25 % in one step, and the review and the year-ahead warning say so.
- **Phone layout.** On chapters 4, 7 and 8, the title card and the clock fade out while the stage is panned under them, so the chart's axis is never covered at full pan.
- After the playtest (a second-year EE student played 24 Career quarters and chapter 8):
  - A project card warns before the project would take cash below zero.
  - The cash readout shows what the builds still owe and the cash after them; negative cash reads BORROWING.
  - Each review states next year's targets at the top: the 1.5 % yearly step, or the five-year reset in amber.
  - Connection-request cards read the next winter peak, before and after (they promised 96 % in autumn; it was 115 % in winter).
  - The charter chooser is laid out in two columns, so it fits the phone layout.

## [1.2.0] - "Fair Weather" (tag v1.2.0; includes rc.1; driven by docs/CRITIQUE-1.1.md, review in docs/CRITIQUE-1.2.md)
### Changed
- **Career regulation, made fair and then tightened.**
  - The regulator judges the rolling average of the price-control period's last three years, not one year. A single year's SAIDI swings about ±45 % with the faults and storms of a 40,000-customer district; three years cut that to about ±27 %.
  - Each five-year period ends with the targets reset to 1.3× what the network is modelled to achieve, where that is tighter. A good career's year-10 SAIDI target falls from about 411 to about 283 minutes, so the incentive is no longer automatic in the second half.
  - A severe-fine year counts toward losing the licence only when the network itself cannot meet the targets (its luck-free expected SAIDI or SAIFI is over them), and three must come in a row. Weather alone no longer ends a career.
  - The review sheet shows the rolling average beside this year's figure and announces the reset.
- **Chief Engineer needs a clean load index.**
  - No feeder may be over its winter cyclic rating (110 % of its static rating), and no primary may be short of firm capacity.
  - Each annual review prints the load index.
  - A new feeder can now split a chosen feeder, not only the busiest one at a primary.
  - Each primary has room for 20 feeders (was 14), and builds in progress count.
- **Planner persona** (the reference career in the tests):
  - It reinforces from the section currents of the load flow, and splits the overloaded feeder itself.
  - When the bays are full it falls back to demand response, then a battery.
  - It borrows for capacity only while the network is on track, and accepts connections only with headroom.
  - Over 50 seeds it beats the firefighter on 41, reaches Chief Engineer on 11, and ends with no feeder over its cyclic rating on most seeds. The design asked for 45 of 50; see CRITIQUE-1.2.
- **L16:**
  - The shift report gives the time of the day's worst loading and of the worst N-1 moment.
  - The control-room card adds "worst so far today, at hh:mm" beside its "now" table.
- **Chapter 8 on the phone layout:**
  - The study screen pans its whole canvas until every card clears the coach card and the panel. Before this, the bottom 156 px could not be reached.
  - The mouse wheel pans too, and a tab says there is more below.
- **Career screens:**
  - An emergency replacement after a plant failure is explained in the quarter report.
  - Request cards say that a lapsed request counts as missed.
  - The crew chief's "poor" verdict no longer says "patching, not fixing" while health rises.
- After the playtest (an electrician retraining as a planning technician played a full career):
  - The finance director names the credit line.
  - The quarter report breaks down running costs and warns of the reset a year ahead.
  - The load index reads the winter peak, so it agrees with the board.
  - Incident buttons say their effect and cost.
  - A new feeder splits the feeder you pick.
  - The log's cash matches the report.
  - The shift report scrolls when it is taller than the screen (L16 at 1080 p).
### Added
- A test that every star condition of every level has a lamp sentence (L28's frequency/island lamp now has one).

## [1.1.0] - "Employable" (tag v1.1.0; includes rc.1-rc.3; design in docs/DESIGN-1.1.md, review in docs/CRITIQUE-1.1.md)
### Added
- Chapter 8 UI (rc.3): each level has its own stage and panel.
  - L31 and L35: a single-line feeder with voltages at peak and at light load against the band.
  - L32: a section tree with a heat strip of outages per section, and live SAIFI, SAIDI, CAIDI and ENS.
  - L33: a log-log time-current chart with the margins marked.
  - L34: a hot-spot thermometer through the outage day.
  - L36: a givens card with three prediction boxes and a "why" card.
  - Each level has been played to a win at 1920x1080. On the phone layout the stage pans.
- Career UI (rc.3): a Career line on the title and the job board.
  - A district map coloured by loading or health, a project board with the engine's "why this helps" line, and a worst-assets card.
  - Connection requests, incident cards, a 40-quarter timeline, and quarter, annual review and ending sheets in the paper style.
  - The career code is saved and continues from it.
  - A ten-year desk career ended as Chief Engineer with targets met in 10 of 10 years. A first attempt lost the licence in year 7.
- Chapter 8 "The Feeder", engine side (levels L31-L36):
  - **L31 The Long Feeder:** voltage drop, conductors, taps, a regulator.
  - **L32 Count the Outages:** SAIFI and SAIDI with fuses, sectionalisers and a tie.
  - **L33 Fuse Saving:** recloser-fuse coordination.
  - **L34 Firm Capacity:** N-1 at a primary substation, transformer hot-spot and loss of life. No single purchase passes.
  - **L35 Sun on the Roofs:** PV hosting with OLTC line-drop compensation and volt-var.
  - **L36 Exam Bridge: Feeder Numbers.**
  - Each level has a naive build that fails, lesson and reference builds that pass, and frozen bot-population targets in both region packs.
  - The finale moves to chapter 9 (data only).
- Career engine, "The Utility" (`src/career`): ten years of quarters on a 2-substation, 9-feeder district. It models Weibull asset ageing, load growth, expected and seeded realised outages, a regulator's allowed revenue with a SAIDI/SAIFI incentive, annual reviews and four endings. Careers are deterministic and replay from a code, with independent Python oracles.
  - Persona sweep over 50 seeds: the planner beats the firefighter on 48 and the firefighter beats idle on all 50; the gold-plater is bailed out or fined on all 50.
- Chapter 8 engine, "The Feeder" (`src/sim/distrib`): a backward-forward sweep radial load flow, cross-checked against Newton-Raphson; analytical reliability per IEEE 1366 (SAIFI, SAIDI, CAIDI, ENS) with fuses, sectionalisers and a normally-open tie; IEEE C37.112 recloser curves and fuse coordination margins; IEC 60076-7 transformer hot-spot and ageing; PV hosting capacity with volt-var and OLTC line-drop compensation. All are checked against independent Python oracles (`tools/oracles/ch8_oracles.py`).
- A second-lamp rule (`star2`): the spend lamp can also ask for a result. L12's $0 AVR set-point now earns only the pass lamp; the spend lamp also needs the first swing under 70°.
- The shift report says what the next lamp wants on L02, L03, L05, L08, L09, L11, L12, L16, L20 and L23.
- Career wiring: a career lives in the game state as a seed plus an action list, so the career code is the save. New actions `careerStart`, `careerLoad`, `careerProject`, `careerEndQuarter` and others, and queries `career`, `careerBoard` and `careerQuote` (the board card's "why this helps" line). Money is shown in the region's currency.
- Career after the smoke test:
  - Request cards show the feeder's loading once the load is connected.
  - Transformer and switchboard cards give the chance of failure in the next year, old against new.
  - The annual review prints a load index: feeders over their rating and primaries short of firm capacity.
  - The SAIDI and SAIFI bars say they are caps.
### Changed
- Chapter 8 after the smoke test:
  - Lamps name their conditions: losses, energy not supplied, fuse margin, transformer life lost, solar hosted, prediction error and the "why" card.
  - L36's score lamps read in percent.
  - The L32 brief takes its SAIDI and SAIFI limits from the level (it said 260 and 1.6 against 275 and 1.7).
  - The system frequency dial is hidden on chapter 8 (it drifted to 30.9 Hz on L34).
- Exam bridges: L06 and L18's second lamp asks for a prediction (it came free with the pass). L22's lamps say they count answers within 1 %. Lamps on levels with nothing to buy name their condition instead of reading "Done well" twice.
- A bus's name label picks the bus, and a line picks anywhere along its wires (L09's series capacitor needed the spot under the middle).
- A second click on an armed tray cell keeps the part in hand and says how to put it down.
- The speed notches (1×, 2×, 4×) pick directly; the knob no longer wraps from 4× to 1× on a repeated click.
- After a job ends, a locked tool says how to Retry, and Retry never replays the work order. Retry also keeps the coach at the step the last attempt reached.
- L15 says to set its banks and reactor to Automatic. L11's caption shows right-click for steps of 1.

## [1.0.0] - Keep the Lights On (tag v1.0.0; includes rc.4 and rc.5)
Every chapter has been played to a win through the UI: by the Opus iterator on desk (L17, L21, L28 three lamps, L28 also in the
phone layout at 2424×1080) and by two campaign smoke testers on one level per chapter (a first-year persona, then a std-9 student). A fresh std-9 tester then won L20 and L11 after the last fixes. The harsh review is in docs/CRITIQUE-1.0.md.
### Added
- L28 is winnable by clicks alone: a build kit in the finale card (taps hold 1.02 pu, auto capacitor, spun gas unit, second causeway line
  or a 4-hour battery). An option you do not need reads "not needed", and a hand-placed STATCOM turns the capacitor button into "STATCOM instead".
- Retry keeps the build in every chapter, including chapter 6 (placed units, holds, store clocks, pumps, ride-through) with unit ids remapped.
  Retry restores all eight L20 stores after a full day, and this is tested.
- Phone layouts for chapters 3-7 and the finale. Each card fits between the HUD and the budget tag, folds to its title row and scrolls by finger.
- Trays: a "more parts" tab shows how many parts are out of view (› +N) and pages right on the grid, route and kit trays.
- Generator tags show running / stopped as soon as Start or Stop is pressed, and the radio says from what time.
- Knobs mark where their value sits (one tick per value on a list knob, a mark along a range); the span knob shows its spans as dots and lists them in its tip.
- L20: every peaker you buy gets an "order it on from 14:00" button in the control-room card, and a ticked row once ordered.
  The gas unit's size starts at its rating (105 MW). L20 was won through the UI with three lamps.
- hud_flow and the smoke + paper flow run in the official Godot runner (`node scripts/test-godot.mjs`).
### Changed
- Work orders taller than the screen reopen in the scrolling layout (L08 lost its title and "Take the job" at 1080 p).
- The shift report centres in the room above the tray, the budget tag and the run lever.
- Price tags switch to $625.0M / $1.1B when the full figures would not fit.
- A knob click at the end of its range turns back instead of doing nothing.
- The L28 card reads THREE DAYS DONE after the end; devices at a bus are drawn on top of the town and side by side; STATCOM and SVC draw as a teal valve hall.
- Peg labels step around town names; the L24 legend says what its spare line measures.
- Remove leaves the level's own power stations alone (on L20 it took a coal unit without asking).
- Chapter 4 and 7 sliders jump only from the track itself (a press on + or on the caption sent the L11 cans from 0 to 140).
- The report's "Worst home" reads "Lowest voltage at a load" (a school is not a home).
- Commit messages read a clock time ("from 12:00 on"), not a block number.
### Fixed
- The tray sent the bus where the engine expects the part for gas units and condensers, so L20 could not be won from the tray.
- L08: a capacitor bank taken down again is refunded. A bus tag no longer offers anonymous "Remove" rows for the town's own loads,
  and every Remove row names its element.
- L20: a store on its clock keeps a ticked row. The row used to vanish, which read as a lost store after Retry.
- L05: a refusal chip clears once a build succeeds.
- L17: a STATCOM is one device sized by its rating; the step knob no longer doubled its price.
- Chapter 6 card: 0 px on desktop (an AUTO ScrollContainer has no minimum height).
- L28's "triangulation failed": sliver terrain walls are skipped. `CB_POLY_TRACE=1` prints any bad world polygon once, with its caller.
- Chapter 7 on the phone: the price tag, chip rows and answer boxes stay in the panel's scaled frame.
### Known gaps
- No pass on a real phone, a gamepad, Windows or macOS for this release. The phone layout was checked on a desktop window at 2424×1080.
- Picking: a bus's name label does not pick the bus (only its peg); a second click on a tray cell cancels it; the L09 series capacitor needs the spot under the line.
- L15 does not say to switch its capacitor bank; L12 can be won with one click; several third lamps ask for nothing new.
- No district play across jobs, no reliability indices, no substations: see docs/CRITIQUE-1.0.md for the gaps to "employable".

## [1.0.0-rc.3] - played through, chapters 5-7 (tag v1.0.0-rc.3, local)
### Added
- Every exam and prediction level shows its givens on screen: L18 (line impedances, slack, load, PV bus, flat start, the GS update),
  L23 (grid fault level, transformer and generator impedances on the 100 MVA base), and L27 (sequence impedances, cost curves and limits, swing data).
- L13: a P-δ chart at the current excitation (P_max = EV/X_s, the night P line, the δ < 60° limit).
- L22: the task and the live G1 share on the exam sheet; a real third lamp (all three answers within 1 %).
- L28: a Tap hold cell in the tray for the Eastgate transformers.
### Changed
- L16 is laid out on 10 km tiles (ring sides about 70 km, the chord about 32 km): a new parallel line is no longer 1.8 km long.
- L17: a margin under 5 % after the trip loses with its own message, and the card labels the live margin "now".
- L15: a reactor breaker rests 45 minutes after it switches (it hunted).
- Chapter 6: a battery nobody scheduled stands ready for frequency response; it does not trade.
- Work orders name each level's real pass conditions and third-lamp condition; the L24 gloss says how to tighten the grading.
- The run lever's tooltip lists its keys (Space, + / − for speed, . for one step); yards show their names before the first run.
### Fixed
- L21: the gauge read 52-64 Hz after a collapse (it showed a model with no machines left); a battery alone no longer holds a dead island;
  sun beyond demand is curtailed; the rooftop sentence follows the real RoCoF; the RoCoF field takes typed digits; the toggles show ON/OFF and price.
- A second device on the same bus can be selected (click again to walk to the next).
- Retry / Start over clears an armed tool; a sheet folding away no longer swallows the next click.
- No "$0 / $0" budget tag on levels with nothing to buy; degenerate world polygons are skipped.

## [1.0.0-rc.2] - "Keep the Lights On", played through (tag v1.0.0-rc.2, local)
### Added
- `in` pack, WO-28: the state is tied to the All-India grid (a 1000 MW 400 kV tie at the Capital; large inertia, droop, no reactive help).
  Losing the 660 MW unit now dips the frequency to about 49.96 Hz instead of 49.26 Hz, so the third lamp can be reached. The voltage is still the player's job.
### Changed
- L10: each house shows its kVA. The star targets were re-frozen from designs a player reaches by hand (the third lamp needs 8 moves or fewer).
- L11: the cans step by 5 (right-click by 1). L13: the excitation ± buttons step 0.001 pu, and the predictions read "—" until Run.
- Chapter 3: a placed capacitor bank starts switched in, and its tag shows IN n/N or OUT. The mill bus is labelled ("banks go here").
  A second bank on a bus is refused. The L08 reactor steps through presets.
### Fixed
- The L07 incident report printed a current that did not follow from its own S and V (1.71 MVA at 0.946 pu is 95 A, not 119 A).
  The "what to try" text now says when the bank stood on the wrong bus or was switched out.
- The world labels at L28's capital (400/220/132 kV and the datacentre) printed on top of each other.
- Saltmarsh Island (L28) and the quarry (L09) sat under the budget tag.
- Tray captions are shrunk before they are elided ("ICT 400/220", "Twinmoose").
- Exam bridges with nothing to buy no longer list "Spend ≤ $0".
- A chapter 3 commit had silently reverted the chapter 4 fixes; they are restored.

## [1.0.0-rc.1] - "Keep the Lights On" (tag v1.0.0-rc.1, local; the finale; every chapter playable; critique pass in docs/CRITIQUE-1.0-rc.md)

Chapters 3-7 and the finale were built in parallel and land together in this tag; the 0.4.0-0.9.0 sections below describe them chapter by chapter.
### Added
- **WO-28 Keep the Lights On**: the whole state for three days (26 buses at 400/220/132 kV, nine plants, a 300 MW datacentre).
  Day 1 a heatwave peak, Day 2 a storm that trips a 400 kV line, the largest unit and a transformer, then lightning on the island's
  causeway at 23:30, Day 3 a holiday full of sun and little demand. Saltmarsh Island must not go dark on the night before Nia's exam.
  A day card with the threat, the island lamp and an event ticker; the game-end card.
- Ruleset 6 for both region packs (pins and goldens regenerated).
### Changed
- Every chapter card went through two or three playtest and fix waves (Haiku panels, before and after): one-line glosses for the jargon
  (pu, X_s, THD, RoCoF, pickup, TMS, CT, lambda, zones), targets shown before Run, and panels kept clear of the clock and the budget tag.
- Chapter 7 levels that teach a calculation (L23, L25, L26, L27) need a written prediction to pass, so there is no two-action win.
- The work order and shift report leave out spend lines on levels with nothing to buy, and on score levels.
### Fixed
- Towns read "dark" before the grid had ever been solved; they now show their name only.
- The L28 report printed the Day 2 storm sentence after a Day 1 failure.
- The finale ticker opened with the free-play banner ("the grid is empty").
- dmath everywhere in src/ (chapters 3, 5 and 7 and the finale used Math.hypot, pow, cos and **).
- The Godot test runner read `CH2-FLOW OK` as a failure (a tag with a digit).
- L13's predict panel was blank until the slider moved; L22's exam sheet ran off the right edge; L24's readout sat under the budget tag;
  L27's answer boxes covered the formula lines; L17's B3 sat under the tray.
### Changed
- WO-28 in the `in` pack now has the All-India interconnection: a 1000 MW 400 kV tie at the Capital (an external equivalent with 100 GVA of inertia, droop, no reactive power), so losing the 660 MW unit leaves a nadir near 49.96 Hz and the third lamp is reachable (reference: taps, switched capacitors and a second causeway line, 398 M INR; the spun unit is the lesson's extra).
### Known gaps
- Day 2's lightning opens the causeway by protection; it is not a sequence-network fault.

## [0.9.0] - in 1.0.0-rc.1: "Protection and Markets" (chapter 7)
### Added
- **WO-23 Fault Level**: the short-circuit current at each feeder against its breaker rating (30.2 kA at F1 once the generators join);
  split the bus, add a reactor or high-impedance transformers to bring it under the breakers.
- **WO-24 Coordination**: grade the relays so the nearest one trips first (time-current curves, 0.3 s grading margin).
- **WO-25 Clear It in Time**: the critical clearing time of a generator after a fault (163.6 ms, 53.5°) against relay plus breaker time.
- **WO-26 Merit Order**: commit plants and pick a dispatch rule; the water value of the hydro; a congested corridor splits the price.
- **WO-27 Exam Bridge**: protection calculations (symmetrical and earth-fault currents, CCT) on paper, attempt first.
### Known gaps
- The study networks of WO-23 and WO-27 are the scenario's; the map is decoration. No bullet-time replay of the fault yet.

## [0.8.0] - in 1.0.0-rc.1: "Frequency and Renewables" (chapter 6)
### Added
- **WO-19 Fifty Hertz**: the largest unit trips at 20:00; keep a spare unit spinning so the nadir stays above the first shedding stage.
- **WO-20 Sun Goes Down**: the evening ramp after 3 GW of solar; commit peakers in time, move the pumps to noon. A net-load curve shows the ramp.
- **WO-21 Inertia Matters**: RoCoF without spinning mass; ride-through for rooftop inverters and grid-forming batteries.
- **WO-22 Exam Bridge: Droop and RoCoF**: three predictions with a formula card you can open after trying.

## [0.7.0] - in 1.0.0-rc.1: "Load Flow and Voltage" (chapter 5)
### Added
- **WO-14 Per Unit**: tap changers on a 132/33/11 kV chain; staggered automatic delays beat equal ones (about 28 tap moves instead of 140).
- **WO-15 Long Line**: a 300 km line at light load lifts its far end (Ferranti, 1.089 pu); reactors, capacitors or an SVC at the receiving end.
- **WO-16 Loop Flow**: power splits by impedance around a ring; reconductor with HTLS, add a line, open a ring line or run the plant at B4,
  and survive the loss of any one line (N-1).
- **WO-17 Nose**: the P-V curve and the loadability margin; capacitor steps, STATCOM, SVC or a peaker against voltage collapse.
- **WO-18 Exam Bridge**: a PV bus set-point and Gauss-Seidel against Newton, three predictions.
### Fixed
- Shunt-reactor catalogue rows were read as capacitors.


## [0.6.0] - in 1.0.0-rc.1: "Three-Phase and Machines" (chapter 4)
### Added
- **WO-10 Balance the Phases**: move each house's drop between phases a, b and c; the neutral carries the unbalance (160 A on one phase).
- **WO-11 Star or Delta**: size a capacitor bank (a star bank needs three times the microfarads of a delta one) and pick the pump's starter.
- **WO-12 Over the Hill**: a generator 300 km away; raise its excitation, add series capacitors or a third circuit so it stays in step
  after a line trips (P-δ curve, rotor-angle swing).
- **WO-13 Exam Bridge**: synchronous machine phasors (E, δ, P_max) on paper.

## [0.5.0] - in 1.0.0-rc.1: "Phasors and Power Factor" (chapter 3)
### Added
- **WO-07 The Lagging Mill** with a shift-report lesson in your numbers (S = P + jQ, the wattless current at lunch).
- **WO-08 Resonance at the Fifth**: the plain bank resonates with the mill's drives and blows its fuse; a detuned bank or a filter
  (harmonic study at h × 50 Hz, THD against the 5 % limit).
- **WO-09 The Hundred-Percent Trap**: series compensation lifts the far end, but at 100 % the fault current beats the old breaker.
- Chapter-end cards for chapters 3 to 7; the Jobs list is grouped by chapter.

## [0.4.0] - in 1.0.0-rc.1: "Salt Wind" (insulation: the sea air on the insulators)
### Added
- **WO-29 Salt Wind.** Year two on the Mainland: your River Line still stands, and the harbour (fish market and ice plant) on the
  south coast wants power all night. Extend 11 kV from Brightwater around the town to the beach.
- **Insulators.** Pin (320 mm of creepage), a two-disc string (590 mm, hangs the wire 0.30 m lower) or one anti-fog disc
  (430 mm, 0.15 m). The salt needs Um × mm/kV: 12 kV × 31 mm/kV = 372 mm on the beach, 300 mm a little inland. Choose an
  insulator for the line and another for the coast stretch.
- **The salt is visible**: the coast is whitened by how much salt the wind lays there, sea fog rolls in from 02:00 and is thickest
  at 04:00, and an insulator short of its creepage crackles violet in the fog before it flashes over.
- The harbour gets its own houses, dark until you bring the power.
- **WO-04 Spin the Alternator**: poles, turns, field and coil area on a machine bench; the scope shows the sine, the village needs
  50 Hz and 230 V (f = poles × rpm ÷ 120, e₀ = N·B·A·ω).
- **WO-06 Exam Bridge: The Town Line** (textbook mode): 800 kW over a 15 km line loses 75 % at 4 kV and 0.75 % at 40 kV; pick the
  cheapest pair of transformers that keeps losses under 2 %.
- **WO-30 Bring the Island Home** (chapter 2 finale). Saltmarsh Island lies 4 km off the harbour. Lay a submarine XLPE cable
  (70 / 120 / 185 mm²; it charges like a capacitor: Q = V²ωCℓ, about 46 kvar), put a transformer on the island, and size the
  island battery. At 21:00 a trawler drags its anchor across the cable: the island must stay lit until 23:00 on the battery alone
  (inverter kW against the peak, kWh against two hours of evening load). The island, the seabed cable, the trawler and the cut are drawn;
  the lighthouse turns while the island is live and the battery hut shows its charge.
- Prices before you buy (the engine prices a build on a copy of the night); taking down something you bought this job refunds it.
### Fixed
- The shift report no longer contradicts the clearance gauge: it names your longest span and your tightest one (the gauge's number);
  after a flashover it names the span that flashed, and "What to try" tells you how to lift it (or, at 0.42 kV, to go to 11 kV).
- Switching the line voltage moves your line to the same towns' yards (one line, one bill); a new survey between the same towns
  replaces the old line instead of building a second one.
- On a Steam Deck and in small windows the Mainland map keeps both towns above the tray; the market's houses fill its streets.
- Pixel 9a: the Mainland runs at 30 fps (was 18-20).

## [0.3.0] - "The Mainland Line" (tag v0.3.0, local; chapter 2 opens; critique pass in docs/CRITIQUE-0.3.md)
### Added
- **Chapter 2, WO-05 The River Line.** Bring a waterfall's power 4 km across a river, a mangrove swamp and a ridge to Brightwater
  market. You survey the line yourself: click a yard, click the ground to bend it, finish at the other yard.
- **What holds the copper up.** Three pole families (wood 9 m up to 70 m spans, concrete 11 m up to 100 m, steel tube 13 m up to 130 m),
  bank structures for the river (H-frame or steel tube), span spacing, three conductors (Weasel, Rabbit, Dog). Bends need stronger
  angle poles, swamp poles need piles, rock needs anchors, forest has to be cut.
- **Sag you can see and check.** Every span sags by D = wL²/8H at 75 °C; the clearance gauge shows your worst span against the rule
  (ground, road and high water) while you survey, and a span that comes too low is refused with the reason and the tile marked.
  At the 19:30 peak a span that is still too low flashes over.
- **The voltage choice.** A line-voltage cell in the tray: 0.42 kV straight from the powerhouse (it browns out), or 11 kV with a
  transformer at each end. The shift report explains why with your numbers (305 A at 0.42 kV against 12 A at 11 kV: 1/26 of the
  current, about 1/690 of the heat).
- The survey chip shows where the money goes (poles, footings, wire, forest cut); the shift report's lesson names your longest span
  with its sag worked out in your numbers.
- Brightwater's bulb mascot shows the market's live voltage; crocodiles sulk on the swamp piles; a lineman climbs the poles you plant.
### Fixed (from the 0.3 critique: two novice and teacher testers, a code review, the Pixel, a pad and a monkey tester)
- Each site had two yards drawn on top of each other: you could not tell which was 11 kV. Now one yard per site, picked by the
  line-voltage cell.
- Changing span, pole or wire on a built line charged a second line; now it costs the difference.
- An over-budget line that lit the market was stamped NOT LIT; it now says OVER BUDGET, and money in the verdict is formatted.
- The river refusal no longer tells you to use bank structures you already chose; it says how far yours reach and which would do.
- The mouse wheel no longer changes parts by accident; the tray's scroll marks work; tray names no longer run into each other.
- A pad could not get past the first work order (focus was stuck on the Learner chip). The pad survey now steps further when
  zoomed out, repeats when held, and Y jumps to the far yard; the legend strip shows the survey buttons.
- The radio log stays readable in small windows; Retry says when part of an old design would not rebuild.
### Known gaps
- On the Pixel 9a the Mainland map ran at about 20 fps (30 fps from 0.4.0).
- One cost-optimal design is still easy to find by trying every option; the harbour job (insulation, salt fog) adds the next layer.

## [0.2.0] - chapter 1 critique pass (tag v0.2.0, local; see docs/CRITIQUE-0.1.md)
### Fixed
- **Retry keeps your build.** After a failed night the hut, reels, junction and converters stay where you left them and the work order
  stays folded in its pin, so a retry is one swap and a breaker pull instead of six clicks and a rebuild. Tobi says so on the radio.
- **No dead air.** A five-hour night now runs in 16 seconds at 2× (6 s at 4×).
- **The lessons say the rule first.** L01's report reads "Thin, long copper pushes back on the current … V = I·R"; L03 no longer tells you
  to fit the 380 V converters before you have thought about it (Tobi asks how the same power could need less current).
- On a Steam Deck sized screen the island no longer shrinks into the left third after the layout changes; the shift report fits without
  its "more" cue covering Ada's note; the budget tag no longer sits on the 35 and 50 mm² reels; no stale what-if chip during the night.
- The lighthouse stays on its headland when you move the hut.
- Jobs start without a generic cyan confirmation box (your running job is autosaved first).
- The prologue's open line has a glowing breaker in the world: tap it to close Line 7 (it was only reachable from an old drawer).
### Changed
- Sandbox is off the title screen until it has its own tray and map (it opened an empty board).
- The comparison histogram is labelled "Every design the job allows (offline sample, not real players yet)".
### Known gaps
- Each chapter 1 job still has one obvious best answer; depth arrives with chapter 2 (design/grid/DEPTH.md).
- The prologue is still short on spectacle (no bullet time yet). Audio has not been heard by a human.

## [0.1.0] - chapter 1 first review build (tag v0.1.0, local)
### Added
- Chapter 1 "The Island": L01 First Light, L02 Two Hamlets, L03 The Price of Distance, prologue P0; GRID's own night-shift interface
  (instruments, radio, kit tray, breaker, paper work orders and reports), Cute mode, synthesised audio, Jobs, Settings.

## [0.0.1] - scaffold
### Added
- Project scaffolded from cobanana-core: engine, Godot front-end, CI, Android build.
