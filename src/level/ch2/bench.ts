// Chapter 2's two closed-form benches on the shared bench state: L04 (the alternator, machine.ts) and L06 (the textbook town line, town.ts). Actions the tray
// calls, the per-block step the pipeline runs (tracked metrics, prediction check, verdict key), the live query the client draws from, and the shift-report text.
import type { ActionFn, ActionResult, QueryFn } from '@core/kit';
import { t } from '../../i18n';
import type { BenchState, GridState } from '../../types';
import { MACHINE, freshMachine, machineNumbers } from './machine';
import { TOWN, freshTown, pairCost, predict4kvKw, townNumbers } from './town';

export const L04_PREDICT_ID = 'L04.vpeak';

/** 1.19 predictOnce (DECISIONS 29): the design a chapter-2 prediction is made for. L04 asks for the peak of the winding as it stands (poles, turns, field,
 *  coil area); L06 asks about 4 kV whatever the ratio, so its key is empty and it is asked once. null for every other question (they do not bind). */
export function ch2PredictKey(s: Readonly<GridState>, questionId: string): string | null {
  const b = s.bench;
  if (questionId === L04_PREDICT_ID && b?.machine) { const m = b.machine; return `${m.poles}|${m.turns}|${m.fieldT}|${m.areaM2}`; }
  if (questionId === TOWN.predictId && b?.town) return '';
  return null;
}
/** The prediction stands for the design that is built now (always true for questions that do not bind and have a prediction). */
export function ch2PredictedThis(s: Readonly<GridState>, questionId: string): boolean {
  const p = s.metrics.predictions.find((x) => x.id === questionId);
  if (!p) return false;
  const k = ch2PredictKey(s, questionId);
  return k === null || p.design === undefined || p.design === k;
}
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const r1 = (x: number): number => Math.round(x * 10) / 10, r2 = (x: number): number => Math.round(x * 100) / 100, r3 = (x: number): number => Math.round(x * 1000) / 1000;

/** A fresh L04 bench: the plain 4-pole winding at the head's shaft speed, with the pack's copper price and grid frequency. */
export function freshMachineBench(f0: number, copperPerMm2PerM: number): BenchState {
  return { scenario: 'l04', hutM: null, cableMm2: { main: null, b: null }, topology: null, converters: false, limits: { vMinV: null, lossMaxPct: null }, machine: freshMachine(f0, copperPerMm2PerM) };
}
/** A fresh L06 bench: no transformers, the generator's own 4 kV on the line. */
export function freshTownBench(pricePerKva: number): BenchState {
  return { scenario: 'l06', hutM: null, cableMm2: { main: null, b: null }, topology: null, converters: false, limits: { vMinV: null, lossMaxPct: null }, town: freshTown(pricePerKva) };
}

/** Build cost of the chapter-2 bench as it stands (winding copper, or the transformer pair). */
export function ch2Cost(b: BenchState): number {
  if (b.machine) return machineNumbers(b.machine).cost;
  return b.town ? pairCost(b.town) : 0;
}

/** The levelRules system's call, once per block: tracked metrics, the prediction's actual, the verdict key, and the poor-supply clock. */
export function stepCh2(s: GridState): void {
  const b = s.bench;
  if (!b) return;
  const tr = s.metrics.track;
  let bad = false;
  delete b.verdict;
  if (b.machine) {
    const m = b.machine, n = machineNumbers(m);
    tr.freqHz = n.fHz; tr.vRmsV = n.eRmsV; tr.vPeakV = n.e0V; tr.bandUsed = n.bandUsed;
    for (const p of s.metrics.predictions) if (p.id === L04_PREDICT_ID) {   // the lamp only for the prediction of the winding that runs
      p.actual = n.e0V;
      if (ch2PredictedThis(s, L04_PREDICT_ID)) tr.predErrPct = (100 * Math.abs(p.predicted - n.e0V)) / n.e0V; else delete tr.predErrPct;
    }
    if (!n.fOk) { bad = true; b.verdict = { key: 'level.lost.machineFreq', params: { f: r2(n.fHz), fLo: r2(n.fLoHz), fHi: r2(n.fHiHz), poles: m.poles, rpm: m.rpm } }; }
    else if (!n.vOk) { bad = true; b.verdict = { key: 'level.lost.machineVolt', params: { v: r1(n.eRmsV), vLo: r1(n.vLoV), vHi: r1(n.vHiV) } }; }
  } else if (b.town) {
    const n = townNumbers(b.town);
    tr.lossPct = n.lossPct; tr.lossKw = n.lossKw; tr.vTownPu = n.vTownPu; tr.loadingPct = 100 * n.loading; tr.lineKv = n.vLineV / 1000;
    for (const p of s.metrics.predictions) if (p.id === TOWN.predictId) { p.actual = predict4kvKw(); tr.predErrPct = (100 * Math.abs(p.predicted - p.actual)) / p.actual; }
    if (n.overload) { bad = true; b.verdict = { key: 'level.lost.townOverload', params: { load: Math.round(100 * n.loading), kva: b.town.kva } }; }
    else if (n.lossPct > b.town.lossMaxPct) { bad = true; b.verdict = { key: 'level.lost.townLoss', params: { kw: r1(n.lossKw), pct: r1(n.lossPct), max: b.town.lossMaxPct, town: Math.round(100 * n.vTownPu) } }; }
  }
  if (bad) s.metrics.poorSupplyMin += 15;
  s.budget.spent = ch2Cost(b);
}

// ---- actions ----------------------------------------------------------------------------------------------------------------------
type Params = Record<string, string | number>;
const accept = (s: GridState, name: string, key: string, params: Params = {}): ActionResult => {
  s.actionLog.push({ tick: s.tick, name, key });
  if (s.actionLog.length > 200) s.actionLog.splice(0, s.actionLog.length - 200);
  return { ok: true, message: t(key, params), key, params };
};
const reject = (key: string, params: Params = {}): ActionResult => ({ ok: false, message: t(key, params), key, params });

export interface Ch2Deps { money: (s: GridState, amount: number) => string }

export function buildCh2Actions(d: Ch2Deps): Record<string, ActionFn<GridState>> {
  const machine = (s: GridState) => s.bench?.machine ?? null;
  const town = (s: GridState) => s.bench?.town ?? null;
  const settle = (s: GridState): { f: number; v: number; total: string } => {
    const n = machineNumbers(s.bench!.machine!); s.budget.spent = n.cost;
    return { f: r2(n.fHz), v: r1(n.eRmsV), total: d.money(s, n.cost) };
  };
  return {
    /** L04: the number of poles (even, 2 to 24). */
    setPoles: (s, poles: unknown) => {
      const m = machine(s); if (!m) return reject('ch2.noMachine');
      if (!isNum(poles) || !Number.isInteger(poles) || poles % 2 !== 0 || poles < MACHINE.poles.min || poles > MACHINE.poles.max) return reject('ch2.poles.range', { min: MACHINE.poles.min, max: MACHINE.poles.max, poles: String(poles) });
      m.poles = poles;
      return accept(s, 'setPoles', 'ch2.poles.ok', { poles, rpm: m.rpm, ...settle(s) });
    },
    /** L04: turns per phase winding (whole turns, 10 to 400). */
    setTurns: (s, turns: unknown) => {
      const m = machine(s); if (!m) return reject('ch2.noMachine');
      if (!isNum(turns) || !Number.isInteger(turns) || turns < MACHINE.turns.min || turns > MACHINE.turns.max) return reject('ch2.turns.range', { min: MACHINE.turns.min, max: MACHINE.turns.max, turns: String(turns) });
      m.turns = turns;
      return accept(s, 'setTurns', 'ch2.turns.ok', { turns, ...settle(s) });
    },
    /** L04: the field (excitation) flux density, tesla. */
    setField: (s, tesla: unknown) => {
      const m = machine(s); if (!m) return reject('ch2.noMachine');
      if (!isNum(tesla) || tesla < MACHINE.fieldT.min - 1e-9 || tesla > MACHINE.fieldT.max + 1e-9) return reject('ch2.field.range', { min: MACHINE.fieldT.min, max: MACHINE.fieldT.max, b: String(tesla) });
      m.fieldT = tesla;
      return accept(s, 'setField', 'ch2.field.ok', { b: tesla, ...settle(s) });
    },
    /** L04: the coil area, m2. */
    setArea: (s, area: unknown) => {
      const m = machine(s); if (!m) return reject('ch2.noMachine');
      if (!isNum(area) || area < MACHINE.areaM2.min - 1e-9 || area > MACHINE.areaM2.max + 1e-9) return reject('ch2.area.range', { min: MACHINE.areaM2.min, max: MACHINE.areaM2.max, a: String(area) });
      m.areaM2 = area;
      return accept(s, 'setArea', 'ch2.area.ok', { a: area, ...settle(s) });
    },
    /** L06: the step-up turns ratio (whole number 1 to 20; 1 takes the transformers away). */
    setLineRatio: (s, ratio: unknown) => {
      const tw = town(s); if (!tw) return reject('ch2.noTown');
      if (!isNum(ratio) || !Number.isInteger(ratio) || ratio < 1 || ratio > 20) return reject('ch2.ratio.range', { ratio: String(ratio) });
      tw.ratio = ratio; s.budget.spent = pairCost(tw);
      const n = townNumbers(tw);
      return accept(s, 'setLineRatio', ratio === 1 ? 'ch2.ratio.none' : 'ch2.ratio.ok', { ratio, kv: n.vLineV / 1000, total: d.money(s, s.budget.spent) });
    },
    /** L06: the rating of each transformer, kVA (630, 1000, 1250, 1600). */
    setTransformerKva: (s, kva: unknown) => {
      const tw = town(s); if (!tw) return reject('ch2.noTown');
      if (!isNum(kva) || !TOWN.kvas.includes(kva)) return reject('ch2.kva.range', { kva: String(kva), kvas: TOWN.kvas.join(', ') });
      tw.kva = kva; s.budget.spent = pairCost(tw);
      return accept(s, 'setTransformerKva', 'ch2.kva.ok', { kva, total: d.money(s, s.budget.spent) });
    },
  };
}

// ---- queries ----------------------------------------------------------------------------------------------------------------------
/** The live numbers of the chapter-2 bench for the client's instruments (scope, bulbs, line gauge); { active: false } on other levels. */
export const ch2Queries: Record<string, QueryFn<GridState>> = {
  ch2Bench: (s) => {
    const b = s.bench;
    if (b?.machine) {
      const m = b.machine, n = machineNumbers(m);
      return { active: true, kind: 'machine', machine: { ...m }, ...n, kg: n.copperKg, ranges: { poles: MACHINE.poles, turns: MACHINE.turns, fieldT: MACHINE.fieldT, areaM2: MACHINE.areaM2 }, predictId: L04_PREDICT_ID, prediction: s.metrics.predictions.find((p) => p.id === L04_PREDICT_ID) ?? null, predictedThis: ch2PredictedThis(s, L04_PREDICT_ID), spent: s.budget.spent, budget: s.budget.capexLimit };
    }
    if (b?.town) {
      const tw = b.town, n = townNumbers(tw);
      return { active: true, kind: 'town', town: { ...tw }, ...n, ratios: [...TOWN.ratios], kvas: [...TOWN.kvas], kmOneWay: TOWN.kmOneWay, ohmPerKmPerWire: TOWN.ohmPerKmPerWire, predictId: TOWN.predictId, predict4kvKw: r3(predict4kvKw()), prediction: s.metrics.predictions.find((p) => p.id === TOWN.predictId) ?? null, predictedThis: ch2PredictedThis(s, TOWN.predictId), spent: s.budget.spent, budget: s.budget.capexLimit };
    }
    return { active: false };
  },
};

// ---- shift-report text ------------------------------------------------------------------------------------------------------------
/** The consolidation line, in the player's own numbers; every printed number recomputes from the printed ones. '' when the state holds no chapter-2 bench. */
export function ch2Lesson(s: GridState, lessonKey: string): string {
  const b = s.bench;
  if (b?.machine) {
    const m = b.machine, n = machineNumbers(m);
    return t(lessonKey, { poles: m.poles, rpm: m.rpm, f: r2(n.fHz), turns: m.turns, b: m.fieldT, a: m.areaM2, omega: r1(n.omega), e0: r1(n.e0V), erms: r1(n.eRmsV), vpk: r1(n.vPeakTargetV), v: m.vTargetRms }) + predictLine(s, L04_PREDICT_ID, r1(n.e0V), 'V');
  }
  if (b?.town) {
    const tw = b.town, n = townNumbers(tw), lo = townNumbers({ ...tw, ratio: 1 });
    return t(tw.ratio === 1 ? 'level.L06.lessonNone' : lessonKey, { kv: r1(n.vLineV / 1000), i: r1(n.iA), r: tw.rLoopOhm, loss: r2(n.lossKw), pct: r2(n.lossPct), p: tw.pW / 1000, iLo: Math.round(lo.iA), lossLo: Math.round(lo.lossKw), pctLo: Math.round(lo.lossPct), gv: tw.vGenV / 1000, k: tw.ratio, k2: tw.ratio * tw.ratio }) + predictLine(s, TOWN.predictId, r1(predict4kvKw()), 'kW');
  }
  return '';
}

/** " You predicted X, it was Y." after the lesson; or that the prediction was for another design; '' with no prediction. */
function predictLine(s: GridState, id: string, actual: number, unit: string): string {
  const p = s.metrics.predictions.find((x) => x.id === id);
  if (!p) return '';
  if (!ch2PredictedThis(s, id)) return ' ' + t('level.ch2.predictedOther');
  return ' ' + t('level.ch2.predicted', { p: p.predicted, a: actual, unit });
}

/** What to try after a lost bench of chapter 2, from the numbers the verdict used. '' when it was not lost or fits nothing. */
export function ch2TryHint(s: GridState): string {
  const b = s.bench;
  if (!b || s.status !== 'lost') return '';
  if (s.budget.capexLimit > 0 && s.budget.spent > s.budget.capexLimit) return t(b.machine ? 'level.L04.tryBudget' : 'level.L06.tryBudget');
  if (b.machine) {
    const m = b.machine, n = machineNumbers(m);
    if (!n.fOk) return t('level.L04.tryFreq', { f: r2(m.fTargetHz), rpm: m.rpm, poles: Math.round((120 * m.fTargetHz) / m.rpm) });
    if (!n.vOk) return t('level.L04.tryVolt', { vpk: r1(n.vPeakTargetV), omega: r1(n.omega), nba: r3(n.vPeakTargetV / n.omega), have: r3(n.nba) });
    return '';
  }
  if (b.town) {
    const tw = b.town, n = townNumbers(tw);
    if (n.overload) return t('level.L06.tryOverload', { p: tw.pW / 1000, kva: tw.kva });
    if (n.lossPct > tw.lossMaxPct) { const kv = Math.sqrt((tw.pW * tw.rLoopOhm) / (tw.lossMaxPct / 100)) / 1000; return t('level.L06.tryLoss', { max: tw.lossMaxPct, kv: r1(kv), ratio: r1((kv * 1000) / tw.vGenV), gv: tw.vGenV / 1000 }); }
  }
  return '';
}
