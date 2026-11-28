# GRID audit 1128b: bug ledger

Ravi, QA. Desk harness, software GL (llvmpipe, low tier, 1920x1080 unless noted). Shot paths are under
`/home/ixaxaar/src/ORGS/cobanana/.qa/grid/<slot>/shots/` (slot c = fresh campaign, slot d = CB_LEVEL runs).
Severity: high = blocks play, wrong result, crash, data loss. med = visible glitch or confusing. low = cosmetic.

| id | job | what (steps) | sev | evidence | fixed in |
|---|---|---|---|---|---|
| B01 | title, WO-01..03 | The sea is a flat plane with a visible hard square edge and a darker rectangle behind the island (title: band at y 230 and 325; WO-02 upper right corner at 1690,135). Reads as a box, no horizon. | med | c/shots/title2.png, c/shots/n2.png | cc480be (fog to the sky), recheck on low tier |
| B02 | WO-01 | Fail the job (4 mm² reel, Run). The first Incident report opens BLANK: only Retry / Look around, the panel is taller than the screen and cut at the top. After Look around, tap the red pin: the same report shows the text correctly. | high | c/shots/s7.png (blank), c/shots/s11.png (after pin) | f8005c2 |
| B03 | WO-02, WO-03 | Shift report opens only 460 px wide (WO-01: 620 px) and the right side is clipped: third lamp text, "Line loss" column, histogram right half, Ada's text lines cut off. | med | c/shots/n5.png, scratchpad w3d.png | f8005c2 |
| B04 | WO-04 (all scope jobs) | The SCOPE chart and its readout lines show through the Incident and Shift report (text on text, wave line behind the title). | med | c/shots/w4g.png | f8005c2 |
| B05 | WO-04 | World labels show through the pause menu and the Jobs list: "Poles 12 · f = p×N÷120" tooltip ghosts behind the "ON HOLD" and "JOBS" headings. | low | scratchpad p1.png, c/shots/j2.png | f8005c2 |
| B06 | Settings | Gameplay tab: "Online scores" row has no visible switch (only a dot). Controls tab still lists drawers, workshops, touch drawer dividers that GRID does not have. | low | scratchpad stall.png | c559e82 (scores switch shows On/Off); Controls tab list is in shared core (not this repo): open, low |
| B07 | Jobs list | The "more" scroll hint prints over the next chapter heading ("CHAPTER 2 · ALTERNATING CURRENT, THE MAINLAND"). | low | c/shots/j2.png | 62046da |
| B08 | WO-12, WO-13 | Shift report opens with its top cut off the screen (title, lamps, cost not visible, only the Ada text and buttons). Seen in the batch before f8005c2; same class as B02. Needs a replay on the new build. | high | scratchpad L12_m.png, L13_m.png (/tmp/claude-1000/-run-media-ixaxaar-src-code-src-ORGS-cobanana/758c6b34-e328-45a8-9a79-f4c864a0a1c9/scratchpad/) | f8005c2 (replayed on the 4090: WO-12/13 reports whole) |
| B09 | WO-19, WO-20, WO-21 | Cooling towers and the chimney render pitch black on their shadow side (and fully black in some frames) while the rest of the plant is lit. | med | scratchpad L19_m.png, L21_m.png | not reproduced on the 4090 after cc480be (new concrete shader); recheck on the desk build |
| B10 | WO-22 | Lamp text prints "within 1 %%" (double percent sign) on lamps 2 and 3. | low | scratchpad L22_m.png | 7a5febc |
| B11 | WO-18 | The Exam sheet drawer runs down over the 1x/2x/4x speed buttons (last lines over the buttons). | med | scratchpad L18_m.png | 7a5febc |
| B12 | WO-31 | Tray column headers collide: "SECTION (N1 at the substation, N5 the far end)" runs into "TRANSFORMER TAP". | low | scratchpad L31_m.png | 7a5febc |
| B13 | WO-32 | Report text is longer than the panel: the "more" hint prints over the last text line. | low | scratchpad L32_m.png | 62046da (cue on a solid chip) |
| B14 | WO-11, WO-14, WO-21 | The "Shift over. Report in a moment" toast sits on top of the tray header text ("CAPAC..." cut). | low | scratchpad L11_m.png, L14i_m.png | d25a368 |
| B15 | WO-34 | MVA chart: legend "firm capacity 24 MVA" is drawn over the line label "survivor carries up to 1.5 x rating". | low | scratchpad L34_m.png | open, low: the MVA chart labels sit on its lines at 1920; V folds the charts |
| B16 | WO-09, WO-14, WO-07 | The subject is tiny or missing: WO-09's hamlet is a speck on a huge plain; WO-14's three towns show only labels over empty terrain (no houses, no lines at that zoom); WO-07 mill is a small box. | med | scratchpad L09_m.png, L14i_m.png | d25a368 (WO-07/08/09 open on the mill town; WO-14 framing unchanged) |
| B17 | WO-02 | Camera frames hamlet 2 at the left screen edge; half of it and its label are cut off. | low | c/shots/n3.png | d25a368 |
| B18 | WO-28 | At night a wide white vertical glow strip runs across the sea between Harbour and Saltmarsh (bloom or light cone, no source). | med | scratchpad L28_m.png | not reproduced on the 4090 (after-audit L28 night shots clean); recheck on the desk build |
| B19 | WO-36 | Lamp 2 says "Mean prediction error <= 10.02 %" (odd threshold); the third WHY option row hangs over the tray's bottom edge. | low | scratchpad L36_m.png | 7a5febc (wording; threshold 10.02 % is the frozen star line, kept) |
| B20 | WO-P0 | "lowest 14.60 Hz" caption is printed over the gauge needle and arc. | low | scratchpad P0_m.png | 7a5febc |
| B21 | campaign | A fresh "Take the night shift" starts at WO-01. P0 (The Night the Lights Went Out) is listed first in Jobs but the campaign never offers it. If the prologue is meant to open the game it is skipped. | med | c/shots/j2.png | 7a5febc (DECISIONS 30) |
| B22 | WO-06, WO-10, WO-11 | A faint ghost of the chart behind (text of the chart shows through the report panel at low alpha). Remains after f8005c2. | low | scratchpad L06_m.png | not reproduced on the 4090 after f8005c2 (L06/L10 reports clean); recheck on the desk build |
| B23 | WO-11 | Lead found: with no capacitor bank the lesson printed "(0 µF per phase, -, cans at 0 V of a rating of 0 V)". | low | after-audit L11 | 046dd73 |
| B24 | WO-07 (forced report) | Lead found: a report opened before the end showed an empty "What happened" heading. | low | after/L07-3result.png | 7a5febc |
| B25 | WO-23 (1280x800) | At 1280x800 the tray (BREAKERS | BUS COUPLER | BUS-SECTION REACTOR | TRANSFORMER IMPEDANCE) runs under the 1x/2x/4x speed block: the transformer impedance buttons and their header are cut off and cannot be clicked. | high | .qa/grid/d/shots/L23_a.png (run at 1280x800) | |
| B26 | WO-31 (1280x800) | The tap row's right end ("+5") and the regulator set-point cells are clipped by the speed block at 1280x800. | med | .qa/grid/d/shots/L31_a.png | |
| B27 | WO-12 | Lamps 2 and 3 carry the same condition ("Spend <= $480,000, first swing peaks <= 70 deg"): the third lamp asks nothing more than the second. | med | .qa/grid/d/shots/L12_d.png | |
| B28 | WO-05 | Over-budget fail ($283,027 vs $270,000, no transformers placed): Ada's text says "Voltage did the rest ... 305 A at 0.42 kV but only 12 A at 11 kV" as if the step-up pair was built. The budget readout "$283.0K / $270.0K" runs to the edge of its box. | low | .qa/grid/c/shots (hand play, see PLAYTEST) | |
| B29 | WO-05 | Tray names are cut ("Concr...", "Steel t...") so the two structure families cannot be told apart; after a route is built the tray shows Wood / Weasel selected although a steel / Rabbit line stands. | low | scratchpad e7.png | |
| B30 | pause menu | The pause menu has no Save and quit. Controls says Ctrl+Q does it, and it works (game exits, Continue restores the exact incident). A new player will not find it. | low | scratchpad p1.png | |
