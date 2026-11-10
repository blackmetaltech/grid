// DESIGN Appendix A.3 (orig 4.1) fuel prices, `in` pack: INR per GJ, designer game constants for 2026 (economy.fuelPerGJ). Nuclear fuel is not entered (economy.nuclearPerMWhe is null).
import type { FuelRow } from '../../data';

const f = (id: string, price: number, note: string): FuelRow => ({ id, unit: 'GJ', price, source: `DESIGN Appendix A.3 orig 4.1 (designer game constant): ${note}`, confidence: 'game' });
export const FUELS: FuelRow[] = [f('coal', 220, 'coal 220 INR/GJ'), f('gas', 800, 'LNG 800 INR/GJ (about 10 US$/MMBtu)'), f('diesel', 2500, '90 INR/L / 36 MJ/L'), f('biomass', 1300, 'biomass 1,300 INR/GJ')];
