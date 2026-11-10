// DESIGN Appendix A.3 (orig 4.2) copper cable prices, `in` pack (INR): game, proportional to copper mass.
import type { CableRow } from '../../data';

export const CABLES: CableRow[] = [
  { id: 'cu-cable', perMm2PerM: 0.9, sheathPerM: 25, polePrice: 1200, poleSpacingM: 40, source: 'DESIGN Appendix A.3 orig 4.2: game, 0.9 INR/m per mm2 + 25 INR/m sheath + 1,200 INR pole every 40 m', confidence: 'game' },
];
