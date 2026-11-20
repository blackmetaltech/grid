# GRID 1.3: long-term play (district charters and the weekly district)

CRITIQUE-1.0 scored long-term play 3/10. Once the campaign and one Career are done, nothing new is left to try, because every Career district is
the same district with different dice.

## Options weighed

| option | depth | effort | verdict |
|---|---|---|---|
| more seeds | none: seeds change only the dice | none | already there |
| regions with their own networks (new topologies) | high | high: new district builder, new targets, new art | later |
| **district charters**: named modifiers that change *which problem dominates* | high: each one rewards a different strategy | low: about six multipliers on numbers the engine already has | **build** |
| **weekly district**: one seed and charter per ISO week, the same for everyone, with a local best | medium: a reason to come back, comparable codes | low on top of charters | **build** |
| daily district | as weekly, but a 10-year career a day is too much | low | no |

Charters give the most depth per line of code. They need no new physics: each one pushes an existing pressure (storms, growth, ageing,
sun, money, trees) far enough that the planner which wins in Home Counties loses there until the player changes strategy. Targets are still set
from the district's own expected performance, so every charter is winnable. The persona sweep checks that for each charter.

## Charters (engine `CHARTERS`, data in src/career/data.ts)

| id | name | what changes | strategy it rewards |
|---|---|---|---|
| standard | Home Counties | nothing | balanced (the 1.2 game) |
| storm | Storm Coast | storms x1.7; allowance +8 % (resilience funding) | reclosers, ties, tree cutting, automation |
| boom | Boomtown | connections x2.2, base growth x1.6, EV x1.5, +2 m start cash | capacity: reconductor, new feeders, batteries, saying no |
| iron | Old Iron | every asset 10 years older; allowance +6 % | inspections, replacement order, running to failure where safe |
| sun | Solar Valley | rooftop PV x2.5, heatwaves x2.5 | voltage: regulators, batteries, reverse power |
| lean | Lean Years | opex allowance -12 %, start cash 1 m | payback discipline, cheap fixes first, no debt |
| forest | Forest Line | vegetation starts +0.25, storms x1.25 | the vegetation budget and storm hardening |

How they apply:
- Build time: ages, growth, EV and PV bias, vegetation, start cash and allowance.
- Per quarter: the storm, heatwave and connection rates, read from the career's `charter`.
- The expected SAIDI includes the storm multiplier, so targets and resets follow the charter.

## Weekly district

- `weeklyDistrict(year, isoWeek)` gives a seed and a charter, both pure functions of the week, so everyone gets the same district that week.
- The Godot front end works out the week from the system clock.
- The best score for the week is kept locally in the user profile.
- The career code becomes `C2/<seed>/<charter>/<actions>`. Old `C1/` codes still load as Home Counties.

## UI

- The Career start sheet offers three ways in: a free career (random seed, Home Counties), a chosen charter, and this week's district (with its best so far).
- The charter's name and one-line pressure appear on the career bar and the ending sheet.

## Tests

- The planner beats the firefighter on most seeds of every charter, and Home Counties keeps the 45/50 floor.
- C1 codes decode as standard; C2 codes round-trip.
- The weekly district is deterministic and spreads over the charters.
- Each charter's modifier shows in its built district (e.g. Old Iron's mean age is +10).
