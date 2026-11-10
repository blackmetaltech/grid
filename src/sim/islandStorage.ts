// A storage-fed electrical island (L30 "Bring the Island Home"). The load flow already knows how to hold an island with a grid-forming unit ('bess-gfm'), but the game's
// storage always entered it as a grid-following inverter, so an island cut off from every generator went dark even with a battery on it. The smallest honest model: in a block, an
// island that has no synchronous source and does have storage is energised by that storage (the battery's inverter forms the voltage) when
//   - the inverter can carry the island's load: P_load x ISLAND_LOSS_ALLOWANCE <= the inverter's rated kW, and
//   - the cells can deliver it for the block: P x dt / eta_one_way <= (SoC - SoC_min) x E (the 10-90 % window of dispatch/storage.ts, eta = sqrt(round trip)).
// Otherwise the island stays dark and its loads are not served (energy not served). The energy then drains by the power the load flow realised, P x dt / eta, in `settleIslandStorage`.
// Everything is deterministic: no randomness, ties by id.
import { S_BASE_MVA, findIslands, type Net } from './network';
import { oneWayEfficiency, storageStep, type StorageParams } from './dispatch/storage';
import type { Storage } from '../types';
import { fin } from './finite';

export const SOC_MIN = 0.1, SOC_MAX = 0.9;
/** The island's load plus its own transformer and cable losses must fit the inverter: a 5 % allowance on the load. */
export const ISLAND_LOSS_ALLOWANCE = 1.05;
const DT_H = 0.25;

export const storageParamsOf = (b: Pick<Storage, 'mwh' | 'mw' | 'etaRt'>): StorageParams => ({ energyMWh: b.mwh, pChMaxMW: b.mw, pDisMaxMW: b.mw, etaRt: b.etaRt, socMin: SOC_MIN, socMax: SOC_MAX });

/** Power the cells of a battery at `soc` can deliver for one block (MW): the inverter limit, trimmed by what the window holds. */
export function dischargeCapabilityMW(b: Pick<Storage, 'mwh' | 'mw' | 'etaRt'>, soc: number): number {
  return storageStep(storageParamsOf(b), soc, 0, b.mw, DT_H).pDisMW;
}

/** Ids of the storage units that hold their island this block (see the file header), and the load they carry (MW). `net` carries the storage as grid-following inverters; nothing is mutated. */
export function holdIslands(net: Net, storage: readonly Storage[]): { forming: Set<string>; loadMW: number } {
  const out = new Set<string>();
  let held = 0;
  if (storage.length === 0) return { forming: out, loadMW: 0 };
  for (const isl of findIslands(net)) {
    if (isl.slackUnit !== null) continue;
    const set = new Set(isl.buses);
    const mine = storage.filter((b) => b.mw > 0 && set.has(b.bus)).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    if (mine.length === 0) continue;
    const loadMW = net.loads.filter((l) => set.has(l.bus)).reduce((a, l) => a + l.p * S_BASE_MVA, 0);
    if (!(loadMW > 0)) continue;
    const capMW = mine.reduce((a, b) => a + dischargeCapabilityMW(b, b.soc), 0);
    if (loadMW * ISLAND_LOSS_ALLOWANCE <= capMW + 1e-12) { for (const b of mine) out.add(b.id); held += loadMW; }
  }
  return { forming: out, loadMW: held };
}
/** Reads a net `toNet` has already built: the storage units that hold an island (grid-forming), the load of the islands they hold (MW), and the storage stranded in an island with no source
 *  at all (it cannot charge from a grid that is not there: the dispatch leaves it idle, or the energy would appear from nothing and hold the island the next block). */
export function heldByStorage(net: Net, storage: readonly Storage[]): { forming: Set<string>; orphans: Set<string>; loadMW: number } {
  const forming = new Set(net.units.filter((u) => u.kind === 'bess-gfm' && u.online).map((u) => u.id)), orphans = new Set<string>();
  let loadMW = 0;
  if (storage.length > 0) for (const isl of findIslands(net)) {
    const set = new Set(isl.buses);
    if (isl.slackUnit === null) { for (const b of storage) if (set.has(b.bus)) orphans.add(b.id); continue; }
    if (!forming.has(isl.slackUnit)) continue;
    loadMW += net.loads.filter((l) => set.has(l.bus)).reduce((a, l) => a + l.p * S_BASE_MVA, 0);
  }
  return { forming, orphans, loadMW };
}
export const formingStorage = (net: Net, storage: readonly Storage[]): Set<string> => holdIslands(net, storage).forming;

/** After the load flow: a storage that was an island's slack discharged what the island drew (`slackP`, MW); drain it from the cells (P x dt / eta). Returns the cell energy drawn this block, kWh. */
export function settleIslandStorage(b: Storage, slackP: number): number {
  const before = b.soc;
  const st = storageStep(storageParamsOf(b), b.soc, 0, Math.max(0, slackP), DT_H);
  b.soc = fin(st.soc, b.soc); b.P = fin(st.pDisMW);
  return (before - b.soc) * b.mwh * 1000;
}

/** Usable charge left in a battery as a share of its window: (SoC - 10 %) / (90 % - 10 %). */
export const windowShare = (soc: number): number => Math.max(0, Math.min(1, (soc - SOC_MIN) / (SOC_MAX - SOC_MIN)));
export { oneWayEfficiency };

/** True for a bus placed beyond the terrain's edge (an offshore island: the world query marks it so the UI draws it past the sea). Free play (no map) has none. */
export const offshoreBus = (s: { map: { w: number; h: number } }, b: { x: number; y: number }): boolean => s.map.w > 0 && s.map.h > 0 && (b.x >= s.map.w || b.y >= s.map.h);
