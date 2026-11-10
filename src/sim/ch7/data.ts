// Chapter 7 scenario constants: the typed view of scenarios.json (also read by tools/oracles/ch7_oracles.py, so the engine and its oracle share DATA, never algorithms).
import raw from './scenarios.json';

export interface SectionData { km: number; mm2: number; mw: number }
export interface FaultSite { id: string; section: number; at: number }
export interface RelayKind { kind: 'idmt' | 'distance'; curve?: 'SI' | 'VI' | 'EI'; tms?: number; zone?: number; delayS?: number; price: number }
export interface PlantData { area: 'G' | 'S'; a: number; b: number; c: number; pMin: number; pMax: number; rampMWperMin: number; startH: number; startCost: number }
export interface EdUnitData { a: number; b: number; c: number; pMin: number; pMax: number }

export interface Scenarios {
  money: Record<string, number>;
  l23: { baseMVA: number; kv: number; gridSscMVA: number; xfmr: { mva: number; ukPct: number[]; extraPrice: number[] }; gen: { mva: number; xdd: number; count: number }; couplerTieX: number; reactorX: number[]; reactorPrice: number[];
    breakers: { ratingsKA: number[]; price: number[]; count: number }; estate: { mva: number; pf: number }; outageH: number; voll: number; predictTolPct: number };
  l24: { baseMVA: number; kv: number; sscMVA: number; zPerKmOhm: [number, number]; sections: SectionData[]; ctA: number[]; loadA: number[]; faults: FaultSite[]; ctiS: number; pickupLoadFactor: number; kAlu: number; repairH: number; voll: number;
    pickupPct: Record<string, number>; tmsRange: [number, number]; relayPrice: number };
  l25: { f0: number; H: number; Pm: number; PmaxPre: number; PmaxDuring: number; PmaxPost: number; recloseDeadS: number; tEndS: number; marginStarMs: number; faultKA: number; ctA: number; faultAtPctOfLine: number;
    relays: Record<string, RelayKind>; breakerCycles: number[]; breakerPrice: Record<string, number>; reclosePrice: number };
  l26: { dtH: number; blocks: number; demandHourlyMW: number[]; solarHourlyMW: number[]; gDemandMW: number; corridorMW: number; corridorOpFrac: number; hydro: { pMaxMW: number; energyMWh: number }; voll: number;
    plants: Record<string, PlantData>; windows: Record<string, [number, number][]>; optCost: number | null };
  l27: { board: { extraGen: number; extraXfmr: number }; ed: { units: EdUnitData[]; demandMW: number; demandNoLimitsMW: number; tonightH: number };
    textbook: { ps17: { genX: number; xfmrX: number; lineXOhm: number; kv: number; baseMVA: number }; ps18: { genX2: number; genX0: number; lineX0Ohm: number }; ps24: { Pm: number; Pmax: number; H: number; f0: number };
      ps22: { units: { a: number; b: number; c: number }[]; B: number[][]; demandMW: number } };
    breakerPrice: number[]; breakerRatingsKA: number[]; predictTolPct: number };
}

export const SC = raw as unknown as Scenarios;

/** Pack currency per US$ of a region (the packs share this chapter's game prices; a pack scales them like it scales its currency). */
export const moneyFactor = (region: string): number => SC.money[region] ?? 1;
export const r1 = (x: number): number => Math.round(x * 10) / 10;
export const r2 = (x: number): number => Math.round(x * 100) / 100;
export const r3 = (x: number): number => Math.round(x * 1000) / 1000;
export const hhmm = (h: number): string => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
