// L29 "Salt Wind" insulator kit (DEPTH §4.4, §8b). Physical data (creepage, string drop below the attachment point) and the base US$ price per phase
// per support. The IEC 60815 pollution classes (specific creepage 16 / 20 / 25 / 31 mm/kV) and IEC 60038 Um are `standard` (src/sim/route/insulation.ts);
// the unit creepages and prices below are catalogue-typical values from memory, to verify against a manufacturer datasheet before ship.
import type { Confidence } from './types';

export interface InsulatorRow {
  id: string;
  /** Creepage distance of the whole string, mm. */
  creepageMm: number;
  /** How far the conductor hangs below the support's attachment height because of the string, m (0 for a pin insulator on top of the crossarm). */
  dropM: number;
  /** Base price (US$) per phase per support (the pack scales it like its other prices). */
  priceUsd: number;
  source: string;
  confidence: Confidence;
}
const row = (id: string, creepageMm: number, dropM: number, priceUsd: number, source: string, confidence: Confidence = 'recall'): InsulatorRow => ({ id, creepageMm, dropM, priceUsd, source, confidence });

export const INSULATORS: InsulatorRow[] = [
  // 11 kV porcelain pin insulator: typical creepage 320 mm (DEPTH §4.4, recall); $25 is a game price
  row('pin', 320, 0, 25, '11 kV pin insulator, 320 mm creepage (recall, DEPTH §4.4); US$25 per phase per support (game)'),
  // two standard 255 x 146 mm cap-and-pin discs in series: 2 x 295 mm = 590 mm; the string hangs 0.30 m below the crossarm (2 x 0.15 m, recall)
  row('disc2', 2 * 295, 0.3, 70, 'two standard 255x146 mm discs, 295 mm each (recall, DEPTH §4.4); string drop 0.30 m; US$70 per phase per support (game)'),
  // one anti-fog (deep-skirt) disc: 430 mm creepage; drop 0.15 m (recall)
  row('fog1', 430, 0.15, 95, 'one anti-fog disc 255x146 mm, 430 mm creepage (recall, DEPTH §4.4); string drop 0.15 m; US$95 per phase per support (game)'),
];
export const INSULATOR_IDS = INSULATORS.map((i) => i.id);
export const DEFAULT_INSULATOR = 'pin';
