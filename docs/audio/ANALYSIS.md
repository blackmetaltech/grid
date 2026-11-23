# GRID audio analysis

Measured by `tools/audio/measure.py` (levels, DC, band balance, wrap, loop period) and `tools/audio/analyse_audio.py` (music structure,
one-shot similarity) from the WAVs `godot/audio/render_samples.gd` renders. **These are numbers, not a listening pass. No human has
listened to any of this.** `render_samples.gd` also asserts, for every cue: deterministic, peak under -1 dBFS after its play trim, no DC (under
0.002), starts and ends under 0.01 (no click at the wrap or on retrigger), length within its cap; and that a dark town coming on is one chord.

## Found in 1.17 and fixed in 1.18

Every one-shot is rendered at a sample peak of -6.2 dBFS and trimmed at play time (`KIND_DB`). RMS plus trim is the level a listener gets.

| What | Before | After | Why |
|---|---|---|---|
| radio | -34 dBFS RMS played (trim -8) | -29 (trim -3) | a 2-3 kHz crackle at -34 under a hum at -19 is not heard |
| cheer | -33.5 | -28.5 | same |
| tick (DC bench) | -38.6 | -34.6 | soft on purpose, but inaudible |
| breaker_close | -28.4 | -22.2 (trim +1) | the key click of the game was among the quietest cues |
| coin, page, place, speed, relay_tick, stamp | -28 to -31 | -26 to -28 | brought to one band |
| hum default trim | -6 (about -19 RMS at load 0.6, 5 dB over the music) | -12 (about -25) | the constant hum was louder than the tracks and every event |
| breaker_close energy under 60 Hz | 88 % (centroid 220 Hz) | 0 % under 60, 91 % at 60-250 (centroid 240) | thump started at 95 Hz falling to 45: nothing a laptop plays. Now 140 to 75 Hz, saturated (tanh) so 3x and 5x harmonics carry |
| breaker_open under 60 Hz | 9 % | 1 % | 110 to 60 Hz, saturated |
| trip under 60 Hz | 69 % | 20 % (56 % at 60-250) | thump 120 to 55 Hz |
| DC offset of cues | up to +0.0019 | 0.0000 | mean removed, last 4 ms fade |
| outdoor bed | wind 61 % under 60 Hz (a rumble), centroid 69 Hz; crickets about -40 dBFS | wind 40 Hz to 700 Hz, centroid 388 Hz, DC 0; crickets 3x louder; bed player -6 dB | the wind was a subsonic rumble and the crickets could not be heard |

Outdoor bed now: day -22.6 dBFS RMS, peak -8.1; night -29.8, peak -12.9 (before: -21.9 / -29.7 with the bed player 4 dB lower). Played, the day bed is about -28.6 and
the night bed about -35.8: under the hum and the music, as a bed should be.

Not changed: music is non-looping (four tracks in turn, each fades in and out), so there is no loop point; the hum is a generator stream, not a loop
(its autocorrelation peak at 0.50 s is just the 100 Hz tone). The wrap column below is a jump at the file ends in typical sample steps, so on near-silent
tails it reads large (stamp 25.5) while the absolute end sample is under 0.01 (tested).

## Today's levels (final render, `tools/audio/measure.py`)

RMS and sample peak in dBFS of the file; "played RMS" adds the `KIND_DB` trim. Bands are % of energy: under 60 Hz, 60-250, 250-2k, 2k-8k, over 8k.

| File | Length s | RMS | Peak | Played RMS | Centroid Hz | Bands % | DC |
|---|---|---|---|---|---|---|---|
| sfx_aww | 0.66 | -16.3 | -6.2 | -23.3 | 572 | 0/0/100/0/0 | +0.0000 |
| sfx_blackout | 1.40 | -20.7 | -6.2 | -23.7 | 66 | 49/51/0/0/0 | +0.0000 |
| sfx_breaker_close | 0.42 | -23.2 | -6.2 | -22.2 | 240 | 0/91/7/1/0 | +0.0000 |
| sfx_breaker_open | 0.62 | -20.2 | -6.2 | -25.2 | 388 | 1/9/90/0/0 | +0.0000 |
| sfx_cheer | 0.72 | -22.5 | -6.2 | -28.5 | 832 | 0/0/94/6/0 | -0.0000 |
| sfx_coin | 0.50 | -20.0 | -6.2 | -26.0 | 2869 | 0/0/22/78/0 | -0.0000 |
| sfx_page | 0.42 | -20.5 | -6.2 | -27.5 | 4315 | 0/0/9/83/7 | -0.0000 |
| sfx_place | 0.22 | -22.8 | -6.2 | -25.8 | 186 | 1/95/4/0/0 | +0.0000 |
| sfx_plink0 | 0.50 | -19.1 | -6.2 | -26.1 | 539 | 0/0/100/0/0 | -0.0000 |
| sfx_plink9 | 0.50 | -19.2 | -6.2 | -26.2 | 1814 | 0/0/97/3/0 | +0.0000 |
| sfx_quarter | 0.70 | -18.2 | -6.2 | -26.2 | 489 | 0/0/100/0/0 | +0.0000 |
| sfx_radio | 0.55 | -26.0 | -6.2 | -29.0 | 2981 | 0/0/29/68/3 | -0.0000 |
| sfx_reel | 0.50 | -17.0 | -6.2 | -26.0 | 2227 | 0/0/32/68/0 | +0.0000 |
| sfx_relay_tick | 0.06 | -22.0 | -6.2 | -28.0 | 730 | 0/0/100/0/0 | +0.0000 |
| sfx_speed | 0.12 | -21.0 | -6.2 | -28.0 | 1251 | 0/0/100/0/0 | -0.0000 |
| sfx_spend | 0.55 | -17.7 | -6.2 | -26.7 | 2143 | 0/0/0/100/0 | +0.0000 |
| sfx_stamp | 0.30 | -23.0 | -6.2 | -25.0 | 74 | 2/98/0/0/0 | +0.0000 |
| sfx_tick | 0.05 | -24.6 | -6.2 | -34.6 | 1429 | 0/0/99/1/0 | +0.0000 |
| sfx_town_on0 | 1.30 | -18.7 | -6.2 | -26.7 | 377 | 0/0/100/0/0 | -0.0000 |
| sfx_town_on1 | 1.50 | -21.2 | -6.2 | -29.2 | 413 | 0/0/100/0/0 | +0.0000 |
| sfx_town_on2 | 1.80 | -20.5 | -6.2 | -28.5 | 452 | 0/2/98/0/0 | +0.0000 |
| sfx_trip | 0.75 | -20.5 | -6.2 | -25.5 | 137 | 20/56/24/0/0 | +0.0000 |
| outdoor_day | 20.00 | -22.6 | -8.1 | -28.6 | 388 | 6/42/51/1/0 | +0.0000 |
| outdoor_night | 20.00 | -29.8 | -12.9 | -35.8 | 921 | 5/36/45/14/0 | +0.0000 |
| room_tone_dc | 6.00 | -28.8 | -17.2 |  | 204 | 27/46/27/0/0 | -0.0005 |
| hum_49Hz | 10.00 | -13.2 | -8.1 | -25.2 | 133 | 0/92/8/0/0 | -0.0000 |
| hum_50Hz | 10.00 | -13.2 | -8.1 | -25.2 | 135 | 0/92/8/0/0 | -0.0000 |
| hum_dip_50_49_50 | 10.00 | -17.1 | -12.7 | -29.1 | 118 | 0/96/4/0/0 | -0.0000 |
| hum_fullload | 4.00 | -9.1 | -3.5 | -21.1 | 154 | 0/87/13/0/0 | +0.0000 |
| hum_lowload | 4.00 | -22.7 | -19.2 | -34.7 | 108 | 0/99/1/0/0 | +0.0000 |

Reading it: events play near -22 (breaker_close, trip, blackout, breaker_open, town_on0 about -27), interface sounds -25 to -29, the DC tick -35. The
cheapest thing a listener will notice first is `reel` (-26 at 2.2 kHz centroid, 68 % over 2 kHz): bright and constant. Highs are not harsh anywhere (over 8 kHz is
at most 7 %, `page`). The room tone and hum are pure sums of harmonics at 100, 200, 300 Hz: no noise or variation beyond a 3 % tremolo, so the hum will tire
on a long shift. Music sits at -17 to -20 dBFS RMS in the full mix, centroid 180 to 710 Hz and nothing over 2 kHz to speak of (0 to 5 %): warm, and muddy on
a laptop speaker. A listening pass should check that first.

## Key moments (1.18)

| Moment | Cue | Triggered by | What you hear (designed, not heard) |
|---|---|---|---|
| Breaker closes | `breaker_close` | the player closing a breaker (tray, breaker button, grid chrome); also a line returning to service while the clock runs and the player did not just act | a heavy clunk (140 to 75 Hz, saturated), a metal click, a small latch clack 85 ms later |
| A town lights up | `town_on0..2` (then `plink` per extra home) | a town with no lit home at the last refresh that now has some (`GridSound.plan_lights`); size by homes: under 6 small, 6 to 11 medium, 12 and up large | a warm chord (C-G; C-E-G-C; C2 root plus C-E-G-B-D) that swells in over 0.4 s note by note, 1.3 to 1.8 s. Homes joining a town already lit still plink (at most 8) |
| A trip | `trip` | lines in service fell, or units online fell, while the clock runs and not within 0.7 s of the player's own switch, place or remove | relay chatter, breaker thud, a falling whine |
| A blackout | `blackout`, then the radio | `blackout` turned on in the model | hum fades out in 0.5 s, music stops over 1.2 s, the outdoor bed is cut; the cue spins down in 0.55 s, a low thud, a quiet tail; the radio line waits until 1.8 s after the blackout began (silence in between). When power returns the hum fades back in over 2 s and the music restarts; the towns coming on play their chords |

Reminder, as above: no human has listened to any of this.


## Music

Bars are labelled by their chroma: a bar that sounds like an earlier bar (cosine >= 0.93) reuses its letter.

| Track | Length | BPM | Bars | Distinct bar sounds | Repeated bars | Section map (one letter per bar) |
|---|---|---|---|---|---|---|
| night_shift | 194 s | 70 | 56 | 24 | 57 % | `ABCDABEDAFGHIFJKLMADLMNEOPQROPSRTUVWTUVBLMIKLMJXABCDABED` |
| load_follow | 185 s | 84 | 64 | 14 | 78 % | `ABABCDBBEFGFEHFDIJIJKLJBMLKLMJLDCCMNAABBKKMMIIJBAHAHCDHBNDCDNBDD` |
| low_frequency | 168 s | 58 | 40 | 19 | 52 % | `AABCDEFGHHBBDIJKLLMNOPHAADBQJRFSLLMNOPLA` |
| morning_ramp | 156 s | 100 | 65 | 15 | 77 % | `ABCAABCDEFGEEFGDCCAAFFDDAFCAAFCHIJKLIJMNGGEEFFJJEFGEEFGDABCAABCDO` |

### Tracks under 2 minutes

None.

### Do any two tracks share a structure?

Structure: the section maps relabelled by first appearance, compared by edit distance per bar. Harmony: the mean best-match cosine
of one track's bar chroma against the other's (transposition-invariant: best over the 12 rotations).

| Pair | Structure distance (0 = same form) | Harmony similarity (1 = same chords) | Verdict |
|---|---|---|---|
| night_shift / load_follow | 0.69 | 0.87 | distinct |
| night_shift / low_frequency | 0.71 | 0.91 | distinct |
| night_shift / morning_ramp | 0.74 | 0.90 | distinct |
| load_follow / low_frequency | 0.69 | 0.91 | distinct |
| load_follow / morning_ramp | 0.80 | 0.90 | distinct |
| low_frequency / morning_ramp | 0.74 | 0.89 | distinct |

Flagged pairs: none.

## One-shots: are any two too alike?

Fingerprint: 24 log-band energies, length and attack. Pairs closer than 2.0 are listed.

None.

Music loudness spread (full mixes): -21.2 to -19.2 LUFS (2.0 LU).

Spectrograms are in `spec/`, compressed copies in `ogg/`.
