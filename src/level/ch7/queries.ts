// Chapter 7 queries: the study of the design as it stands (what the instruments draw), the kit (prices and options for the tray), and the shift report's lesson and
// "what to try" lines in the player's own numbers. Before the scripted event runs, the numbers that ARE the prediction (fault kA, critical angle, lambda) stay hidden.
import { dmath } from '@core/numerics';
import type { QueryFn } from '@core/kit';
import { t } from '../../i18n';
import { formatMoney } from '@core/regions';
import { REGIONS } from '../../regions';
import type { GridState } from '../../types';
import { SC, r1, r2, r3, hhmm } from '../../sim/ch7/data';
import { studyL23, preGensKA, grownBoard } from '../../sim/ch7/board';
import { studyL24 } from '../../sim/ch7/feeder';
import { studyL25, critical, smibInput, pDeltaCurves } from '../../sim/ch7/swing';
import { studyL26, PLANTS, hydroSchedule } from '../../sim/ch7/merit';
import { studyL27, examAnswers, examQuestions } from '../../sim/ch7/exam';
import { studyOf } from '../../sim/ch7/study';
import { IDMT_CURVES, idmtTime } from '../../sim/protection';
import { equalAreas } from '../../sim/dynamics/smib';

const pr = (s: GridState, x: number): string => formatMoney(x * (s.ch7?.money ?? 1), REGIONS.get(s.region), { decimals: 2 });   // a price per MWh in the pack's currency
const money = (s: GridState, x: number): string => formatMoney(x * (s.ch7?.money ?? 1), REGIONS.get(s.region), { decimals: 0 });
const ran = (s: GridState): boolean => s.tick > s.levelStart;
/** JSON-safe: Infinity and NaN become null. */
const fin = (x: number): number | null => (Number.isFinite(x) ? x : null);

/** Log-spaced points of a relay's time-current curve over [lo, hi] A. */
function curvePoints(curve: 'SI' | 'VI' | 'EI', tms: number, is: number, lo: number, hi: number, n = 48): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = lo * dmath.pow(hi / lo, i / (n - 1)), tt = idmtTime(curve, tms, a, is);
    if (Number.isFinite(tt)) pts.push([r1(a), r3(tt)]);
  }
  return pts;
}

export function buildCh7Queries(): Record<string, QueryFn<GridState>> {
  return {
    /** The live study of the running chapter-7 level: design echo, costs and the instrument data of the level. `revealed` is false until the scripted event has run. */
    ch7Study: (s) => {
      const c = s.ch7;
      if (!c) return { active: false };
      const revealed = ran(s), base = { active: true, id: c.id, scenario: c.id, revealed, cost: studyOf(s)?.capex ?? s.budget.spent, status: s.status, predictions: Object.fromEntries(s.metrics.predictions.map((p) => [p.id, p.predicted])), capex: s.budget.spent, capexText: formatMoney(s.budget.spent, REGIONS.get(s.region), { decimals: 0 }), budgetText: formatMoney(s.budget.capexLimit, REGIONS.get(s.region), { decimals: 0 }), budget: s.budget.capexLimit };
      if (c.id === 'L23') {
        const d = c.l23!, st = studyL23(d), f = st.fault;
        return {
          ...base, design: d, ratingKA: d.rating,
          givens: { baseMVA: SC.l23.baseMVA, kv: SC.l23.kv, gridMVA: SC.l23.gridSscMVA, gridZ: r3(SC.l23.baseMVA / SC.l23.gridSscMVA), xfmrMVA: SC.l23.xfmr.mva, uk: d.uk, xfmrZ: r3((d.uk / 100) * SC.l23.baseMVA / SC.l23.xfmr.mva), genMVA: SC.l23.gen.mva, xdd: SC.l23.gen.xdd, genZ: r3(SC.l23.gen.xdd * SC.l23.baseMVA / SC.l23.gen.mva), kaPerPu: r3(SC.l23.baseMVA / (Math.sqrt(3) * SC.l23.kv)), reactor: d.reactor, coupler: d.coupler },
          n1: { secure: st.n1Secure, vPu: r3(st.n1VPu) }, preGensKA: r1(preGensKA()), gens: SC.l23.gen.count,
          // the prediction stays hidden until the run: fault kA, MVA, impedance and the duty table
          ...(revealed ? { faultKA: r2(f.threePhKA), faultMVA: Math.round(f.mva), zthPu: r3(f.zth), ok: st.ok, dutyRatio: r3(st.dutyRatio), duty: f.duty.map((x) => ({ id: x.id, role: x.role, kA: r2(x.kA), over: x.kA > d.rating })), sequence: st.sequence.map((e) => ({ ...e, tS: r3(e.tS) })), ensMWh: Math.round(st.ensMWh) } : {}),
        };
      }
      if (c.id === 'L24') {
        const d = c.l24!, st = studyL24(d), lo = 80, hi = 8000;
        return {
          ...base, design: d, is: st.is.map((x) => Math.round(x)), ct: SC.l24.ctA, loadA: SC.l24.loadA, ctiS: SC.l24.ctiS,
          faults: st.faults.map((f) => ({ id: f.id, section: f.section, amps: Math.round(f.amps), times: f.times.map(fin), nearestS: fin(f.nearestS), marginS: fin(f.marginS), burnt: f.burnt })),
          curves: d.relays.map((r, k) => ({ relay: `R${k + 1}`, is: Math.round(st.is[k]!), pts: curvePoints(r.curve, r.tms, st.is[k]!, lo, hi) })),
          limits: SC.l24.sections.map((x, k) => ({ section: k + 1, mm2: x.mm2, pts: [200, 400, 800, 1600, 3200, 6400].map((i) => [i, r3(dmath.pow(SC.l24.kAlu * x.mm2 / i, 2))]) })),
          totalS: fin(st.totalS), minMarginS: r3(st.minMarginS), kind: st.kind, ok: st.kind === null, avoidableEnsMWh: r1(st.avoidableEnsMWh), curveConst: IDMT_CURVES,
        };
      }
      if (c.id === 'L25') {
        const d = c.l25!, st = studyL25(d), cr = critical(), inp = smibInput(st.clearS);
        const curves = pDeltaCurves(inp, 91);
        const clearRad = (st.swing.clearAtDeg * Math.PI) / 180;
        const ea = equalAreas(inp, clearRad, clearRad);
        return {
          ...base, design: d, f0: SC.l25.f0, Pm: SC.l25.Pm, tCrMs: Math.round(cr.tCrS * 1000), relayMs: Math.round(st.relayS * 1000), breakerMs: Math.round(st.breakerS * 1000), clearMs: Math.round(st.clearS * 1000),
          relays: Object.entries(SC.l25.relays).map(([id, r]) => ({ id, kind: r.kind, price: r.price })), cycles: SC.l25.breakerCycles,
          curves: { deltaDeg: curves.deltaRad.map((x) => r1((x * 180) / Math.PI)), pre: curves.pePre.map(r3), during: curves.peDuring.map(r3), post: curves.pePost.map(r3), pm: curves.pm },
          ...(revealed ? {
            tCrMs: Math.round(cr.tCrS * 1000), deltaCrDeg: r2(cr.deltaCrDeg), delta0Deg: r2(cr.delta0Deg), deltaUDeg: r2(cr.deltaUDeg), marginMs: Math.round(st.marginMs), stable: st.stable, peakDeg: r1(st.swing.maxDeg), tLossS: st.swing.tLossS,
            clearAtDeg: r2(st.swing.clearAtDeg), a1: r3(ea.a1), a2Available: r3(ea.a2Available), trace: { t: st.swing.t.map((x) => r3(x)), deltaDeg: st.swing.deltaDeg.map(r1), omega: st.swing.omega.map((x) => Math.round(x * 1e5) / 1e5) } } : {}),
        };
      }
      if (c.id === 'L26') {
        const d = c.l26!, st = studyL26(d, revealed), h = hydroSchedule();
        const hourly = (a: number[]): number[] => Array.from({ length: 24 }, (_, i) => r1((a[4 * i]! + a[4 * i + 1]! + a[4 * i + 2]! + a[4 * i + 3]!) / 4));
        return {
          ...base, design: d, plants: PLANTS.map((k) => ({ id: k, ...SC.l26.plants[k]!, window: d.windows[k] })), corridorMW: SC.l26.corridorMW, corridorOpMW: SC.l26.corridorOpFrac * SC.l26.corridorMW, hydroMW: hourly(h.p), waterValue: r2(h.nu),
          demandMW: hourly(Array.from({ length: 96 }, (_, b) => SC.l26.demandHourlyMW[Math.floor(b / 4)]!)), solarMW: hourly(Array.from({ length: 96 }, (_, b) => SC.l26.solarHourlyMW[Math.floor(b / 4)]!)),
          ...(revealed ? {
            costUSD: Math.round(st.costUSD), costText: money(s, st.costUSD), ensMWh: r1(st.ensMWh), surplusMWh: r1(st.surplusMWh), kind: st.kind, trip: st.trip ? { time: hhmm(st.trip.block / 4), flowMW: Math.round(st.trip.flowMW) } : null, maxFlowMW: Math.round(st.maxFlowMW),
            lambda20: { g: st.lam20.g === null ? null : r2(st.lam20.g), s: st.lam20.s === null ? null : r2(st.lam20.s), flowMW: Math.round(st.lam20.flowMW) },
            hourly: { flow: hourly(st.detail!.flow), lamG: hourlyN(st.detail!.lamG), lamS: hourlyN(st.detail!.lamS), p: Object.fromEntries(PLANTS.map((k) => [k, hourly(st.detail!.p[k]!)])), hydro: hourly(st.detail!.hydro), solar: hourly(st.detail!.solar), demand: hourly(st.detail!.demand) },
          } : {}),
        };
      }
      const d = c.l27!, st = studyL27(d), engineer = s.mode === 'engineer';
      const qs = examQuestions(engineer);
      return {
        ...base, design: d, ratings: SC.l27.breakerRatingsKA,
        givens: { ps17: SC.l27.textbook.ps17, ps18: SC.l27.textbook.ps18, ps24: SC.l27.textbook.ps24, units: SC.l27.ed.units, demandNoLimitsMW: SC.l27.ed.demandNoLimitsMW, demandMW: SC.l27.ed.demandMW, tonightH: SC.l27.ed.tonightH, ps22: SC.l27.textbook.ps22 },
        units: SC.l27.ed.units, demandMW: SC.l27.ed.demandMW,
        // the grown board's sequence impedances: the breaker rating is worked out from these, not guessed (a 1.6 tester could not derive it)
        board: (() => { const g = grownBoard(); return { z1: Number(g.z1.toFixed(4)), z2: Number(g.z2.toFixed(4)), z0: Number(g.z0.toFixed(4)), baseMVA: 100, kv: 33, ibKA: Number((100 / (Math.sqrt(3) * 33)).toFixed(3)) }; })(),
        questions: qs.map((q) => { const p = s.metrics.predictions.find((x) => x.id === q.id); return { id: q.id, unitKey: q.unitKey, predicted: p ? p.predicted : null, ...(revealed ? { actual: Number(q.actual.toFixed(q.dp)), within: p ? Math.abs((p.predicted - q.actual) / q.actual) * 100 <= SC.l27.predictTolPct : false } : {}) }; }),
        ...(revealed ? { boardKA: { threePh: r2(st.boardKA.threePh), slg: r2(st.boardKA.slg) }, ratingOk: st.ratingOk, dispatch: { sumMW: r1(st.dispatch.sumMW), costPerH: r2(st.dispatch.costPerH), optCostPerH: r2(st.dispatch.optCostPerH), ok: st.dispatch.ok } } : {}),
      };
    },
    /** What the tray offers: part lists and prices (money already formatted for the region). */
    ch7Kit: (s) => {
      const c = s.ch7;
      if (!c) return { active: false };
      const m = c.money, f = (x: number): string => formatMoney(x * m, REGIONS.get(s.region), { decimals: 0 });
      if (c.id === 'L23') return { active: true, id: c.id, ratings: SC.l23.breakers.ratingsKA.map((k, i) => ({ kA: k, each: f(SC.l23.breakers.price[i]!) })), count: SC.l23.breakers.count, reactors: SC.l23.reactorX.map((x, i) => ({ x, price: f(SC.l23.reactorPrice[i]!) })), xfmr: SC.l23.xfmr.ukPct.map((u, i) => ({ uk: u, extra: f(SC.l23.xfmr.extraPrice[i]!) })) };
      if (c.id === 'L24') return { active: true, id: c.id, curves: ['SI', 'VI', 'EI'], pickups: [75, 100, 125, 150], tms: SC.l24.tmsRange, relayPrice: f(SC.l24.relayPrice), ct: SC.l24.ctA, loadA: SC.l24.loadA };
      if (c.id === 'L25') return { active: true, id: c.id, relays: Object.entries(SC.l25.relays).map(([id, r]) => ({ id, kind: r.kind, price: f(r.price), ...(r.kind === 'idmt' ? { curve: r.curve, tms: r.tms } : { delayMs: Math.round(r.delayS! * 1000) }) })), cycles: SC.l25.breakerCycles.map((n) => ({ n, ms: Math.round((n / SC.l25.f0) * 1000), price: f(SC.l25.breakerPrice[String(n)]!) })), reclose: f(SC.l25.reclosePrice) };
      if (c.id === 'L26') return { active: true, id: c.id, plants: PLANTS.map((k) => ({ id: k, ...SC.l26.plants[k]!, startCost: f(SC.l26.plants[k]!.startCost), windows: SC.l26.windows[k] })), modes: ['merit', 'lambda', 'corridor'] };
      return { active: true, id: c.id, ratings: SC.l27.breakerRatingsKA.map((k, i) => ({ kA: k, each: f(SC.l27.breakerPrice[i]!) })), units: SC.l27.ed.units, demandMW: SC.l27.ed.demandMW };
    },
  };
}
const hourlyN = (a: (number | null)[]): (number | null)[] => Array.from({ length: 24 }, (_, i) => { const v = a.slice(4 * i, 4 * i + 4).filter((x): x is number => x !== null); return v.length ? r2(v.reduce((x, y) => x + y, 0) / v.length) : null; });

// ---- the shift report ------------------------------------------------------------------------------------------------------------------
/** The consolidation line, in the player's own numbers (every printed number recomputes from the others). Empty until the event has run. */
export function ch7Lesson(s: GridState, lessonKey: string): string {
  const c = s.ch7;
  if (!c || !ran(s)) return '';
  if (c.id === 'L23') {
    const st = studyL23(c.l23!), f = st.fault, ib = 100 / (Math.sqrt(3) * SC.l23.kv), zp = f.zth, ipu = 1 / zp;
    const gk = (1 / (SC.l23.gen.xdd * (100 / SC.l23.gen.mva))) * ib;
    const verdict = st.ok ? t('level.L23.lessonOk', { rated: st.rating, margin: r1(st.rating - f.threePhKA) }) : t('level.L23.lessonBad', { rated: st.rating, over: r1(f.threePhKA - st.rating) });
    return t(lessonKey, { z: Math.round(zp * 1e4) / 1e4, ipu: r2(ipu), ib: r3(ib), ka: r1(f.threePhKA), mva: Math.round(f.mva), pre: r1(preGensKA()), gk: r1(gk), n: SC.l23.gen.count }) + ' ' + verdict;
  }
  if (c.id === 'L24') {
    const st = studyL24(c.l24!), w = st.faults.filter((x) => x.worstUp !== null).sort((a, b) => a.marginS - b.marginS)[0];
    if (!w) return '';
    const k = w.section - 1, dn = c.l24!.relays[k]!, up = c.l24!.relays[w.worstUp!]!, cv = IDMT_CURVES[dn.curve], tdn = w.times[k]!, tup = w.times[w.worstUp!]!;
    return t(lessonKey, { fault: w.id, amps: Math.round(w.amps), dn: k + 1, curve: dn.curve, tms: dn.tms, kk: cv.k, a: cv.alpha, is: Math.round(st.is[k]!), tdn: r3(tdn), up: w.worstUp! + 1, tup: r3(tup), gap: r3(tup - tdn), cti: SC.l24.ctiS, upCurve: up.curve });
  }
  if (c.id === 'L25') {
    const st = studyL25(c.l25!);
    return t(lessonKey, { relay: Math.round(st.relayS * 1000), brk: Math.round(st.breakerS * 1000), n: c.l25!.cycles, f0: SC.l25.f0, clear: Math.round(st.clearS * 1000), tcr: Math.round(st.tCrS * 1000), dcr: r1(st.deltaCrDeg), margin: Math.round(st.marginMs), d0: r1(st.delta0Deg), du: r1(st.deltaUDeg) }) + ' ' + (st.stable ? t('level.L25.lessonStable', { peak: Math.round(st.swing.maxDeg) }) : t('level.L25.lessonSlip', { t: r2(st.swing.tLossS ?? 0), du: Math.round(st.deltaUDeg) }));
  }
  if (c.id === 'L26') {
    const d = c.l26!, un = studyL26({ ...d, mode: 'lambda' }), st = studyL26(d), F = SC.l26.corridorMW, ls = st.lam20.s, lg = st.lam20.g;
    return t(lessonKey, { flow: Math.round(un.lam20.flowMW), cap: F, op: Math.round(F * SC.l26.corridorOpFrac), ls: ls === null ? '-' : pr(s, ls), lg: lg === null ? '-' : pr(s, lg), diff: ls === null || lg === null ? '-' : pr(s, ls - lg), nu: pr(s, hydroSchedule().nu) });
  }
  const st = studyL27({ rating: c.l27!.rating, dispatch: c.l27!.dispatch }), ok = studyOf(s)?.track.predictionsOk ?? 0, a = examAnswers();
  return t(lessonKey, { three: r1(st.boardKA.threePh), slg: r1(st.boardKA.slg), lam: r2(a.ps21.lambda), ok, n: studyOf(s)?.track.predictionsMade ?? 0 });
}

/** What to try after a loss, from the same numbers the verdict used. */
export function ch7TryHint(s: GridState): string {
  const c = s.ch7;
  if (!c || s.status !== 'lost') return '';
  if (s.budget.capexLimit > 0 && s.budget.spent > s.budget.capexLimit) return t('level.ch7.tryBudget');
  if (c.id === 'L23' || c.id === 'L27') {
    if (c.id === 'L27') { const st = studyL27(c.l27!); return st.ratingOk ? t('level.L27.tryDispatch') : t('level.L27.tryRating', { ka: r1(st.boardKA.duty), next: SC.l27.breakerRatingsKA.find((x) => x >= st.boardKA.duty) ?? 63 }); }
    const d = c.l23!, st = studyL23(d);
    if (st.ok) return '';
    const at = (over: Partial<typeof d>): number => studyL23({ ...d, ...over }).fault.threePhKA;
    const next = SC.l23.breakers.ratingsKA.find((x) => x >= st.fault.threePhKA);
    return t('level.L23.try', { ka: r1(st.fault.threePhKA), next: next ?? 40, split: r1(at({ coupler: 'open' })), react: r1(at({ coupler: 'closed', reactor: 0.1 })), uk: r1(at({ uk: 14 })) });
  }
  if (c.id === 'L24') {
    const st = studyL24(c.l24!), b = st.bad;
    if (!b) return '';
    if (st.kind === 'nuisance') return t('level.L24.tryNuisance', { is: Math.round(SC.l24.pickupLoadFactor * SC.l24.loadA[b.relay]!), relay: b.relay + 1 });
    if (st.kind === 'burnt') return t('level.L24.tryBurnt', { relay: b.relay + 1 });
    if (st.kind === 'blind') return t('level.L24.tryBlind', { relay: b.relay + 1 });
    return t('level.L24.tryGrade', { down: st.faults.find((x) => x.id === b.fault)!.section, up: b.relay + 1 });
  }
  if (c.id === 'L25') {
    const st = studyL25(c.l25!);
    return st.stable ? '' : t('level.L25.try', { clear: Math.round(st.clearS * 1000), tcr: Math.round(st.tCrS * 1000), need: Math.round((st.clearS - st.tCrS) * 1000) + 1 });
  }
  const st = studyL26(c.l26!);
  return st.kind === 'congestion' ? t('level.L26.tryCorridor', { limit: SC.l26.corridorMW }) : t('level.L26.tryCommit');
}
