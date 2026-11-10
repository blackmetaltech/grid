// L27 Exam Bridge: the engine's answers to the exam questions (textbook mode: flat 1.0 pu pre-fault), by the same engine functions the game uses.
// PS-17/18 Zbus fault, PS-20/21 lambda-iteration ED, PS-22 B-coefficient ED, PS-24 equal-area critical clearing at 60 Hz. Oracles: tools/oracles/ch7_oracles.py and expected.json.
import { S_BASE_MVA, type Net } from '../network';
import { threePhaseFault, slgFault, type FaultModel } from '../protection';
import { economicDispatch, edWithLosses, type EdUnit } from '../dispatch';
import { equalAreaCritical } from '../dynamics/smib';
import { SC } from './data';
import { grownBoard } from './board';

export interface ExamQuestion { id: string; unitKey: string; actual: number; /** display decimals */ dp: number }

function ps17Model(): FaultModel {
  const t = SC.l27.textbook, zb = (t.ps17.kv * t.ps17.kv) / S_BASE_MVA;
  const br = (id: string, from: string, to: string, x: number) => ({ id, from, to, r: 0, x, bc: 0, inService: true });
  const net: Net = { buses: [{ id: 'G', kV: 13.8 }, { id: 'H', kV: t.ps17.kv }, { id: 'F', kV: t.ps17.kv }], branches: [br('t1', 'G', 'H', t.ps17.xfmrX), br('l1', 'H', 'F', t.ps17.lineXOhm / zb)], shunts: [], loads: [], units: [] };
  return { net, gens: [{ bus: 'G', x1: t.ps17.genX, x2: t.ps18.genX2, x0: t.ps18.genX0 }], branchInfo: { t1: { kind: 'xfmr', group: 'Dyn' }, l1: { kind: 'line', z0: { r: 0, x: t.ps18.lineX0Ohm / zb } } } };
}
const units = (limits: boolean): EdUnit[] => SC.l27.ed.units.map((u) => ({ a: u.a, b: u.b, c: u.c, pMin: limits ? u.pMin : 0, pMax: limits ? u.pMax : 1e6 }));

export interface ExamAnswers {
  ps17: { kA: number }; ps18: { kA: number }; ps20: { lambda: number; p: number[]; cost: number }; ps21: { lambda: number; p: number[]; cost: number };
  ps22: { lambda: number; p: number[]; loss: number }; ps24: { deltaCrDeg: number; tCrS: number };
}
let ANS: ExamAnswers | null = null;
export function examAnswers(): ExamAnswers {
  if (ANS) return ANS;
  const m = ps17Model(), t = SC.l27.textbook;
  const e20 = economicDispatch(units(false), SC.l27.ed.demandNoLimitsMW), e21 = economicDispatch(units(true), SC.l27.ed.demandMW);
  const e22 = edWithLosses(t.ps22.units.map((u) => ({ a: u.a, b: u.b, c: u.c, pMin: 0, pMax: 1e6 })), t.ps22.demandMW, t.ps22.B, 8);
  const ea = equalAreaCritical({ H: t.ps24.H, f0: t.ps24.f0, Pm: t.ps24.Pm, PmaxPre: t.ps24.Pmax, PmaxDuring: 0, PmaxPost: t.ps24.Pmax, tClearS: 0 });
  ANS = {
    ps17: { kA: threePhaseFault(m, 'F').iFaultKA }, ps18: { kA: slgFault(m, 'F').iFaultKA },
    ps20: { lambda: e20.lambda, p: e20.p, cost: e20.cost }, ps21: { lambda: e21.lambda, p: e21.p, cost: e21.cost },
    ps22: { lambda: e22.lambda, p: e22.p, loss: e22.lossMW }, ps24: { deltaCrDeg: ((ea.deltaCr ?? 0) * 180) / Math.PI, tCrS: ea.tCrS ?? 0 },
  };
  return ANS;
}

/** The exam's questions with the engine's answers: the ids the `predict` action takes in L27. */
export function examQuestions(engineer: boolean): ExamQuestion[] {
  const a = examAnswers();
  const q: ExamQuestion[] = [
    { id: 'ps17', unitKey: 'ch7.unit.kA', actual: a.ps17.kA, dp: 3 }, { id: 'ps18', unitKey: 'ch7.unit.kA', actual: a.ps18.kA, dp: 3 },
    { id: 'ps20', unitKey: 'ch7.unit.usdMWh', actual: a.ps20.lambda, dp: 3 }, { id: 'ps21', unitKey: 'ch7.unit.usdMWh', actual: a.ps21.lambda, dp: 3 },
    { id: 'ps24', unitKey: 'ch7.unit.s', actual: a.ps24.tCrS, dp: 4 },
  ];
  if (engineer) q.push({ id: 'ps22', unitKey: 'ch7.unit.usdMWh', actual: a.ps22.lambda, dp: 3 });
  return q;
}

export interface L27Study {
  boardKA: { threePh: number; slg: number; duty: number }; rating: number; ratingOk: boolean; dutyRatio: number;
  dispatch: { p: [number, number, number]; sumMW: number; withinLimits: boolean; balanced: boolean; costPerH: number; optCostPerH: number; regretUSD: number; ok: boolean };
  capexUSD: number; scoreUSD: number;
}
export function studyL27(d: { rating: number; dispatch: [number, number, number] }): L27Study {
  const c = SC.l27, g = grownBoard(), duty = Math.max(g.threePhKA, g.slgKA), idx = c.breakerRatingsKA.indexOf(d.rating);
  const us = c.ed.units, p = d.dispatch;
  const sum = p[0] + p[1] + p[2], within = p.every((x, i) => x >= us[i]!.pMin - 1e-9 && x <= us[i]!.pMax + 1e-9), balanced = Math.abs(sum - c.ed.demandMW) <= 0.5;
  const costPerH = p.reduce((a, x, i) => a + us[i]!.a + us[i]!.b * x + us[i]!.c * x * x, 0), opt = examAnswers().ps21.cost;
  const capex = SC.l23.breakers.count * c.breakerPrice[Math.max(0, idx)]!;
  const regret = c.ed.tonightH * (costPerH - opt);
  return {
    boardKA: { threePh: g.threePhKA, slg: g.slgKA, duty }, rating: d.rating, ratingOk: duty <= d.rating, dutyRatio: duty / d.rating,
    dispatch: { p, sumMW: sum, withinLimits: within, balanced, costPerH, optCostPerH: opt, regretUSD: regret, ok: within && balanced }, capexUSD: capex, scoreUSD: capex + Math.max(0, regret),
  };
}
