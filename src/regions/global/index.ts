// The default region: a neutral, fictional setting, US$, international standards. Ships in v0.1.
import { defineRegion } from '@core/regions';
import { validateTankData, type TankRegionData } from '../data';

export const GLOBAL = defineRegion<TankRegionData>({
  id: 'global', name: 'Global', status: 'shipping', rulesetVersion: 1,
  currency: { code: 'USD', symbol: '$', decimals: 2, position: 'prefix' },
  numbers: { grouping: 'western', decimal: '.', group: ',' },
  standards: { fluids: 'ISO 5167' },
  data: { g: 9.80665, supplyPricePerM3: 1.5 },
  strings: { site: 'Riverside Test Rig', operator: 'Sam' },
}, validateTankData);
