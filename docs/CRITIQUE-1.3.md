# CRITIQUE 1.3: GRID "Charters", before the tag

Written by the Opus iterator on 2026-11-20 at the end of the 1.3 wave. The wave was driven by [CRITIQUE-1.2.md](CRITIQUE-1.2.md)'s open items (planner strength, debt, the target cliff and the phone overlap) and by long-term play, which CRITIQUE-1.0 scored 3. The design is [DESIGN-1.3.md](DESIGN-1.3.md). It is harsh on purpose. Scores are 1-10.

## Who played what
| Who | Surface | What | Result |
|---|---|---|---|
| Career persona sweeps | engine | the planner over 50 Home Counties seeds; 20 seeds of each charter while tuning, 12 in the test | planner beats firefighter on 46 of 50 (was 41); on 8-10 of 12 for each charter |
| Sonnet tester (second-year EE student, impatient) | desk slot h, 2424×1080 desktop and phone layouts | 24 Career quarters (seed 7, to the year-5 review); L31, L33, L35 on desktop; L33, L34 on the phone layout | L31, L33 and L35 passed in 2-3 tries; Career 7/10 and chapter 8 8/10 by the tester's own scores |
| Opus iterator | desk slot h | chapter 8 and chapter 7 on the phone at full pan; the Career docket, the charter chooser (desktop and phone), a Storm Coast career, the overdraw warning | fixed in this wave |
| vitest / Godot runner | engine / headless | see the README's Status | all pass |

Not done:
- A real phone, a gamepad, Windows or macOS.
- A human player.
- A full ten-year career in any charter by a tester. Only the personas have played charters to the end.

## What changed, and what it measured
- **The planner, strengthened rather than excused.**
  - The design asked for 45 of 50; 1.2 had 41, with a lowered test floor. The losing seeds all had the same shape: a network that could not meet its targets in fair weather, while the planner kept reliability spending to four feeders and three projects a quarter.
  - The planner now has a reliability emergency mode, triggered by the same test the regulator uses for revocation. In it:
    - every feeder is a candidate;
    - it may start four projects a quarter;
    - it may borrow;
    - it may use the crews held back for capacity;
    - it trims more trees.
  - Results: 46 of 50, Chief Engineer on 13, licence lost on 2 (was 6). The floors are back at 45 and 12.
- **Debt.** Chief Engineer already needed cash ≥ 0. What was missing was saying so before the end, and saying why at the end.
  - The finance director now states it in every year that you are borrowing.
  - The ending sheet lists each shortfall in words.
  - After the playtest:
    - a project that would take cash below zero says so on its card before you start it;
    - the cash readout shows what the builds still owe and the cash after them;
    - negative cash reads BORROWING.
- **No cliff.** A five-year reset can tighten a target by at most 25 % in one review, and the warning a year ahead and the review both say so. Every other year's review now states next year's targets and the 1.5 % yearly step at the top of the sheet. The tester found the reset buried below the fold and the yearly step never mentioned.
- **Phone overlap.** On chapters 4, 7 and 8, the title card and the clock fade to nothing while the stage is panned under them, and come back as it pans home.
- **Long-term play: charters and the weekly district.** Seven named districts, each pushing one existing pressure far enough to change which strategy wins.
  - Targets still come from each district's own expected performance.
  - Tuning showed how blunt multipliers are:
    - Boomtown at 2.2× connections lost the planner its licence on 8 of 20 seeds;
    - Solar Valley changed nothing until voltage complaints had a price (×6);
    - Lean Years at −12 % or −8 % made planning no better than firefighting;
    - a frugal planner variant for Lean Years made it worse and was reverted.
  - The weekly district gives everyone the same seed and charter for an ISO week. The best score is kept on the device.

## Scores
| Criterion | 1.2 | 1.3 | Why |
|---|---|---|---|
| Physics fidelity | 8.5 | **8.5** | No model changes. Charters are multipliers on existing pressures. |
| Teaching | 7 | **7.5** | Each charter teaches one lesson hard: storm hardening, capacity versus saying no, inspection and replacement order, PV voltage rise, payback discipline, vegetation. Seven districts are seven short courses. |
| Clarity for a newcomer | 6.5 | **7** | Debt is visible before it happens, next year's targets are at the top of the review, and the request card reads the winter peak. Cash still leaves as quarterly capex, which takes a moment to grasp. |
| UI and controls | 6.5 | **7** | The phone stage is no longer covered at full pan, and the chooser fits a phone. At the *top* of the pan, the coach card and panel still cover the lower chart (by design: the tab says to pan). |
| Layout robustness | 6 | **6** | The chooser's first layout overflowed the phone; it was caught on the desk and fixed. No new resolutions were checked. |
| Charm | 6.5 | **6.5** | Named districts help a little. No new art. |
| Long-term play | 6.5 | **7.5** | A reason to start again (seven districts that each need a different plan) and a reason to come back (a new weekly district every week). Still missing: any comparison with other players beyond pasting a code. |
| Depth to "employable" | 6.5 | **7** | Regional differences (coastal storms, growth areas, ageing urban networks, PV-heavy feeders, efficiency pressure) are what distribution planners actually face from one licence area to the next. |
| Engineering quality | 7.5 | **8** | The lowered floor is gone: the planner was improved until it passed. Charters keep Home Counties bit for bit (same state hash), C1 codes still load, and every charter has a winnability test. |
| **Overall** | 6.5-7 | **7** | The Career now has a reason to be played more than once. |

## What fails
- **Charters were tuned by persona, not by people.** No tester has played a full career in any charter. The heuristic planner is a weak proxy for how a human plays Boomtown or Old Iron.
- **Old Iron and Lean Years are the hardest**, with the planner winning only 8 of 12 and Chief Engineer rare. That may be fair, or it may be the planner's limits. A human pass is needed.
- **The weekly district has no shared board.** "The same district for everyone" means little without somewhere to compare scores. The career code is the only proof.
- **The phone at the top of the pan.** The coach card and the panel cover the lower part of chapter 8's charts until you pan. The tester counted it as a problem, though the pan tab says what to do.
- **Smaller tester notes not fixed:**
  - Tree-cutting level 2 doubles the cost with no stated benefit.
  - The phone menu icon sits on the right-hand text panel.
  - A new feeder's completion felt earlier than its quoted lead time. Not reproduced: the lead is applied as quoted.

## Open after 1.3
| # | Sev | Finding | Source |
|---|---|---|---|
| 1 | major | No human or tester has played a charter to the end; tune Old Iron and Lean Years with real play. | sweep |
| 2 | minor | Weekly district: local best only; consider a code-verified board or at least a share line. | design |
| 3 | minor | The vegetation card does not state the expected fault reduction of each level. | tester |
| 4 | minor | Phone: coach card and panel cover chapter 8's lower chart until panned; the ≡ icon overlaps the right panel. | tester |
| 5 | minor | 1.2's reconductor-card and flat-revenue notes are still open. | CRITIQUE-1.2 |
| 6 | gap | No phone, pad, Windows or macOS pass; no human player. | — |
