// Region-pack data for GRID (DESIGN §11.2). Physics is region-independent: a pack may change prices, limits, standards
// references and catalogue prices, never the laws or material constants of the simulation. The schema is therefore STRICT:
// unknown keys are rejected at every level, so a physics constant (conductor resistivity, g, permeability…) cannot be smuggled
// into a pack. Physics catalogues (conductor geometry, governor constants) live in shared code, not here.
//
// Every non-trivial number carries provenance (`provenance[path] = {source, confidence}`), every catalogue row carries
// `source` + `confidence`. `recall` (model recall, not yet opened) is allowed only in a `draft` pack: `releaseGateProblems`
// is the data release gate (RELEASE=1 in the tests makes it fatal for shipping packs).
import { hashOf } from '@core/kit';
import type { RegionPack } from '@core/regions';

export type Confidence = 'datasheet' | 'standard' | 'report' | 'secondary' | 'derived' | 'recall' | 'game';
export const CONFIDENCES: readonly Confidence[] = ['datasheet', 'standard', 'report', 'secondary', 'derived', 'recall', 'game'];

export interface Sourced { source: string; confidence: Confidence }

export interface BandKv { minKv: number; maxKv: number }

export const ROUTE_TILE_KINDS = ['field', 'swamp', 'river', 'forest', 'rock', 'sand', 'sea', 'town', 'road'] as const;
export const ROUTE_ANGLE_CLASSES = ['suspension', 'small', 'medium', 'large', 'terminal'] as const;
export const ROUTE_FOUNDATIONS = ['earth', 'pile', 'rock'] as const;
export interface RouteData {
  rules: {
    /** Everyday stringing tension as a fraction of UTS at `everydayC`, and the design (hottest) conductor temperature for clearance checks, deg C. */
    everydayFrac: number; everydayC: number; designC: number;
    /** Ground clearance (m) by voltage class: the first row whose `uptoKv` is >= the line's kV applies (rows ascending). */
    groundClearance: { uptoKv: number; m: number }[];
    /** Clearance over water above high-water level, extra clearance over roads, insulator string drop (0 for pin insulators), m. */
    waterClearanceM: number; roadExtraM: number; insulatorDropM: number;
    /** Tile kinds that cannot hold a support, and kinds a line may not cross overhead. */
    noSupport: string[]; noOverhead: string[];
  };
  prices: {
    /** Pack currency per support of each family (a suspension support; angle classes multiply it). */
    support: Record<string, number>;
    angleMultiplier: Record<string, number>;
    /** Foundation price as a share of the (angle-adjusted) support price, times the multiplier of the foundation kind. */
    foundationShare: number;
    foundationMultiplier: Record<string, number>;
    /** Pack currency per metre of ONE phase wire, by short conductor id ('weasel', 'rabbit', 'dog'); wires per line: 4 below 1 kV, 3 above. */
    conductorPerM: Record<string, number>;
    phaseWires: { lv: number; mv: number };
    /** Right-of-way clearing, pack currency per metre of route over forest. */
    clearingPerM: number;
    /** Pack currency per phase per support of each insulator string ('pin', 'disc2', 'fog1'); absent = the base US$ prices of src/data/insulators.ts. */
    insulator?: Record<string, number>;
    /** Pack currency per km of each submarine cable ('sub-11-70', ...; src/data/submarine.ts); absent = not offered (L30). */
    submarine?: Record<string, number>;
  };
}

export interface UflsRow { /** pick-up, Hz */ hz: number; /** percent of demand shed */ shedPct: number; /** relay + breaker delay, s */ delayS: number }
export interface TripRow { /** frequency threshold, Hz */ hz: number; /** time above/below it before the unit trips, s */ s: number }

export interface GridRegionData {
  /** Nominal frequency, Hz. */
  f0: 50 | 60;
  voltage: {
    /** LV phase-to-neutral and line-to-line voltage, V (230/400 in IEC 60038). */
    lvPhaseV: number;
    lvLineV: number;
    /** Nominal system voltages above LV, kV, strictly ascending. */
    levelsKv: number[];
    /** Steady-state band per level, kV, keyed by the level as a string ('400'). */
    bandsKv: Record<string, BandKv>;
    /** Levels (kV) with no kV band in the pack: they use `mvBandPct`. */
    pctBandLevelsKv: number[];
    /** LV supply band, ± percent of nominal. */
    lvBandPct: number;
    /** MV load-bus band, ± percent, per game mode. */
    mvBandPct: { learner: number; engineer: number };
    /** Short-term emergency lower limits, kV, keyed like `bandsKv` (may be empty). */
    emergencyMinKv: Record<string, number>;
  };
  gridcode: {
    /** Standard frequency range [low, high], Hz. */
    standardRangeHz: [number, number];
    /** Maximum steady-state and instantaneous deviations, Hz; null when the pack does not specify them. */
    maxSteadyDevHz: number | null;
    maxInstDevHz: number | null;
    /** Frequency-response insensitivity (deadband), ± Hz. */
    fcrDeadbandHz: number;
    /** Time for full primary response, s. */
    fcrFullActivationS: number;
    /** Allowed governor droop range [min, max], percent. */
    droopRangePct: [number, number];
    /** Under-frequency load shedding stages, strictly descending in Hz. */
    ufls: UflsRow[];
    genUfTrip: TripRow;
    genOfTrip: TripRow;
    /** Over-voltage trip stages: voltage in pu, time in s. */
    ovStages: { pu: number; s: number }[];
    /** A load bus below this voltage (pu) for this long (s) loses its motor share. */
    uvLoadTrip: { pu: number; s: number };
    /** Imbalance settlement period, minutes. */
    settlementMin: number;
  };
  economy: {
    /** Pack currency per MWh. */
    energyPricePerMWh: number;
    /** Value of lost load, pack currency per MWh. */
    vollPerMWh: number;
    /** Fuel prices: pack currency per GJ of fuel (nuclear: per MWh of electricity, `nuclearPerMWhe`). */
    fuelPerGJ: { coal: number; gas: number; diesel: number; biomass: number };
    nuclearPerMWhe: number | null;
  };
  climate: { /** degrees north */ latitudeDeg: number };
  /** Overhead-line route rules (clearances, stringing rule) and the prices of supports, foundations and conductors (L05, DEPTH §4). */
  route: RouteData;
  catalogues: Catalogues;
  /** Source and confidence per data path (see REQUIRED_PROVENANCE). */
  provenance: Record<string, Sourced>;
}

// ---- catalogue rows: priced SKUs plus the per-SKU columns DESIGN §4 tabulates; physics constants shared by all packs live in src/data ----
// Every row carries `source` + `confidence`; `confidence` is the WEAKEST tag among the row's values and `fieldConfidence` lists the
// per-field tags where DESIGN splits them. `null` = the table gives no single value (reported, never invented).
export type FieldConf = Partial<Record<string, Confidence>>;
export interface CatalogueRow extends Sourced { id: string; fieldConfidence?: FieldConf; note?: string }
export interface GeneratorRow extends CatalogueRow {
  kind: string;
  /** pack currency per kW (per kVA for synccon); null when the pack's table prints only a US$ cross-reference */
  capexPerKw: number | null;
  unit?: string;
  pMinPct?: number | null; /** MJ/kWh, full load; null for water, wind, sun */ heatRateMJkWh?: number | null; rampPctMin?: number | null;
  startHotS?: number | null; startColdS?: number | null; hS?: number | null; droopPct?: number | null; co2tPerMWh?: number | null;
  /** US$ per kW cross-reference (EIA) when the pack currency is not US$ */ capexUsdPerKw?: number | null;
}
export interface TransformerRow extends CatalogueRow {
  mva: number; kvHv: number; kvLv: number; /** pack currency per unit; null when the table gives a range */ price: number | null;
  zPct?: number | null; xr?: number | null; noLoadKw?: number | null; loadKw?: number | null; etaPct?: number | null;
  vector?: string; oltc?: string; pricePerMva?: number | null;
}
export interface CompensationRow extends CatalogueRow {
  kind: string; kv?: number | null; mvar: number | null; /** pack currency per kVAr; null when not tabulated */ pricePerKvar: number | null;
  pricePerKvarUsd?: number | null; costFactor?: number | null; autoCostFactor?: number | null; uFPerPhase?: number | null; detunePct?: number | null;
  resonanceH?: number | null; seriesPct?: number | null;
}
export interface StorageRow extends CatalogueRow {
  mw: number; mwh: number | null; capexPerKw: number | null; capexPerKwh: number | null; /** all-in pack currency per kW */ allInPerKw?: number | null;
  etaRt?: number | null; responseMs?: number | null; socMinPct?: number | null; socMaxPct?: number | null; hVs?: number | null; allInUsdPerKw?: number | null;
}
export interface ProtectionRow extends CatalogueRow { kind: string; price: number | null; params?: Record<string, unknown> }
export interface LineCostRow extends CatalogueRow { kv: number; variant?: string; /** pack currency per km per circuit */ costPerKm: number; doubleCircuitFactor?: number | null }
export interface CableRow extends CatalogueRow { /** per metre per mm2 of conductor per core */ perMm2PerM: number; sheathPerM: number; polePrice: number; poleSpacingM: number }
export interface FuelRow extends CatalogueRow { /** 'GJ' (fuel energy) or 'MWh_e' (nuclear: per electric MWh) */ unit: string; price: number }
export interface Catalogues {
  generators: GeneratorRow[];
  transformers: TransformerRow[];
  compensation: CompensationRow[];
  storage: StorageRow[];
  protection: ProtectionRow[];
  lineCosts: LineCostRow[];
  cables: CableRow[];
  fuels: FuelRow[];
}

interface RowSpec { str: string[]; num: string[]; opt: string[]; optStr: string[]; optObj?: string[] }
/** Allowed keys per catalogue: `num` required positive; `opt` number >= 0 or null (may be absent); `str` required text; `optStr` optional text. */
const ROW_SPEC: Record<keyof Catalogues, RowSpec> = {
  generators: { str: ['kind'], num: [], opt: ['capexPerKw', 'pMinPct', 'heatRateMJkWh', 'rampPctMin', 'startHotS', 'startColdS', 'hS', 'droopPct', 'co2tPerMWh', 'capexUsdPerKw'], optStr: ['unit'] },
  transformers: { str: [], num: ['mva', 'kvHv', 'kvLv'], opt: ['price', 'zPct', 'xr', 'noLoadKw', 'loadKw', 'etaPct', 'pricePerMva'], optStr: ['vector', 'oltc'] },
  compensation: { str: ['kind'], num: [], opt: ['kv', 'mvar', 'pricePerKvar', 'pricePerKvarUsd', 'costFactor', 'autoCostFactor', 'uFPerPhase', 'detunePct', 'resonanceH', 'seriesPct'], optStr: [] },
  storage: { str: [], num: ['mw'], opt: ['mwh', 'capexPerKw', 'capexPerKwh', 'allInPerKw', 'allInUsdPerKw', 'etaRt', 'responseMs', 'socMinPct', 'socMaxPct', 'hVs'], optStr: [] },
  protection: { str: ['kind'], num: [], opt: ['price'], optStr: [], optObj: ['params'] },
  lineCosts: { str: [], num: ['kv', 'costPerKm'], opt: ['doubleCircuitFactor'], optStr: ['variant'] },
  cables: { str: [], num: ['perMm2PerM', 'sheathPerM', 'polePrice', 'poleSpacingM'], opt: [], optStr: [] },
  fuels: { str: ['unit'], num: ['price'], opt: [], optStr: [] },
};
const ROW_COMMON = ['id', 'source', 'confidence', 'fieldConfidence', 'note'];
const rowKeys = (s: RowSpec): string[] => [...ROW_COMMON, ...s.str, ...s.num, ...s.opt, ...s.optStr, ...(s.optObj ?? [])];

/** Data paths that must carry provenance (a path whose value is null is exempt). */
export const REQUIRED_PROVENANCE: readonly string[] = [
  'f0', 'voltage.lv', 'voltage.levelsKv', 'voltage.bandsKv', 'voltage.lvBandPct', 'voltage.mvBandPct',
  'gridcode.standardRangeHz', 'gridcode.maxSteadyDevHz', 'gridcode.maxInstDevHz', 'gridcode.fcrDeadbandHz', 'gridcode.fcrFullActivationS',
  'gridcode.droopRangePct', 'gridcode.ufls.hz', 'gridcode.ufls.shedPct', 'gridcode.ufls.delayS',
  'gridcode.genUfTrip.hz', 'gridcode.genUfTrip.s', 'gridcode.genOfTrip.hz', 'gridcode.genOfTrip.s',
  'gridcode.ovStages', 'gridcode.uvLoadTrip', 'gridcode.settlementMin',
  'economy.energyPricePerMWh', 'economy.vollPerMWh', 'economy.fuelPerGJ', 'climate.latitudeDeg', 'route.rules', 'route.prices',
];
const NULLABLE_PROVENANCE: Record<string, (d: GridRegionData) => unknown> = {
  'gridcode.maxSteadyDevHz': (d) => d.gridcode?.maxSteadyDevHz, 'gridcode.maxInstDevHz': (d) => d.gridcode?.maxInstDevHz,
};

const isObj = (v: unknown): boolean => !!v && typeof v === 'object' && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isPos = (v: unknown): v is number => isNum(v) && v > 0;
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

function onlyKeys(o: object, allowed: string[], path: string, e: string[]): void {
  for (const k of Object.keys(o)) if (!allowed.includes(k)) e.push(`${path}.${k} is not a field of the schema (physics constants do not belong in a region pack)`);
}

function validateRoute(r: any, e: string[]): void {
  if (!isObj(r)) { e.push('route must be an object ({rules, prices})'); return; }
  onlyKeys(r, ['rules', 'prices'], 'route', e);
  const ru: any = r.rules, pr: any = r.prices;
  if (!isObj(ru)) e.push('route.rules must be an object');
  else {
    onlyKeys(ru, ['everydayFrac', 'everydayC', 'designC', 'groundClearance', 'waterClearanceM', 'roadExtraM', 'insulatorDropM', 'noSupport', 'noOverhead'], 'route.rules', e);
    if (!isNum(ru.everydayFrac) || !(ru.everydayFrac > 0 && ru.everydayFrac < 1)) e.push('route.rules.everydayFrac must be a fraction of the UTS in (0, 1)');
    if (!isNum(ru.everydayC) || !isNum(ru.designC) || !(ru.designC > ru.everydayC)) e.push('route.rules.designC must be hotter than everydayC (deg C)');
    for (const k of ['waterClearanceM', 'roadExtraM', 'insulatorDropM']) if (!isNum(ru[k]) || ru[k] < 0) e.push(`route.rules.${k} must be a number >= 0 (m)`);
    const g = ru.groundClearance;
    if (!Array.isArray(g) || g.length === 0 || g.some((x: any) => !isObj(x) || !isPos(x.uptoKv) || !isPos(x.m))) e.push('route.rules.groundClearance must be a non-empty list of {uptoKv > 0, m > 0}');
    else for (let i = 1; i < g.length; i++) if (!(g[i].uptoKv > g[i - 1].uptoKv)) e.push('route.rules.groundClearance rows must be ascending in uptoKv');
    for (const k of ['noSupport', 'noOverhead']) if (!Array.isArray(ru[k]) || ru[k].some((x: unknown) => !(ROUTE_TILE_KINDS as readonly string[]).includes(x as string))) e.push(`route.rules.${k} must be a list of tile kinds (${ROUTE_TILE_KINDS.join(', ')})`);
  }
  if (!isObj(pr)) e.push('route.prices must be an object');
  else {
    onlyKeys(pr, ['support', 'angleMultiplier', 'foundationShare', 'foundationMultiplier', 'conductorPerM', 'phaseWires', 'clearingPerM', 'insulator', 'submarine'], 'route.prices', e);
    const table = (k: string, keys?: readonly string[]): void => {
      const t = pr[k];
      if (!isObj(t) || Object.keys(t).length === 0 || Object.values(t).some((x) => !isPos(x))) e.push(`route.prices.${k} must be a non-empty object of positive numbers`);
      else if (keys) for (const need of keys) if (!(need in t)) e.push(`route.prices.${k}.${need} is missing`);
    };
    if (pr.insulator !== undefined) table('insulator');
    if (pr.submarine !== undefined) table('submarine');
    table('support'); table('conductorPerM'); table('angleMultiplier', ROUTE_ANGLE_CLASSES); table('foundationMultiplier', ROUTE_FOUNDATIONS);
    if (!isPos(pr.foundationShare) || pr.foundationShare >= 1) e.push('route.prices.foundationShare must be a share in (0, 1)');
    if (!isPos(pr.clearingPerM)) e.push('route.prices.clearingPerM must be a positive number');
    if (!isObj(pr.phaseWires) || !isPos(pr.phaseWires.lv) || !isPos(pr.phaseWires.mv)) e.push('route.prices.phaseWires must be {lv, mv} wire counts');
  }
}

/** Schema + range checks for a pack's `data`. Returns messages (empty = valid). */
export function validateGridData(d: GridRegionData): string[] {
  const e: string[] = [];
  if (!isObj(d)) return ['must be an object'];
  onlyKeys(d, ['f0', 'voltage', 'gridcode', 'economy', 'climate', 'route', 'catalogues', 'provenance'], 'data', e);
  if (d.f0 !== 50 && d.f0 !== 60) e.push(`f0 must be 50 or 60 Hz (got ${String(d.f0)})`);
  const f0 = d.f0 === 60 ? 60 : 50;

  // voltage
  const v: any = d.voltage;
  if (!isObj(v)) e.push('voltage must be an object');
  else {
    onlyKeys(v, ['lvPhaseV', 'lvLineV', 'levelsKv', 'bandsKv', 'pctBandLevelsKv', 'lvBandPct', 'mvBandPct', 'emergencyMinKv'], 'voltage', e);
    if (!isPos(v.lvPhaseV)) e.push('voltage.lvPhaseV must be a positive number of volts');
    if (!isPos(v.lvLineV)) e.push('voltage.lvLineV must be a positive number of volts');
    if (isPos(v.lvPhaseV) && isPos(v.lvLineV) && v.lvLineV <= v.lvPhaseV) e.push('voltage.lvLineV must exceed lvPhaseV');
    const lv = v.levelsKv;
    if (!Array.isArray(lv) || lv.length === 0 || lv.some((x: unknown) => !isPos(x))) e.push('voltage.levelsKv must be a non-empty array of positive kV values');
    else {
      for (let i = 1; i < lv.length; i++) if (!(lv[i] > lv[i - 1])) e.push('voltage.levelsKv must be strictly ascending');
      const pct: unknown[] = Array.isArray(v.pctBandLevelsKv) ? v.pctBandLevelsKv : [];
      if (!Array.isArray(v.pctBandLevelsKv) || pct.some((x) => !lv.includes(x))) e.push('voltage.pctBandLevelsKv must be an array of levels from levelsKv');
      if (!isObj(v.bandsKv)) e.push('voltage.bandsKv must be an object keyed by kV level');
      else {
        for (const k of Object.keys(v.bandsKv)) if (!lv.includes(Number(k))) e.push(`voltage.bandsKv.${k}: ${k} kV is not in levelsKv`);
        for (const k of lv as number[]) {
          const b: any = (v.bandsKv as any)[String(k)];
          if (b === undefined) { if (!pct.includes(k)) e.push(`voltage.bandsKv: the ${k} kV level has no band (list it in pctBandLevelsKv or give minKv/maxKv)`); continue; }
          if (!isObj(b) || !isPos(b.minKv) || !isPos(b.maxKv) || !(b.minKv < b.maxKv)) e.push(`voltage.bandsKv.${k} needs 0 < minKv < maxKv`);
          else if (b.minKv > k || b.maxKv < k) e.push(`voltage.bandsKv.${k}: the band [${b.minKv}, ${b.maxKv}] kV must contain the nominal ${k} kV`);
        }
      }
    }
    if (!isPos(v.lvBandPct) || v.lvBandPct > 20) e.push('voltage.lvBandPct must be a percentage in (0, 20]');
    if (!isObj(v.mvBandPct) || !isPos(v.mvBandPct.learner) || !isPos(v.mvBandPct.engineer) || v.mvBandPct.learner > 20 || v.mvBandPct.engineer > v.mvBandPct.learner) e.push('voltage.mvBandPct needs 0 < engineer <= learner <= 20 (percent)');
    if (!isObj(v.emergencyMinKv) || Object.values(v.emergencyMinKv).some((x) => !isPos(x))) e.push('voltage.emergencyMinKv must be an object of positive kV values');
  }

  // grid code
  const g: any = d.gridcode;
  if (!isObj(g)) e.push('gridcode must be an object');
  else {
    onlyKeys(g, ['standardRangeHz', 'maxSteadyDevHz', 'maxInstDevHz', 'fcrDeadbandHz', 'fcrFullActivationS', 'droopRangePct', 'ufls', 'genUfTrip', 'genOfTrip', 'ovStages', 'uvLoadTrip', 'settlementMin'], 'gridcode', e);
    const r = g.standardRangeHz;
    if (!Array.isArray(r) || r.length !== 2 || !isPos(r[0]) || !isPos(r[1]) || !(r[0] < f0 && f0 < r[1])) e.push(`gridcode.standardRangeHz must be [low, high] around ${f0} Hz`);
    for (const k of ['maxSteadyDevHz', 'maxInstDevHz']) if (g[k] !== null && !isPos(g[k])) e.push(`gridcode.${k} must be a positive number of Hz or null`);
    if (!isNum(g.fcrDeadbandHz) || g.fcrDeadbandHz < 0) e.push('gridcode.fcrDeadbandHz must be >= 0 (Hz)');
    if (!isPos(g.fcrFullActivationS)) e.push('gridcode.fcrFullActivationS must be a positive number of seconds');
    const dr = g.droopRangePct;
    if (!Array.isArray(dr) || dr.length !== 2 || !isPos(dr[0]) || !isPos(dr[1]) || !(dr[0] <= dr[1]) || dr[1] > 100) e.push('gridcode.droopRangePct must be [min, max] with 0 < min <= max <= 100 (percent)');
    const u = g.ufls;
    if (!Array.isArray(u) || u.length === 0) e.push('gridcode.ufls must be a non-empty list of stages');
    else {
      let total = 0;
      u.forEach((s: any, i: number) => {
        if (!isObj(s)) { e.push(`gridcode.ufls[${i}] must be an object`); return; }
        onlyKeys(s, ['hz', 'shedPct', 'delayS'], `gridcode.ufls[${i}]`, e);
        if (!isPos(s.hz) || s.hz >= f0) e.push(`gridcode.ufls[${i}].hz must be a positive frequency below ${f0} Hz`);
        if (!isPos(s.shedPct) || s.shedPct > 100) e.push(`gridcode.ufls[${i}].shedPct must be positive (percent, at most 100)`); else total += s.shedPct;
        if (!isNum(s.delayS) || s.delayS < 0) e.push(`gridcode.ufls[${i}].delayS must be >= 0 (s)`);
        if (i > 0 && isNum(u[i - 1]?.hz) && !(s.hz < u[i - 1].hz)) e.push(`gridcode.ufls stages must be strictly descending in Hz (stage ${i + 1} at ${String(s.hz)} Hz follows ${String(u[i - 1].hz)} Hz)`);
      });
      if (total > 100) e.push(`gridcode.ufls sheds ${total} % in total; it cannot exceed 100 %`);
    }
    const trip = (name: string, t: any, dir: 'below' | 'above') => {
      if (!isObj(t)) { e.push(`gridcode.${name} must be {hz, s}`); return; }
      onlyKeys(t, ['hz', 's'], `gridcode.${name}`, e);
      if (!isPos(t.hz) || (dir === 'below' ? t.hz >= f0 : t.hz <= f0)) e.push(`gridcode.${name}.hz must be ${dir} ${f0} Hz`);
      if (!isNum(t.s) || t.s < 0) e.push(`gridcode.${name}.s must be >= 0 (s)`);
    };
    trip('genUfTrip', g.genUfTrip, 'below'); trip('genOfTrip', g.genOfTrip, 'above');
    if (!Array.isArray(g.ovStages) || g.ovStages.length === 0 || g.ovStages.some((s: any) => !isObj(s) || !(isNum(s.pu) && s.pu > 1) || !isNum(s.s) || s.s < 0)) e.push('gridcode.ovStages must be a non-empty list of {pu > 1, s >= 0}');
    if (!isObj(g.uvLoadTrip) || !(isNum(g.uvLoadTrip.pu) && g.uvLoadTrip.pu > 0 && g.uvLoadTrip.pu < 1) || !isNum(g.uvLoadTrip.s) || g.uvLoadTrip.s < 0) e.push('gridcode.uvLoadTrip must be {pu in (0,1), s >= 0}');
    if (!isPos(g.settlementMin) || !Number.isInteger(g.settlementMin)) e.push('gridcode.settlementMin must be a positive whole number of minutes');
  }

  // economy
  const ec: any = d.economy;
  if (!isObj(ec)) e.push('economy must be an object');
  else {
    onlyKeys(ec, ['energyPricePerMWh', 'vollPerMWh', 'fuelPerGJ', 'nuclearPerMWhe'], 'economy', e);
    if (!isPos(ec.energyPricePerMWh)) e.push('economy.energyPricePerMWh must be a positive number');
    if (!isPos(ec.vollPerMWh)) e.push('economy.vollPerMWh must be a positive number');
    if (isPos(ec.energyPricePerMWh) && isPos(ec.vollPerMWh) && ec.vollPerMWh <= ec.energyPricePerMWh) e.push('economy.vollPerMWh must exceed the energy price (unserved energy must cost more than energy)');
    if (!isObj(ec.fuelPerGJ)) e.push('economy.fuelPerGJ must be an object');
    else {
      onlyKeys(ec.fuelPerGJ, ['coal', 'gas', 'diesel', 'biomass'], 'economy.fuelPerGJ', e);
      for (const k of ['coal', 'gas', 'diesel', 'biomass']) if (!isPos((ec.fuelPerGJ as any)[k])) e.push(`economy.fuelPerGJ.${k} must be a positive number`);
    }
    if (ec.nuclearPerMWhe !== null && !isPos(ec.nuclearPerMWhe)) e.push('economy.nuclearPerMWhe must be a positive number or null');
  }

  // climate
  const c: any = d.climate;
  if (!isObj(c)) e.push('climate must be an object');
  else { onlyKeys(c, ['latitudeDeg'], 'climate', e); if (!isNum(c.latitudeDeg) || c.latitudeDeg < -90 || c.latitudeDeg > 90) e.push('climate.latitudeDeg must be between -90 and 90'); }

  // route rules and prices
  validateRoute(d.route, e);

  // catalogues
  const cat: any = d.catalogues;
  if (!isObj(cat)) e.push('catalogues must be an object');
  else {
    onlyKeys(cat, Object.keys(ROW_SPEC), 'catalogues', e);
    for (const name of Object.keys(ROW_SPEC) as (keyof Catalogues)[]) {
      const rows = cat[name];
      if (!Array.isArray(rows)) { e.push(`catalogues.${name} must be an array`); continue; }
      const spec = ROW_SPEC[name];
      const seen = new Set<string>();
      rows.forEach((r: any, i: number) => {
        const at = `catalogues.${name}[${i}]${isObj(r) && isStr(r.id) ? ` ('${r.id}')` : ''}`;
        if (!isObj(r)) { e.push(`${at} must be an object`); return; }
        onlyKeys(r, rowKeys(spec), at, e);
        if (!isStr(r.id)) e.push(`${at}.id must be a non-empty string`); else if (seen.has(r.id)) e.push(`${at}: duplicate id '${r.id}'`); else seen.add(r.id);
        if (!isStr(r.source)) e.push(`${at} has no source (every catalogue row needs a source string)`);
        if (!CONFIDENCES.includes(r.confidence)) e.push(`${at}.confidence must be one of ${CONFIDENCES.join(', ')} (got ${JSON.stringify(r.confidence)})`);
        for (const k of spec.num) if (!isPos(r[k])) e.push(`${at}.${k} must be a positive number`);
        for (const k of spec.opt) if (r[k] !== undefined && r[k] !== null && !(isNum(r[k]) && r[k] >= 0)) e.push(`${at}.${k} must be a number >= 0 or null`);
        for (const k of spec.str) if (!isStr(r[k])) e.push(`${at}.${k} must be a non-empty string`);
        for (const k of spec.optStr) if (r[k] !== undefined && !isStr(r[k])) e.push(`${at}.${k} must be a non-empty string when present`);
        for (const k of spec.optObj ?? []) if (r[k] !== undefined && !isObj(r[k])) e.push(`${at}.${k} must be an object when present`);
        if (r.note !== undefined && !isStr(r.note)) e.push(`${at}.note must be a non-empty string when present`);
        if (r.fieldConfidence !== undefined) {
          if (!isObj(r.fieldConfidence)) e.push(`${at}.fieldConfidence must be an object`);
          else for (const [k, c] of Object.entries(r.fieldConfidence)) if (!CONFIDENCES.includes(c as Confidence)) e.push(`${at}.fieldConfidence.${k} must be one of ${CONFIDENCES.join(', ')}`);
        }
      });
    }
  }

  // provenance
  const p: any = d.provenance;
  if (!isObj(p)) e.push('provenance must be an object');
  else {
    for (const [k, s] of Object.entries(p) as [string, any][]) {
      if (!isObj(s) || !isStr(s['source'])) e.push(`provenance.${k} needs a non-empty source`);
      else { onlyKeys(s, ['source', 'confidence'], `provenance.${k}`, e); if (!CONFIDENCES.includes((s as any).confidence as Confidence)) e.push(`provenance.${k}.confidence must be one of ${CONFIDENCES.join(', ')}`); }
    }
    for (const k of REQUIRED_PROVENANCE) {
      const nullable = NULLABLE_PROVENANCE[k];
      if (nullable && nullable(d) === null) continue;
      if (!(k in p)) e.push(`provenance.${k} is missing (tag every grid-code and price value with source + confidence)`);
    }
  }
  return e;
}

/**
 * Data release gate: a pack that ships may contain no `recall` value (provenance entry or catalogue row). A draft pack may.
 * Returns one message per offending entry.
 */
export function releaseGateProblems(pack: Pick<RegionPack<GridRegionData>, 'id' | 'status' | 'data'>): string[] {
  if (pack.status === 'draft') return [];
  const out: string[] = [];
  for (const [path, s] of Object.entries(pack.data.provenance ?? {})) if (s.confidence === 'recall') out.push(`${pack.id}: provenance '${path}' is recall (${s.source})`);
  for (const [name, rows] of Object.entries(pack.data.catalogues ?? {}) as [string, CatalogueRow[]][]) {
    for (const r of rows) if (r.confidence === 'recall') out.push(`${pack.id}: catalogues.${name} row '${r.id}' is recall (${r.source})`);
  }
  return out;
}

/**
 * Deterministic hash of everything in a pack's `data` that can change a score: limits, prices, catalogue values. NOT the pack's
 * names or `strings`, and not source/confidence tags (provenance is metadata: relabelling a value as verified changes no rule;
 * if the value itself changes, the hash changes).
 */
export function packDataHash(pack: Pick<RegionPack<GridRegionData>, 'data'>): string {
  const { provenance: _p, catalogues, ...rules } = pack.data;
  const stripped: Record<string, unknown[]> = {};
  for (const [name, rows] of Object.entries(catalogues) as [string, Record<string, unknown>[]][]) {
    if (rows.length === 0 && !['generators', 'transformers', 'compensation', 'storage', 'protection'].includes(name)) continue; // empty new catalogues hash as absent (pins stay valid)
    stripped[name] = rows.map(({ source: _s, confidence: _c, fieldConfidence: _f, note: _n, ...row }) => row);
  }
  return hashOf({ ...rules, catalogues: stripped });
}

/** What the committed pin table records per pack. */
export interface RulesetPin { rulesetVersion: number; dataHash: string }

/** Compare a pack with its pin; messages say what to do. Empty = consistent. */
export function checkPin(pack: Pick<RegionPack<GridRegionData>, 'id' | 'rulesetVersion' | 'data'>, pin: RulesetPin | undefined): string[] {
  if (!pin) return [`${pack.id}: no pin in src/regions/pins.ts (add { rulesetVersion: ${pack.rulesetVersion}, dataHash: '${packDataHash(pack)}' })`];
  const h = packDataHash(pack);
  if (h === pin.dataHash && pack.rulesetVersion === pin.rulesetVersion) return [];
  if (h !== pin.dataHash && pack.rulesetVersion === pin.rulesetVersion) return [`${pack.id}: rule-relevant data changed (hash ${pin.dataHash} -> ${h}) but rulesetVersion is still ${pin.rulesetVersion}: bump the pack's rulesetVersion (old scores are not comparable) and update pins.ts`];
  return [`${pack.id}: pins.ts is stale (pinned @${pin.rulesetVersion} ${pin.dataHash}, pack is @${pack.rulesetVersion} ${h}): update pins.ts in the same change`];
}
