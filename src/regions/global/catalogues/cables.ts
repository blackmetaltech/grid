// DESIGN §4.2 copper cable prices, global pack (US$): per metre per mm2 of conductor per core, plus sheath and poles. Game (proportional to copper mass, about 10 US$/kg).
import type { CableRow } from '../../data';

export const CABLES: CableRow[] = [
  { id: 'cu-cable', perMm2PerM: 0.10, sheathPerM: 1.0, polePrice: 150, poleSpacingM: 40, source: 'game: price proportional to copper mass (about 10 US$/kg); 0.10 US$/m per mm2 per core + 1.0 US$/m sheath + 150 US$ pole every 40 m', confidence: 'game', note: 'game' },
];
