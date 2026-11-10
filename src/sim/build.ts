// Placement math: catalogue specs (plain numbers, injected by game.ts from the region pack and the shared physics tables) -> state
// records. The pipeline never reads a catalogue: branch r/x/bc/gc, tap limits and unit limits/costs are copied onto the records here.
import { cx } from '@core/numerics';
import { fitCostCurve } from './dispatch';
import { S_BASE_MVA, linePu, transformerPu } from './network';
import type { Branch, Shunt, ShuntKind, Storage, Unit, UnitKind } from '../types';

export interface GenSpec {
  id: string; kind: UnitKind;
  capexPerKw: number | null; pMinPct: number | null; heatRateGJperMWh: number | null; fuelPerGJ: number | null;
  /** Marginal energy cost for kinds without a heat rate (nuclear fuel, hydro water value, wind/PV 0), per MWh. */
  energyCostPerMWh: number | null;
  rampPctMin: number | null; startHotS: number | null; hS: number | null; droopPct: number | null; co2tPerMWh: number | null;
}
export interface LineSpec { id: string; kind: 'line' | 'cable'; kv: number; rOhmKm: number; xOhmKm: number; bUsKm: number; thermalMva: number; costPerKm: number }
export interface XfmrSpec { id: string; mva: number; kvHv: number; kvLv: number; zPct: number; xr: number; noLoadKw: number; loadKw: number; tapMin: number; tapMax: number; price: number }
export interface ShuntSpec { id: string; kind: ShuntKind; mvarStep: number; maxSteps: number; pricePerKvar: number }
export interface StorageSpec { id: string; mw: number; mwh: number; etaRt: number; capexPerKw: number | null; capexPerKwh: number | null }

/** What the actions need to know about the catalogue. game.ts builds one from the pack; tests inject their own. */
export interface CatalogueView {
  generator(id: string): GenSpec | null;
  line(id: string): LineSpec | null;
  transformer(id: string): XfmrSpec | null;
  shunt(id: string): ShuntSpec | null;
  storage(id: string): StorageSpec | null;
}

interface KindDefault { pMinPct: number; rampPctMin: number; H: number; droopPct: number; minUp: number; minDown: number; startBlocks: number; vom: number; startPerMW: number; qFrac: number }
/** Engineering defaults by kind where the catalogue row is silent (blocks are 15 min). */
export const KIND_DEFAULTS: Record<UnitKind, KindDefault> = {
  coal: { pMinPct: 40, rampPctMin: 2, H: 4, droopPct: 5, minUp: 32, minDown: 32, startBlocks: 12, vom: 4, startPerMW: 80, qFrac: 0.6 },
  gas: { pMinPct: 40, rampPctMin: 3, H: 5, droopPct: 5, minUp: 8, minDown: 8, startBlocks: 2, vom: 3, startPerMW: 40, qFrac: 0.6 },
  diesel: { pMinPct: 30, rampPctMin: 20, H: 1.5, droopPct: 4, minUp: 1, minDown: 1, startBlocks: 0, vom: 8, startPerMW: 10, qFrac: 0.6 },
  biomass: { pMinPct: 50, rampPctMin: 2, H: 3, droopPct: 5, minUp: 24, minDown: 24, startBlocks: 8, vom: 6, startPerMW: 60, qFrac: 0.6 },
  nuclear: { pMinPct: 60, rampPctMin: 0.5, H: 5, droopPct: 5, minUp: 96, minDown: 96, startBlocks: 48, vom: 2, startPerMW: 300, qFrac: 0.5 },
  hydro: { pMinPct: 10, rampPctMin: 50, H: 3, droopPct: 4, minUp: 0, minDown: 0, startBlocks: 0, vom: 1, startPerMW: 0, qFrac: 0.5 },
  psp: { pMinPct: 0, rampPctMin: 50, H: 3, droopPct: 4, minUp: 0, minDown: 0, startBlocks: 0, vom: 1, startPerMW: 0, qFrac: 0.5 },
  pv: { pMinPct: 0, rampPctMin: 100, H: 0, droopPct: 0, minUp: 0, minDown: 0, startBlocks: 0, vom: 0, startPerMW: 0, qFrac: 0 },
  wind: { pMinPct: 0, rampPctMin: 100, H: 0, droopPct: 0, minUp: 0, minDown: 0, startBlocks: 0, vom: 0, startPerMW: 0, qFrac: 0 },
  synccon: { pMinPct: 0, rampPctMin: 100, H: 2, droopPct: 0, minUp: 0, minDown: 0, startBlocks: 2, vom: 0, startPerMW: 0, qFrac: 1 },
};

/** A new unit of `mw` MW (nameplate) at `bus`: limits, ramp, inertia, droop, timers and the fuel cost curve copied from the spec. */
export function makeUnit(spec: GenSpec, id: string, bus: string, mw: number): Unit {
  const d = KIND_DEFAULTS[spec.kind];
  const pMin = mw * (spec.pMinPct ?? d.pMinPct) / 100;
  const price = spec.fuelPerGJ ?? 0;
  const cost = spec.heatRateGJperMWh != null && price > 0 ? fitCostCurve(spec.heatRateGJperMWh, price, pMin, mw) : { a: 0, b: spec.energyCostPerMWh ?? 0, c: 0 };
  const renewable = spec.kind === 'pv' || spec.kind === 'wind';
  const mva = spec.kind === 'synccon' ? mw : renewable ? mw : mw / 0.85;
  return {
    id, bus, catalogId: spec.id, kind: spec.kind, online: renewable, P: 0, Q: 0, Pset: 0,
    commit: { schedule: [], minUpLeft: 0, minDownLeft: 0, startLeft: 0 },
    droopPct: spec.droopPct ?? d.droopPct, H: spec.hS ?? d.H, mva, headroom: 0, gridForming: false,
    pMin, pMax: spec.kind === 'synccon' ? 0 : mw, qMin: -d.qFrac * mva * 0.5, qMax: d.qFrac * mva,
    rampMWperMin: mw * (spec.rampPctMin ?? d.rampPctMin) / 100, availMW: renewable ? 0 : mw,
    cost, vomPerMWh: d.vom, startCost: d.startPerMW * mw, co2tPerMWh: spec.co2tPerMWh ?? 0,
    minUpBlocks: d.minUp, minDownBlocks: d.minDown, startBlocks: spec.startHotS != null ? Math.ceil(spec.startHotS / 900) : d.startBlocks,
  };
}

/** A line or cable of `lengthKm` with `circuits` parallel circuits (exact equivalent pi converted to pu on 100 MVA). */
export function makeLine(spec: LineSpec, id: string, from: string, to: string, lengthKm: number, circuits: number, waypoints: [number, number][]): Branch {
  const pu = linePu({ zPerKm: cx(spec.rOhmKm, spec.xOhmKm), yPerKm: cx(0, spec.bUsKm * 1e-6), lengthKm }, spec.kv, S_BASE_MVA, circuits);
  return {
    id, from, to, kind: spec.kind, catalogId: spec.id, circuits, lengthKm, waypoints, inService: true, tap: null,
    ratingMVA: spec.thermalMva * circuits, r: pu.r, x: pu.x, bc: pu.bc, gc: pu.gc, tapMin: 0, tapMax: 0, timer: null,
  };
}

/** A two-winding transformer, HV side = `from` (carries the tap). */
export function makeTransformer(spec: XfmrSpec, id: string, from: string, to: string): Branch {
  const pu = transformerPu({ sRatedMVA: spec.mva, zPercent: spec.zPct, xOverR: spec.xr, noLoadKW: spec.noLoadKw });
  return {
    id, from, to, kind: 'xfmr', catalogId: spec.id, circuits: 1, lengthKm: 0, waypoints: [], inService: true, tap: { pos: 0, auto: null },
    ratingMVA: spec.mva, r: pu.r, x: pu.x, bc: 0, gc: pu.gNoLoad, tapMin: spec.tapMin, tapMax: spec.tapMax, timer: null,
  };
}

export function makeShunt(spec: ShuntSpec, id: string, bus: string, steps: number): Shunt {
  return { id, bus, kind: spec.kind, mvarStep: spec.kind === 'reactor' ? -Math.abs(spec.mvarStep) : spec.mvarStep, steps, on: 0, auto: null };
}

export function makeStorage(spec: StorageSpec, id: string, bus: string): Storage {
  return { id, bus, catalogId: spec.id, P: 0, soc: 0.5, mw: spec.mw, mwh: spec.mwh, etaRt: spec.etaRt, mode: 'threshold', schedule: null };
}
