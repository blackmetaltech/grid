// Overhead-line route rules and prices of the draft `in` pack. Rules: CEA (Measures relating to Safety and Electric Supply) Regulations 2010 reg. 58,
// recalled in DEPTH §4.2 (LV and 11 kV: 5.8 m across a street, 5.5 m along it, 4.6 m elsewhere; 33 kV 5.2 m), so the ground rule is the 'elsewhere' value
// and the road extra is 5.8 - 4.6. Water clearance: no CEA figure was recalled, the global value is kept. `recall`: verify against the gazette before `in` ships.
// Prices: the `global` prices x 8, the factor of the nearest like-for-like item already in this pack (the cable pole, 150 US$ -> 1,200 INR).
import type { RouteData } from '../data';
import { ROUTE as G } from '../global/route';

const K = 8;
const scale = (t: Record<string, number>): Record<string, number> => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v * K]));
export const ROUTE: RouteData = {
  rules: {
    ...G.rules,
    groundClearance: [{ uptoKv: 1, m: 4.6 }, { uptoKv: 11, m: 4.6 }, { uptoKv: 33, m: 5.2 }],
    roadExtraM: 1.2,
  },
  prices: { ...G.prices, support: scale(G.prices.support), conductorPerM: scale(G.prices.conductorPerM), clearingPerM: G.prices.clearingPerM * K, insulator: scale(G.prices.insulator ?? {}) },
};
export const ROUTE_PROVENANCE = {
  'route.rules': { source: 'CEA Safety and Electric Supply Regulations 2010 reg. 58 as recalled in DEPTH §4.2 (4.6 m elsewhere, +1.2 m across a street, 5.2 m at 33 kV); water clearance and stringing rule kept from the game default', confidence: 'recall' as const },
  'route.prices': { source: 'game: the global route prices x 8 (the cable-pole price ratio of this pack, 150 US$ -> 1,200 INR)', confidence: 'game' as const },
};
