// DRAFT region pack: India. Not shipping in v0.1 (status 'draft': not offered to players), kept and tested so the region
// seam stays honest. Everything Indian lives here: rupees with lakh/crore grouping, local names, local prices.
import { defineRegion } from '@core/regions';
import { validateTankData, type TankRegionData } from '../data';

export const IN = defineRegion<TankRegionData>({
  id: 'in', name: 'India (draft)', status: 'draft', rulesetVersion: 1,
  currency: { code: 'INR', symbol: '₹', decimals: 2, position: 'prefix' },
  numbers: { grouping: 'indian', decimal: '.', group: ',' },
  standards: { fluids: 'IS 14615' },
  data: { g: 9.80665, supplyPricePerM3: 30 },
  strings: { site: 'Yamuna Test Rig', operator: 'Ravi' },
  leakMarkers: ['₹', 'lakh'],
}, validateTankData);
