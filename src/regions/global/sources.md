# `global` pack: data sources and verification (M1.9, 2026-11-10)

Rule: no `recall` row or provenance entry in `global` (and none in the shared `src/data` rows). A value is `standard`/`report`/`secondary` only if a
source was opened and the number read; otherwise it is `game` with an honest note. `src/data/data.test.ts` and `regions.test.ts` enforce the gate.

## Verified (opened and read in M1.9)

| Value | Source | Result |
|---|---|---|
| Standard frequency range +-50 mHz, max instantaneous 800 mHz, max steady state 200 mHz (CE) | SOGL (EU) 2017/1485 Annex III Table 1, text via https://gesetze.legal/eu/vo_eu_2017_1485/anhang_iii | `standard`, matches |
| FCR: combined insensitivity + deadband 10 mHz (CE); full activation 30 s at +-200 mHz | SOGL Annex V, https://gesetze.legal/eu/vo_eu_2017_1485/anhang_v | `standard`, matches |
| UFLS: start 49.0 Hz with 5 %, end 48.0 Hz with 45 % (+-7), >= 6 steps, <= 10 % per step (CE) | NC ER (EU) 2017/2196 Annex, https://gesetze.legal/eu/vo_eu_2017_2196/anhang | `standard`, matches (game stages 8 % each are inside the rules) |
| Generator frequency ranges: 47.5-48.5 Hz >= 30 min; 49.0-51.0 Hz unlimited; 51.0-51.5 Hz 30 min (CE) | NC RfG (EU) 2016/631 Art. 13(1)(a) Table 2, https://gesetze.legal/eu/vo_eu_2016_631/13 | `standard`; 47.5 / 51.5 Hz are the outer limits of required operation. Trip delays stay `game` |
| Droop 2-12 % | NC RfG Art. 13(2)(d) (LFSM-O) and Art. 15(2)(c)(i) (LFSM-U) | `standard`. CORRECTION: the old reference "Art. 15(2)(d)" was wrong |
| Imbalance settlement 15 min | EB GL (EU) 2017/2195 Art. 53(1), https://gesetze.legal/eu/vo_eu_2017_2195/53 | `standard` (exemptions possible under 53(2)) |
| Distribution transformer losses (100/160/250/400/630 kVA) | Reg. (EU) 548/2014 Annex I Table I.1 Tier 1 maxima, https://gesetze.legal/eu/vo_eu_2014_548/anhang_i | `standard`: 145/1750, 210/2350, 300/3250, 430/4600, 600/6500 W (replaces DESIGN's 0.2/1.8 kW S^0.75 scaling) |
| EIA capex and heat rates: USC 4,507 / 8,638; CCGT 1,330 / 6,431; aero CT 1,428 / 9,124; LWR 7,406 / 10,447; biomass 4,996 / 13,500; hydro 3,421; wind 2,098; PV 1,448; battery 1,270 | EIA AEO2023 Table 1, https://www.eia.gov/outlooks/aeo/assumptions/pdf/elec_cost_perf.pdf | `report`, all 10 spot-checked against the opened PDF |
| Fuel cost cross-check (2025): coal 2.42, petroleum 14.12, natural gas 3.85 US$/MMBtu | EIA Electric Power Annual Table 7.4, https://www.eia.gov/electricity/annual/html/epa_07_04.html | pack prices stay `game` (coal 2.6, gas 4, diesel 25 US$/GJ) with the EIA figures in the note |
| Inertia H (thermal 4-5 s at 1,000 MW, CC 4.3, gas 5, hydro 2-4.3) | arXiv:2004.02951 Table 1 | `secondary`: coal 3.5, coal-SC 4.0, CCGT 5.0, hydro 3.0, small hydro 2.5, nuclear 4.0. OCGT 3.0 and biomass 2.5 are `game` (the table lists 5 and 4) |
| EN 50160 LV +-10 % for 95 % of 10-min means | utility/manufacturer summaries (standard text not opened) | `secondary` |
| IEC 60255-151 IDMT constants | Protecta relay manual Table 1-1 (designer-opened) | `standard` |

## Could not be verified: relabelled `game` with a note

- IEC 60364-5-52 copper ampacity 27/36/46/63/85/112/138/168 A: no copy of the table could be opened (iTeh/IEC samples are 14-page previews). The figures match the PVC, two loaded conductors, reference method C column (Table B.52-2 in the 2005 edition; DESIGN's label "B.52-4" looks wrong). `game`.
- Breaker R10 ratings: 25-63 kA are members of the ISO 3 R10 series (arithmetic), but IEC 62271-100 could not be opened; the selection and 2/3/5-cycle times are `game`.
- Capacitor limits 1.3 x I, 1.1 x U (IEC 60871-1 Clause 20): numbers not found in an opened source. `game`.
- Over-voltage stages (110 % 5 s, 140 % 100 ms): no source. `game`.
- Distance-relay zones, fuse, IDMT setting ranges: typical practice. `game`.
- Governor constants (T_G, T_RH, F_HP, T_W) and X''d / X'd: textbook-typical (Kundur), not opened. `game`.
- Line phase spacings D (tower geometry): `game`. Power-transformer %Z, X/R, losses and tap ranges: `game`.
- BESS round-trip efficiency 0.86 (NREL ATB lists about 85 %, not opened): `game`.
- MISO MTEP24 unit costs (transformers $/MVA, compensation $/MVAr, BESS $/kW and $/kWh, lines $/mile): read by the reviewer in 2026-11-09; the MTEP24 PDF could not be re-downloaded in M1.9, so they stay `report` on the reviewer's reading and are the first thing to re-open.
- Round-trip: nothing else in `global` is `recall`.
