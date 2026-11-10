// Region pack + shared physics tables -> the plain views the simulation and the actions use. This is the ONLY place where pack
// catalogue rows meet src/sim: the sim gets numbers (SimParams, CatalogueView), never a pack.
import type { GridRegionData } from './regions/data';
import type { SimParams } from './sim/params';
import type { CatalogueView, GenSpec } from './sim/build';
import type { UnitKind } from './types';
import { LINE_TEMPLATES } from './data/lineTemplates';
import type { BenchParams } from './level/bench';

const UNIT_KINDS: readonly string[] = ['coal', 'gas', 'diesel', 'biomass', 'nuclear', 'hydro', 'psp', 'pv', 'wind', 'synccon'];
const num = (x: number | null | undefined): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);

/** The pack's grid code, economy, bands and latitude as plain simulation parameters. */
export function simParamsOf(d: GridRegionData): SimParams {
  const levels = d.voltage.levelsKv.flatMap((kv) => { const b = d.voltage.bandsKv[String(kv)]; return b ? [{ kv, loPu: b.minKv / kv, hiPu: b.maxKv / kv }] : []; });
  const g = d.gridcode;
  return {
    f0: d.f0, latitudeDeg: d.climate.latitudeDeg,
    gridcode: {
      deadbandHz: g.fcrDeadbandHz, ufls: g.ufls.map((u) => ({ hz: u.hz, shedPct: u.shedPct, delayS: u.delayS })),
      genUf: { hz: g.genUfTrip.hz, s: g.genUfTrip.s }, genOf: { hz: g.genOfTrip.hz, s: g.genOfTrip.s }, uvLoad: { pu: g.uvLoadTrip.pu, s: g.uvLoadTrip.s },
      standardRangeHz: [g.standardRangeHz[0], g.standardRangeHz[1]], droopRangePct: [g.droopRangePct[0], g.droopRangePct[1]],
    },
    economy: { energyPricePerMWh: d.economy.energyPricePerMWh, vollPerMWh: d.economy.vollPerMWh },
    bands: { levels, lvBandPct: d.voltage.lvBandPct, mvBandPct: { learner: d.voltage.mvBandPct.learner, engineer: d.voltage.mvBandPct.engineer } },
  };
}

/** Catalogue rows as the specs `placeUnit`, `stringLine`, ... copy onto state records. */
export function catalogueViewOf(d: GridRegionData): CatalogueView {
  const cat = d.catalogues;
  return {
    generator: (id) => {
      const r = cat.generators.find((x) => x.id === id);
      if (!r || !UNIT_KINDS.includes(r.kind)) return null;
      const kind = r.kind as UnitKind;
      const fuel = kind === 'coal' || kind === 'gas' || kind === 'diesel' || kind === 'biomass' ? d.economy.fuelPerGJ[kind] : null;
      const energyCostPerMWh = kind === 'nuclear' ? d.economy.nuclearPerMWhe : kind === 'hydro' ? 0.2 * d.economy.energyPricePerMWh : 0;
      const spec: GenSpec = {
        id: r.id, kind, capexPerKw: num(r.capexPerKw), pMinPct: num(r.pMinPct), heatRateGJperMWh: num(r.heatRateMJkWh), fuelPerGJ: fuel, energyCostPerMWh,
        rampPctMin: num(r.rampPctMin), startHotS: num(r.startHotS), hS: num(r.hS), droopPct: num(r.droopPct), co2tPerMWh: num(r.co2tPerMWh),
      };
      return spec;
    },
    line: (id) => {
      const tpl = LINE_TEMPLATES.find((x) => x.id === id);
      if (!tpl) return null;
      const cost = cat.lineCosts.find((c) => c.kv === tpl.kv);
      return { id: tpl.id, kind: 'line', kv: tpl.kv, rOhmKm: tpl.rOhmKm, xOhmKm: tpl.xOhmKm, bUsKm: tpl.bUsKm, thermalMva: tpl.thermalMva, costPerKm: cost?.costPerKm ?? 0 };
    },
    transformer: (id) => {
      const r = cat.transformers.find((x) => x.id === id);
      if (!r) return null;
      return { id: r.id, mva: r.mva, kvHv: r.kvHv, kvLv: r.kvLv, zPct: r.zPct ?? 8, xr: r.xr ?? 10, noLoadKw: r.noLoadKw ?? 0, loadKw: r.loadKw ?? 0, tapMin: -8, tapMax: 8, price: r.price ?? (r.pricePerMva ?? 0) * r.mva };
    },
    shunt: (id) => {
      const r = cat.compensation.find((x) => x.id === id);
      if (!r || r.mvar === null) return null;
      const kind = r.kind === 'reactor' || r.kind === 'svc' || r.kind === 'statcom' ? r.kind : 'cap';
      return { id: r.id, kind, mvarStep: r.mvar, maxSteps: 4, pricePerKvar: r.pricePerKvar ?? 0, autoFactor: r.autoCostFactor ?? 1 };
    },
    storage: (id) => {
      const r = cat.storage.find((x) => x.id === id);
      if (!r || r.mwh === null) return null;
      const eta = r.etaRt ?? 0.86;
      return { id: r.id, mw: r.mw, mwh: r.mwh, etaRt: eta > 1 ? eta / 100 : eta, capexPerKw: num(r.capexPerKw), capexPerKwh: num(r.capexPerKwh) };
    },
  };
}

/** The bench parts of the pack (cable prices, the 48 V / 380 V DC-DC converter) as plain numbers for the first-chapter levels. */
export function benchParamsOf(d: GridRegionData): BenchParams {
  const cab = d.catalogues.cables.find((c) => c.id === 'cu-cable');
  const conv = d.catalogues.transformers.find((c) => c.id === 'conv-dcdc-48-380');
  if (!cab || !conv || conv.price === null) throw new Error('region pack lacks the bench cable or converter row');
  return { cable: { perMm2PerM: cab.perMm2PerM, sheathPerM: cab.sheathPerM, polePrice: cab.polePrice, poleSpacingM: cab.poleSpacingM }, converter: { price: conv.price, eta: (conv.etaPct ?? 97) / 100 } };
}
