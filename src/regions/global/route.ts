// Overhead-line route rules and prices of the `global` pack (L05 "The River Line"; DEPTH §3, §4.2-4.3). Rules are the Lumen code, `game`, modelled on
// EN 50341 clearance practice (the standard text was not opened, so none of it is tagged `standard`); prices are `game` US$ (DEPTH §4.3 table).
import type { RouteData } from '../data';

export const ROUTE: RouteData = {
  rules: {
    everydayFrac: 0.2, everydayC: 15, designC: 75,
    groundClearance: [{ uptoKv: 1, m: 5.5 }, { uptoKv: 11, m: 6.0 }, { uptoKv: 33, m: 6.5 }],
    waterClearanceM: 8.0, roadExtraM: 1.0, insulatorDropM: 0,
    noSupport: ['river', 'sea'], noOverhead: ['town'],
  },
  prices: {
    support: { 'wood-9': 600, 'pcc-11': 1100, 'tubular-13': 3500, 'lattice-33': 18000, 'crossing-h': 12000 },
    angleMultiplier: { suspension: 1.0, small: 1.4, medium: 1.8, large: 2.4, terminal: 2.4 },
    foundationShare: 0.4, foundationMultiplier: { earth: 1.0, pile: 2.5, rock: 1.8 },
    conductorPerM: { weasel: 0.9, rabbit: 1.4, dog: 2.6 },
    phaseWires: { lv: 4, mv: 3 },
    clearingPerM: 8,
    insulator: { pin: 25, disc2: 70, fog1: 95 },   // US$ per phase per support (L29; src/data/insulators.ts)
  },
};
export const ROUTE_PROVENANCE = {
  'route.rules': { source: 'Lumen grid code route rules modelled on EN 50341 (ground 5.5 / 6.0 / 6.5 m at <= 1 / 11 / 33 kV, water 8 m above high water, +1 m over roads, 20 % UTS at 15 C, design 75 C); no standard text opened (DEPTH §4.2)', confidence: 'game' as const },
  'route.prices': { source: 'game prices in US$ (DEPTH §4.3: wood 600, PCC 1,100, tubular 3,500, lattice 18,000, H-frame crossing 12,000; angle classes x1.0/1.4/1.8/2.4; foundation 40 % x earth 1.0, pile 2.5, rock 1.8; wire per metre; clearing 8 US$/m)', confidence: 'game' as const },
};
