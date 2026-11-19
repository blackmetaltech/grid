// Chapter 8 queries: the study of the design as it stands (what the instruments draw: the feeder tree with per-node voltage, per-section current and expected outages, the TCC curves,
// the transformer thermometer, the hosting number), the kit (prices and options for the tray), and the shift report's lesson and "what to try" lines in the player's own numbers.
// Before the run the answers of the exam bridge (L36) stay hidden; every other level shows its numbers live, because the design loop IS the lesson.
import { dmath } from '@core/numerics';
import type { QueryFn } from '@core/kit';
import { t } from '../../i18n';
import { formatMoney } from '@core/regions';
import { REGIONS } from '../../regions';
import type { GridState } from '../../types';
import { CONDUCTORS, coordination, fuseK, recloserPair, recloserTime, fuseMinMelt, fuseTotalClear } from '../../sim/distrib';
import { L31, L35, L32, L33, L34, L36, L35S, REGULATOR, CONDUCTOR_PRICE_KM, TAPS, V_LO_PU, V_NOM, r1, r2, r3 } from '../../sim/ch8/data';
import { studyVoltage, studyPv, handDropPct, custId, trunkId } from '../../sim/ch8/feeder';
import { studyL32, l32Sections } from '../../sim/ch8/reliab';
import { studyL33 } from '../../sim/ch8/protect';
import { studyL34 } from '../../sim/ch8/subst';
import { examAnswers } from '../../sim/ch8/exam';
import { studyOf, errPct } from '../../sim/ch8/study';
import type { FeederDesign } from '../../sim/ch8/state';

const money = (s: GridState, x: number): string => formatMoney(x * (s.ch8?.money ?? 1), REGIONS.get(s.region), { decimals: 0 });
const ran = (s: GridState): boolean => s.tick > s.levelStart;
/** JSON-safe: Infinity and NaN become null. */
const fin = (x: number): number | null => (Number.isFinite(x) ? x : null);
const cond = (id: string) => CONDUCTORS.find((c) => c.id === id)!;
const hh = (h: number): string => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;

const logPoints = (f: (i: number) => number, lo: number, hi: number, n = 40): [number, number | null][] =>
  Array.from({ length: n }, (_, k) => { const a = lo * dmath.pow(hi / lo, k / (n - 1)); const v = f(a); return [r1(a), Number.isFinite(v) ? r3(v) : null] as [number, number | null]; });

/** The feeder tree for the diagram: one entry per trunk node with its section, customers, tap and the studied voltages. */
function feederTree(sc: typeof L31, d: FeederDesign, hi: number) {
  const st = studyVoltage(sc, d, hi);
  return {
    st,
    nodes: sc.nodes.map((n, i) => {
      const sec = st.peak.sections.find((x) => x.id === trunkId(n))!, c = cond(d.cond[i]!);
      return { id: n.id, parent: i === 0 ? 'src' : sc.nodes[i - 1]!.id, km: n.km, customers: n.customers, kw: n.kw, kva: n.kva, conductor: d.cond[i], ampacityA: c.ampacityA, tap: d.tap[i], regulator: d.reg?.at === i ? d.reg.vSetPu : null,
        currentA: r1(sec.currentA), loading: r2(sec.currentA / c.ampacityA), dropPct: r2(sec.dropPu * 100), lossKw: r1(sec.pLossKw), vPeakV: r1(st.vPeak[i]!), vMinLoadV: r1(st.vMin[i]!), trunkVPeakPu: r3(st.peak.byId[trunkId(n)]!.vPu), custId: custId(n) };
    }),
  };
}

export function buildCh8Queries(): Record<string, QueryFn<GridState>> {
  return {
    /** The live study of the running chapter-8 level: design echo, costs and the instrument data of the level. */
    ch8Study: (s) => {
      const c = s.ch8;
      if (!c) return { active: false };
      const hi = c.vHiPu, base = { active: true, id: c.id, scenario: c.id, revealed: ran(s), cost: studyOf(s)?.capex ?? s.budget.spent, status: s.status, predictions: Object.fromEntries(s.metrics.predictions.map((p) => [p.id, p.predicted])), capex: s.budget.spent, capexText: formatMoney(s.budget.spent, REGIONS.get(s.region), { decimals: 0 }), budgetText: formatMoney(s.budget.capexLimit, REGIONS.get(s.region), { decimals: 0 }), budget: s.budget.capexLimit,
        band: { loV: r1(V_LO_PU * V_NOM), hiV: r1(hi * V_NOM), nominalV: V_NOM, loPu: V_LO_PU, hiPu: hi } };
      if (c.id === 'L31') {
        const d = c.l31!, { st, nodes } = feederTree(L31, d, hi);
        return { ...base, design: d, kV: L31.kV, tree: nodes, voltage: { minV: r1(st.minV), minNode: st.minNode, maxV: r1(st.maxV), maxNode: st.maxNode, marginLoV: r1(st.marginLoPu * V_NOM), marginHiV: r1(st.marginHiPu * V_NOM), ok: st.marginPu >= 0 }, lossPct: r2(st.lossPct), lossKw: r1(st.lossKw), handDropPct: r2(handDropPct(L31, d)), sweepDropPct: r2((1 - st.peak.byId[custId(L31.nodes[4]!)]!.vPu) * 100), loadingMax: r2(st.loadingMax), regulator: d.reg ? { node: L31.nodes[d.reg.at]!.id, vSetPu: d.reg.vSetPu, stepsPeak: st.regStepPeak, stepsMinLoad: st.regStepMin, maxSteps: REGULATOR.maxSteps } : null, minLoadPct: 30 };
      }
      if (c.id === 'L32') {
        const d = c.l32!, st = studyL32(d), r = st.rel;
        return { ...base, design: d, indices: { saifi: r2(r.saifi), saidi: r1(r.saidi), caidi: r1(r.caidi), ensMWh: r2(r.ensMWh), faultsPerYear: r2(r.faultsPerYear), customers: r.customers }, targets: { saidiMax: L32.saidiMaxMin, saifiMax: L32.saifiMax, ensStar: L32.ensStarMWh }, used: st.used, maxSectionalisers: L32.maxSectionalisers,
          sections: l32Sections(d).map((x, i) => ({ id: x.id, parent: x.parent, km: x.lengthKm, customers: x.customers, kw: x.avgLoadKw, device: x.device ?? 'none', tie: !!x.tie, faultsPerYear: r3(r.sections[i]!.faultsPerYear), customerInterruptions: r1(r.sections[i]!.customerInterruptions), customerMinutes: Math.round(r.sections[i]!.customerMinutes), saidiMin: r1(r.sections[i]!.saidiMin), saifi: r3(r.sections[i]!.saifi), ensMWh: r2(r.sections[i]!.ensMWh) })),
          outageH: r.outageH, repairH: L32.repairH, switching: L32.times, momentaryH: r3(5 / 60) };
      }
      if (c.id === 'L33') {
        const d = c.l33!, st = studyL33(d), { fast, slow } = recloserPair(d.pickupA, d.fastTd, d.slowTd);
        return { ...base, design: d, kind: st.kind, marginS: r3(st.marginS), marginStarS: L33.marginStarS, headLoadA: L33.headLoadA, blowsPerYear: r2(st.blowsPerYear), tempFaultShare: L33.tempFaultShare,
          recloser: { fast: logPoints((i) => recloserTime(fast, i), 100, 5000), slow: logPoints((i) => recloserTime(slow, i), 100, 5000) },
          spurs: st.spurs.map((sp) => { const f = fuseK(sp.fuseA); return { id: sp.id, fuseA: sp.fuseA, loadA: L33.spurs.find((x) => x.id === sp.id)!.loadA, iMinA: sp.iMinA, iMaxA: sp.iMaxA, customers: L33.spurs.find((x) => x.id === sp.id)!.customers, ok: sp.ok, fastMarginS: r3(sp.worstFastS), slowMarginS: r3(sp.worstSlowS), fuseLoadOk: sp.fuseLoadOk, seesEnd: sp.seesEnd, fuseMelts: sp.fuseMelts,
            minMelt: logPoints((i) => fuseMinMelt(f, i), 100, 5000), totalClear: logPoints((i) => fuseTotalClear(f, i), 100, 5000), range: sp.coord.range ? { lowA: Math.round(sp.coord.range.lowA), highA: Math.round(sp.coord.range.highA) } : null }; }) };
      }
      if (c.id === 'L34') {
        const d = c.l34!, st = studyL34(d), at = (a: number[]): number[] => a.map((x) => r1(x));
        return { ...base, design: d, n: st.n, sizeMva: d.sizeMva, firmMva: r1(st.firmMva), totalMva: r1(st.totalMva), peakMva: L34.peakMva, shortfallMva: r1(st.shortfallMva), ambientC: L34.ambientC, hotLimitC: L34.hotSpotLimitC, restoreWithinH: L34.restoreWithinH, lolStarDays: L34.lolStarDays,
          hotPeakC: r1(st.hotPeakC), hotPeakAt: hh(L34.tripHour + st.hotPeakAtH), lolDays: r2(st.lolDays), restoredAtH: r2(st.restoredAtH), unservedMWh: r1(st.unservedMWh), overheat: st.overheat, notRestored: st.notRestored, tripHour: L34.tripHour, stepMin: 15,
          day: { loadMva: at(st.loadMva), servedMva: at(st.servedMva), hotC: at(st.hot), topOilC: at(st.topOil), ageing: st.ageing.map((x) => r2(x)) } };
      }
      if (c.id === 'L35') {
        const d = c.l35!, f = d.feeder, tree = feederTree(L35, f, hi);
        const p = studyPv(L35, f, { pvKw: d.pvLimitKw, oltcSetPu: d.oltcSetPu, ldc: d.ldc, voltVar: d.voltVar, sites: L35S.pvNodes, noonLoad: L35S.noonLoadFrac, eveningLoad: L35S.eveningLoadFrac }, hi, L35S.oltc, true);
        const cs = L35.nodes.map((n) => custId(n));
        return { ...base, design: d, tree: tree.nodes, pvNodes: L35S.pvNodes, minPvKw: L35S.minPvKw, starPvKw: L35S.starPvKw,
          noon: { vV: cs.map((id) => r1(p.noon.byId[id]!.vPu * V_NOM)), maxV: r1(p.maxV), maxNode: p.maxNode, oltcStep: p.noon.oltcStep, sourcePu: r3(p.noon.vSourceUsed), headKw: Math.round(p.noon.sourceKw), reverseFlow: p.reverseFlow, qKvar: Object.fromEntries(Object.entries(p.noon.siteQkvar).map(([k, v]) => [k, Math.round(v)])) },
          evening: { vV: cs.map((id) => r1(p.evening.byId[id]!.vPu * V_NOM)), minV: r1(p.minV), minNode: p.minNode, oltcStep: p.evening.oltcStep, sourcePu: r3(p.evening.vSourceUsed), headKw: Math.round(p.evening.sourceKw) },
          hostingKw: Math.round(p.hostingKw), hostingLimitedBy: p.hostingLimitedBy, marginHiV: r1(p.marginHiPu * V_NOM), marginLoV: r1(p.marginLoPu * V_NOM), ok: p.marginPu >= 0 && d.pvLimitKw >= L35S.minPvKw };
      }
      const d = c.l36!, a = examAnswers(), revealed = ran(s), qs = ['dropPct', 'saifi', 'saidi'].map((id) => { const p = s.metrics.predictions.find((x) => x.id === id); const act = id === 'dropPct' ? a.dropPct : id === 'saifi' ? a.saifi : a.saidi; return { id, predicted: p ? p.predicted : null, ...(revealed ? { actual: r2(act), errPct: p ? r2(errPct(p.predicted, act)) : null, within5: p ? errPct(p.predicted, act) <= L36.tolPct : false, within1: p ? errPct(p.predicted, act) <= L36.tolStarPct : false } : {}) }; });
      const cc = cond(L36.conductor);
      return { ...base, design: d, givens: { kV: L36.kV, conductor: L36.conductor, rOhmKm: cc.rOhmKm, xOhmKm: cc.xOhmKm, lambdaPerKm: L36.lambdaPerKm, repairH: L36.repairH, manualH: L36.manualH, sections: L36.sections.map((x) => ({ id: x.id, parent: x.parent, km: x.km, customers: x.customers, kw: x.kw, kvar: x.kvar, device: x.device })) },
        questions: qs, why: { chosen: d.why, choices: L36.whyChoices.map((id) => ({ id, text: t(id === 'dv-rp-xq' ? 'ch8.why.dv-rp-xq' : id === 'dv-ir-only' ? 'ch8.why.dv-ir-only' : 'ch8.why.dv-pf-only') })) },
        ...(revealed ? { answers: { dropPct: r2(a.dropPct), saifi: r3(a.saifi), saidi: r1(a.saidi), caidi: r1(a.caidi) }, whyOk: d.why === L36.whyRight } : {}) };
    },
    /** What the tray offers: part lists and prices (money already formatted for the region). */
    ch8Kit: (s) => {
      const c = s.ch8;
      if (!c) return { active: false };
      const f = (x: number): string => money(s, x);
      if (c.id === 'L31' || c.id === 'L35') {
        const feeder = { conductors: CONDUCTORS.map((x) => ({ id: x.id, mm2: x.mm2, rOhmKm: x.rOhmKm, xOhmKm: x.xOhmKm, ampacityA: x.ampacityA, perKm: f(CONDUCTOR_PRICE_KM[x.id] ?? 0) })), taps: TAPS, regulator: { price: f(REGULATOR.price), vSetOptions: REGULATOR.vSetOptions, stepPct: REGULATOR.stepPct, maxSteps: REGULATOR.maxSteps } };
        return c.id === 'L31' ? { active: true, id: c.id, ...feeder } : { active: true, id: c.id, ...feeder, pvLimitsKw: L35S.pvLimitsKw, oltcSetOptions: L35S.oltcSetOptions, ldcPrice: f(L35S.price.oltcLdc), voltVarPrice: f(L35S.price.voltVar) };
      }
      if (c.id === 'L32') return { active: true, id: c.id, sites: L32.sectionaliserSites, spurs: L32.spurs, max: L32.maxSectionalisers, manual: { price: f(L32.price.manual), hours: L32.times.manualH }, remote: { price: f(L32.price.remote), minutes: Math.round(L32.times.remoteH * 60) }, fuse: f(L32.price.fuse), tie: { price: f(L32.price.tie), kw: L32.tie.capacityKw, minutes: Math.round(L32.tie.closeH * 60) } };
      if (c.id === 'L33') return { active: true, id: c.id, pickups: L33.pickupOptions, fastTd: L33.fastTdOptions, slowTd: L33.slowTdOptions, fastShots: L33.fastShotsOptions, fuseLinks: L33.fuseOptions, spurs: L33.spurs, headLoadA: L33.headLoadA };
      if (c.id === 'L34') return { active: true, id: c.id, sizes: L34.sizes.map((x) => ({ mva: x, each: f(L34.sizePrice[x]!) })), third: f(L34.sizePrice[c.l34!.sizeMva]! + L34.thirdBay), bus: { manualH: L34.busSection.manualH, auto: f(L34.busSection.price) }, ties: Object.entries(L34.ties).map(([id, x]) => ({ id, mva: x.mva, minutes: Math.round(x.h * 60), price: f(x.price) })), dr: Object.entries(L34.dr).map(([id, x]) => ({ id, mva: x.mva, price: f(x.price) })) };
      return { active: true, id: c.id, ids: ['dropPct', 'saifi', 'saidi'], whyChoices: L36.whyChoices };
    },
  };
}

// ---- the shift report ------------------------------------------------------------------------------------------------------------------
/** The consolidation line, in the player's own numbers (every printed number recomputes from the others). Empty until the run. */
export function ch8Lesson(s: GridState, lessonKey: string): string {
  const c = s.ch8;
  if (!c || !ran(s)) return '';
  const hi = c.vHiPu;
  if (c.id === 'L31') {
    const d = c.l31!, st = studyVoltage(L31, d, hi), far = (1 - st.peak.byId[custId(L31.nodes[4]!)]!.vPu) * 100;
    const tapped = d.tap.filter((x) => x !== 0).length;
    return t(lessonKey, { hand: r1(handDropPct(L31, d)), drop: r1(far), v: r1(st.minV), node: st.minNode, vmax: r1(st.maxV), lo: r1(V_LO_PU * V_NOM), hi: r1(hi * V_NOM), loss: r1(st.lossPct), taps: tapped, steps: st.regStepPeak, reg: d.reg ? 1 : 0 });
  }
  if (c.id === 'L32') {
    const st = studyL32(c.l32!), r = st.rel;
    return t(lessonKey, { saifi: r2(r.saifi), caidi: r1(r.caidi), saidi: r1(r.saidi), ens: r1(r.ensMWh), faults: r2(r.faultsPerYear), n: r.customers, worst: st.worst.id, worstMin: r1(st.worst.saidiMin), momentary: Math.round(5) });
  }
  if (c.id === 'L33') {
    const st = studyL33(c.l33!), b = st.spurs.reduce((a, x) => (x.marginS < a.marginS ? x : a)), pt = b.coord.points.reduce((a, p) => (Math.min(p.marginFast, p.marginSlow) < Math.min(a.marginFast, a.marginSlow) ? p : a));
    return t(lessonKey, { spur: b.id, amps: Math.round(pt.currentA), fast: r3(pt.tFast), mm: r3(pt.tMM), slow: r3(pt.tSlow), tc: r3(pt.tTC), mf: r3(pt.marginFast), ms: r3(pt.marginSlow), fuse: b.fuseA, blows: r1(st.blowsPerYear) });
  }
  if (c.id === 'L34') {
    const st = studyL34(c.l34!);
    return t(lessonKey, { firm: r1(st.firmMva), peak: L34.peakMva, hot: r1(st.hotPeakC), at: hh(L34.tripHour + st.hotPeakAtH), lol: r2(st.lolDays), rate: r1(dmath.pow(2, (st.hotPeakC - 98) / 6)), back: r2(st.restoredAtH), mwh: r1(st.unservedMWh), lim: L34.hotSpotLimitC });
  }
  if (c.id === 'L35') {
    const d = c.l35!, p = studyPv(L35, d.feeder, { pvKw: d.pvLimitKw, oltcSetPu: d.oltcSetPu, ldc: d.ldc, voltVar: d.voltVar, sites: L35S.pvNodes, noonLoad: L35S.noonLoadFrac, eveningLoad: L35S.eveningLoadFrac }, hi, L35S.oltc, true);
    return t(lessonKey, { pv: d.pvLimitKw, vmax: r1(p.maxV), hi: r1(hi * V_NOM), vmin: r1(p.minV), lo: r1(V_LO_PU * V_NOM), host: Math.round(p.hostingKw), rev: p.reverseFlow ? 1 : 0, head: Math.round(Math.abs(p.noon.sourceKw)), step: p.noon.oltcStep });
  }
  const a = examAnswers(), tr = studyOf(s)!.track, p = (id: string): number => s.metrics.predictions.find((x) => x.id === id)?.predicted ?? 0;
  return t(lessonKey, { drop: r2(a.dropPct), saifi: r2(a.saifi), saidi: r1(a.saidi), caidi: r1(a.caidi), pd: r2(p('dropPct')), ps: r2(p('saifi')), pm: r1(p('saidi')), err: r1(tr.predErrPct ?? 0), ok5: tr.predictionsOk5 ?? 0, ok1: tr.predictionsOk1 ?? 0 });
}

/** What to try after a loss, from the same numbers the verdict used. */
export function ch8TryHint(s: GridState): string {
  const c = s.ch8;
  if (!c || s.status !== 'lost') return '';
  if (s.budget.capexLimit > 0 && s.budget.spent > s.budget.capexLimit) return t('level.ch8.tryBudget');
  const key = s.block.verdictKey ?? '';
  if (c.id === 'L31') {
    if (key.endsWith('overload')) return t('level.L31.tryOverload');
    const st = studyVoltage(L31, c.l31!, c.vHiPu), low = st.marginLoPu <= st.marginHiPu;
    return low ? t('level.L31.tryLow', { reg: money(s, REGULATOR.price), steps: st.regStepPeak }) : t('level.L31.tryHigh');
  }
  if (c.id === 'L32') {
    const st = studyL32(c.l32!), r = st.rel;
    return t('level.L32.try', { saidi: r1(r.saidi), max: L32.saidiMaxMin, saifi: r2(r.saifi), maxF: L32.saifiMax, worst: st.worst.id, remote: Math.round(L32.times.remoteH * 60) });
  }
  if (c.id === 'L33') {
    const st = studyL33(c.l33!);
    if (st.kind === 'nuisance') return t('level.L33.tryNuisance', { need: Math.ceil(1.25 * L33.headLoadA) });
    if (st.kind === 'fuseLoad') return t('level.L33.tryFuseLoad');
    if (st.kind === 'blind') return t('level.L33.tryBlind');
    if (st.kind === 'fuseBlown') return t('level.L33.tryFast');
    return t('level.L33.tryGrade', { spur: st.bad?.id ?? '' });
  }
  if (c.id === 'L34') {
    const st = studyL34(c.l34!);
    return t('level.L34.try', { firm: r1(st.firmMva), peak: L34.peakMva, short: r1(st.shortfallMva) });
  }
  if (c.id === 'L35') {
    if (key.endsWith('pvShort')) return t('level.L35.tryPv', { need: L35S.minPvKw });
    const d = c.l35!, p = studyPv(L35, d.feeder, { pvKw: d.pvLimitKw, oltcSetPu: d.oltcSetPu, ldc: d.ldc, voltVar: d.voltVar, sites: L35S.pvNodes, noonLoad: L35S.noonLoadFrac, eveningLoad: L35S.eveningLoadFrac }, c.vHiPu, L35S.oltc, true);
    return p.marginHiPu <= p.marginLoPu ? t('level.L35.tryHigh', { host: Math.round(p.hostingKw) }) : t('level.L35.tryLow');
  }
  return t('level.L36.try');
}
