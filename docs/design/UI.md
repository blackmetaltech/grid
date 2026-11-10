# GRID: interface and soul (v1, Opus, 2026-11-10). Binding for the GRID front-end; supersedes DESIGN §5.4 palette/typography and §5.6 layout.

## The soul in one line
**You work the night shift.** The province is dark; light is the reward. GRID's interface is the gear of a lineman and a
night dispatcher: analog panel meters, a radio, work orders on paper, a breaker handle. Nothing looks like a SaaS dashboard.

## What GRID must never look like (GIGAWATT's chrome)
No full-width top stats bar · no TICK/NEXT/Paused/MENU button row · no numbered coloured tab buttons along the bottom · no
right-hand stack of bordered cards with ALL-CAPS chips · no Chakra Petch · no cyan-bordered panels. The core shell is used for
plumbing only (bridge, saves, settings data, pad/touch/layout, modal discipline, back/Esc) via `cfg.chrome = "custom"`.

## Palette (tokens in `godot/ui/grid_theme.gd`)
| token | hex | use |
|---|---|---|
| night | `#0B1026` | sky, scrims (alpha 0.82) |
| ink | `#141A33` | dark surfaces (radio, tray) |
| sodium | `#FFC56B` | **the UI accent**: focus, primary action, lit things. Light is the goal, so the accent is light |
| sodium_dim | `#B8894A` | secondary accent, inactive knobs |
| paper | `#EFE6CF` | work orders, tags, shift report (dark text on it) |
| paper_ink | `#2A2418` | text on paper |
| meter_face | `#F3EEDF` | instrument faces |
| copper | `#C8794A` | cables, wire icons |
| live (flow) | `#39E1FF` | **physics only**: power-flow ribbons, never UI chrome |
| reactive | `#FF4FD8` | physics only: Q overlay |
| warn | `#FFB020` / bad `#E5484D` / good `#5BD69A` | meter zones, tag status |
| text / dim | `#ECE7DA` / `#9C9A93` | text on dark |

## Type
- **Big Shoulders Display** (OFL; signage face): titles, level names, big numerals on the work order. Weight 800 for titles.
- **IBM Plex Sans** (variable, OFL): all body text, sentence case.
- **IBM Plex Mono** Medium: meter readouts, radio log, numbers on tags (tabular figures).
Min 15 px logical body on desktop; core `CbKit.fs` scaling still applies. No ALL-CAPS except tiny meter-scale labels.

## Screen anatomy (desktop 1920×1080; the world is always full-bleed behind everything)
```
                 ┌─ instrument cluster (top centre, floats over sky, no bar) ─┐
   ◐ 19:40       │  [24 h clock dial]  [level's meter: VOLTMETER in Ch1]       │        ☰ (small, top-right corner)
                 └────────────────────────────────────────────────────────────┘
   work-order pin (top-left): "WO-01 First Light ▸" folded docket, click = reopen brief + goal checklist (1/3 ✓)

                              ·· full-bleed diorama ··    paper TAGs hang off clicked objects

   ┌ RADIO (bottom-left, ink, mono) ─────────┐                         ┌ KIT TRAY (bottom-centre) ──────────────┐   ┌ BREAKER ┐
   │ 18:02 TOBI › Hut's on the beach. Pick… │                         │ [hut] [reel 2.5][reel 4]…[reel 50] US$│   │  ▮ RUN  │
   └─────────────────────────────────────────┘                         └────────────────────────────────────────┘   │ ◦ 1× ◦ │
                                                                                                                       └─────────┘
```
### 1. Instrument cluster (top centre)
Analog meters drawn in `_draw()` on cream faces with a thin bezel and warm backlight glow (sodium, alpha ∝ needle activity).
- **Clock:** 24 h dial; the shift window of the level (L01: 18:00-23:00) painted as a sodium arc; hand moves with the engine clock.
- **Ch 1 meter = VOLTMETER** "worst home" 0-60 V: red zone < 43.2 V (level limit from engine `bench.limits.vMinV`), green above.
  The needle has inertia (critically damped spring, ~0.4 s) but rests exactly on the engine value (truth test).
- From L07: the **frequency dial** (existing `dial_view.gd` maths) joins the cluster. Later chapters add their meter (MVAr, kV).
- Each meter has a mono digital readout under the needle ("44.0 V"). Click a meter → Codex entry for that quantity.
### 2. Radio log (bottom-left) — replaces toasts AND the coach panel
Mono, ink background, 3 visible lines, newest at bottom, older lines fade. Format `18:02  TOBI ›  text`. Speakers: TOBI
(dispatcher, coach voice for doing), ADA (mentor, explains *why*), VANCE (budget), NIA (island student), SYS (engine
refusals, in warn colour: "Refused: cable can't cross the mangrove"). Coach steps arrive as radio lines; the current step's
line has a sodium left-tick and a "why?" link (opens ADA's line). Click the radio → full log (scroll) modal.
Static crackle sfx on new line (once audio exists).
### 3. Kit tray (bottom-centre) — replaces the Build drawer
A low ink shelf with physical items, only what the level allows:
- **Battery hut** (icon): pick it, then the beach strip highlights its legal sites (HUT_SITES_M) as glowing pegs; click/drag a peg.
- **Cable reels**, one per size, drawn as copper reels whose **core thickness is proportional to √area** (you can *see* 50 mm²
  is fat). Label `25 mm²` and price per metre underneath. Pick a reel → the cable is laid hut→hamlet (L01) or the player clicks
  ends (L02). Hover a reel: a ghost cable + a ghost voltmeter needle shows the predicted worst-home voltage (engine `q`
  preview if available; otherwise no ghost — never compute physics in GDScript).
- Right end of the tray: **budget** as a paper price tag "US$ 1 840 / 4 000".
Pad: LB/RB cycle tray items, A pick, D-pad moves along legal sites. Touch: tap item, tap site.
### 4. Tags (in-world inspector) — replaces the Inspector drawer
Click a home/hamlet, cable or hut → a **paper tag** on a string anchored to the object (it follows the camera). Contents,
paper colours, Plex Sans + Mono numbers:
- Hamlet: `V = 44.0 V` (good/bad dot vs limit), `I = 10.0 A`, lamps brightness bar (∝ V²), "10 homes · 48 W each".
- Cable: `25 mm² Cu · 300 m run`, `R loop = 0.211 Ω`, `I = 18.4 A`, `drop = 3.9 V`, `loss = 72 W (3.9 %)`, and the
  **equation with the player's numbers**: `V_home = 48 − I·R = 48 − 18.4 × 0.211 = 44.1 V`.
- Phasor mini-diagram on AC buses (existing `phasor_view.gd`) — from Ch 2.
One tag open at a time; X or click elsewhere closes it; Esc/B closes it (modal discipline is NOT used: tags are non-modal).
### 5. Breaker (bottom-right) — replaces TICK/NEXT/Paused
A big rocker/knife-switch handle labelled **RUN THE NIGHT** (level-specific verb from strings). Pull = `app.set_speed(1)`
(auto-advance); pulling again pauses. Small knob beside it: 1× / 2× / 4×. While running the handle glows sodium and the
clock's shift arc fills. Space = toggle run; `.` = single step (advanced; documented in Settings controls).
When the shift window ends the engine ends the level → shift report.
### 6. Work order (brief) and shift report (result)
- **Work order** = paper docket that slides in at level start over a dimmed world: `WORK ORDER 01 · FIRST LIGHT` (Big Shoulders),
  location line ("Saltmarsh Island, beach strip"), the 2-line story beat as a radio transcript, **Goal** (no formula),
  pass conditions as checkboxes, budget, optional *Predict* field (L03+). Button "Take the job" (sodium). After it closes, it
  folds into the top-left pin.
- **Shift report** = paper sheet: stars as three stamped lamps (lit/unlit), the metrics, the histogram (existing `hist_view.gd`
  restyled in paper ink), ADA's one-line consolidation tied to the player's numbers, buttons Retry / Next job / Copy design code.
  On failure: the sheet is titled "Incident report" with the cause in plain words + the equation with their numbers.
### 7. Title screen
The night province diorama fills the screen, slowly orbiting, towns lit. Bottom-left: **GRID** in Big Shoulders 800, 160 px,
sodium, with "keep the lights on" in Plex Sans beneath. Menu as plain text lines (no boxes), sodium focus bar on the left of
the focused line: *Take the night shift* (continue / new), Jobs (level select as a clipboard of work orders), Sandbox,
Settings, Quit. Mode choice (Learner/Engineer) happens in the first work order's footer, not on the title.
### 8. Phone / Deck
Phone (landscape): cluster shrinks to clock + one meter (top centre), radio collapses to 1 line (tap to expand), tray becomes
a horizontal scroll strip at bottom, breaker a round button bottom-right, tags open as a bottom sheet (40% height). Deck: as
desktop with 1.25× hit targets; pad glyphs on breaker (Start/Y) and tray (LB/RB).

## Chapter 1 world (The Island, 10 m tiles)
The bench map must read as **one island at dusk**, framed tight (camera fits hut + hamlet with 15% margin): sea all round,
a sand beach strip along one edge where the hut sites are, a mangrove patch between hut and hamlet (blocked tiles, dark green,
the reason the cable bends), palms, the hamlet's 10 huts with one visible bulb each (brightness ∝ V²). No river, no
generic forest slab. Poles every 40 m along the cable (auto). L02 adds the second hamlet on the far side; L03 the school +
health centre on the hill.

## Acceptance for chapter 1 (my review gate)
1. Side-by-side with GIGAWATT screenshots, no shared chrome, font or layout pattern is visible.
2. A first-time player completes L01 with only the radio as guidance (Sonnet novice tester), and *says* why the thin cable failed.
3. Every number on a meter or tag equals the engine value (truth tests), the equation on the tag evaluates to the shown result.
4. Layout audit clean at 1920×1080, 1280×800 (Deck), 2400×1080 (phone); pad-only and touch-only runs finish L01-L03.
5. Pixel: 30 fps floor on L01-L03.

## Cute mode (user request 2026-11-10; Settings toggle, default ON)
Charm that *carries the physics*, never decoration that hides a number:
- **Bulb faces:** each home has a round bulb with a tiny face. Happy at V ≥ limit+2 V, worried within 2 V of the limit, sad and
  dim below it, asleep (zzz) when dark. Brightness stays ∝ V² (truth test unchanged); the face is the band.
- **Villagers:** 2-4 tiny round villagers per hamlet; they wave/cheer when their homes light, shiver/hold a candle when browned out.
- **Hut mascot:** the battery hut has a little battery-cell sign whose fill = state of charge; it sweats when the cable runs > 80 % ampacity.
- **Island life:** a lighthouse blinking on the point, fireflies over the mangrove at night, a cat on a roof, small waves lapping.
- **Radio:** speaker portraits as round chibi avatars (Tobi, Ada, Vance, Nia); Nia's lines get a ✏️ doodle tick.
- **Sounds (with audio):** soft "plink" when a home lights, tiny cheer, sad trombone-free (no mockery): a gentle "aww" on brownout.
- Cute OFF = the same scene with plain bulbs and no villagers/faces (for screenshots in "serious" contexts).
Applies across all five games: each designs its own cute layer under the same rule (charm encodes state).
