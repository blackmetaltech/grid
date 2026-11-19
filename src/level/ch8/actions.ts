// Chapter 8 actions (L31-L36). Each acts on `state.ch8` (the player's design), refuses with a teaching key when the level or the argument is wrong, re-prices the build and logs
// the action. The generic part gate only knows the older actions' argument positions, so the running level's part list is applied here too.
//   L31/L35 feeder: setConductor(section|'all', conductor), setTap(node|'all', pct), placeRegulator(node, vSetPu), removeRegulator()
//   L32 reliability: placeSwitch(section, 'none'|'manual'|'remote'), setFuse(spur, on), setTie(on)
//   L33 protection: setRecloser(pickupA, fastTd, slowTd, fastShots), setFuseLink(spur, kRating)
//   L34 substation: addTransformer(on), setTransformerSize(mva), setBusSection('manual'|'auto'), setTransfer('none'|'manual'|'remote'), setDemandResponse('none'|'small'|'large')
//   L35 sun: setPvLimit(kw), setOltc(setPu, ldc), setVoltVar(on)    L36: answerWhy(choice), plus the generic predict(id, value, unit)
import type { ActionFn, ActionResult } from '@core/kit';
import { t } from '../../i18n';
import type { GridState } from '../../types';
import type { GridLevelSpec } from '../spec';
import { L31, L32, L33, L34, L35, L35S, L36, REGULATOR, TAPS, CONDUCTOR_IDS, CONDUCTOR_PRICE_KM, type Ch8Id } from '../../sim/ch8/data';
import { ch8Step } from '../../sim/ch8/study';
import { sectionalisersUsed } from '../../sim/ch8/reliab';
import type { FeederDesign, SwitchKind, TieKind, DrKind } from '../../sim/ch8/state';

type Params = Record<string, string | number>;
const accept = (s: GridState, name: string, key: string, params: Params = {}): ActionResult => {
  s.actionLog.push({ tick: s.tick, name, key });
  if (s.actionLog.length > 200) s.actionLog.splice(0, s.actionLog.length - 200);
  return { ok: true, message: t(key, params), key, params };
};
const reject = (key: string, params: Params = {}): ActionResult => ({ ok: false, message: t(key, params), key, params });
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isStr = (x: unknown): x is string => typeof x === 'string';

export interface Ch8Deps { money: (s: GridState, amount: number) => string; specOf: (id: string) => GridLevelSpec | undefined }

export function buildCh8Actions(d: Ch8Deps): Record<string, ActionFn<GridState>> {
  const here = (s: GridState, ...want: Ch8Id[]): ActionResult | null => {
    if (!s.ch8) return reject('ch8.none');
    if (!want.includes(s.ch8.id)) return reject('ch8.otherLevel', { level: s.level ?? '' });
    return null;
  };
  const listed = (s: GridState, action: string, value: unknown): ActionResult | null => {
    const spec = s.level ? d.specOf(s.level) : undefined, list = spec?.allowed.parts[action];
    if (spec && list && !list.map(String).includes(String(value))) return reject('level.part.notAllowed', { part: String(value), level: spec.id });
    return null;
  };
  /** Re-study the design and show what the build costs now. */
  const price = (s: GridState): string => { ch8Step(s); return d.money(s, s.budget.spent); };
  const feederOf = (s: GridState): { sc: typeof L31; f: FeederDesign } => (s.ch8!.id === 'L31' ? { sc: L31, f: s.ch8!.l31! } : { sc: L35, f: s.ch8!.l35!.feeder });
  const nodeIdx = (sc: typeof L31, id: unknown): number[] | null => (id === 'all' ? sc.nodes.map((_, i) => i) : isStr(id) && sc.nodes.some((n) => n.id === id) ? [sc.nodes.findIndex((n) => n.id === id)] : null);
  const nodeList = (sc: typeof L31): string => sc.nodes.map((n) => n.id).join(', ');

  return {
    /** L31 / L35: the conductor of trunk section N1..N5 (or 'all'): Weasel (the line as it stands), Rabbit, Dog or Hyena. A rebuilt section is paid per km. */
    setConductor: (s, section: unknown, conductor: unknown) => {
      const e = here(s, 'L31', 'L35'); if (e) return e;
      const { sc, f } = feederOf(s), ix = nodeIdx(sc, section);
      if (!ix) return reject('ch8.node.unknown', { id: String(section), list: nodeList(sc) });
      if (!isStr(conductor) || !CONDUCTOR_IDS.includes(conductor)) return reject('ch8.cond.unknown', { cond: String(conductor), list: CONDUCTOR_IDS.join(', ') });
      const g = listed(s, 'setConductor', conductor); if (g) return g;
      for (const i of ix) f.cond[i] = conductor;
      return accept(s, 'setConductor', 'ch8.cond.ok', { section: String(section), cond: conductor, km: ix.reduce((a, i) => a + sc.nodes[i]!.km, 0), each: d.money(s, (CONDUCTOR_PRICE_KM[conductor] ?? 0) * s.ch8!.money), total: price(s) });
    },
    /** L31 / L35: the off-load tap of the distribution transformer at node N1..N5 (or 'all'), percent: -5, -2.5, 0, 2.5, 5. Positive raises the customers' voltage. */
    setTap: (s, node: unknown, pct: unknown) => {
      const e = here(s, 'L31', 'L35'); if (e) return e;
      const { sc, f } = feederOf(s), ix = nodeIdx(sc, node);
      if (!ix) return reject('ch8.node.unknown', { id: String(node), list: nodeList(sc) });
      if (!isNum(pct) || !TAPS.includes(pct)) return reject('ch8.tap.bad', { tap: String(pct), list: TAPS.join(', ') });
      for (const i of ix) f.tap[i] = pct;
      price(s);
      return accept(s, 'setTap', 'ch8.tap.ok', { node: String(node), tap: pct });
    },
    /** L31 / L35: a step voltage regulator (32 steps of 0.625 %) in the trunk section that feeds node N1..N5, regulating the node to vSetPu. */
    placeRegulator: (s, node: unknown, vSetPu: unknown) => {
      const e = here(s, 'L31', 'L35'); if (e) return e;
      const { sc, f } = feederOf(s), ix = nodeIdx(sc, node);
      if (!ix || node === 'all') return reject('ch8.node.unknown', { id: String(node), list: nodeList(sc) });
      const v = vSetPu === undefined ? 1 : vSetPu;
      if (!isNum(v) || !REGULATOR.vSetOptions.includes(v)) return reject('ch8.reg.bad', { vset: String(vSetPu), list: REGULATOR.vSetOptions.join(', ') });
      const g = listed(s, 'placeRegulator', node); if (g) return g;
      f.reg = { at: ix[0]!, vSetPu: v };
      return accept(s, 'placeRegulator', 'ch8.reg.ok', { node: String(node), vset: v, each: d.money(s, REGULATOR.price * s.ch8!.money), total: price(s) });
    },
    removeRegulator: (s) => {
      const e = here(s, 'L31', 'L35'); if (e) return e;
      feederOf(s).f.reg = null;
      return accept(s, 'removeRegulator', 'ch8.reg.removed', { total: price(s) });
    },

    /** L32: a sectionaliser at the upstream end of trunk section T2..T4: 'manual' (a crew drives out, about an hour), 'remote' (SCADA, about 3 minutes) or 'none'. */
    placeSwitch: (s, section: unknown, kind: unknown) => {
      const e = here(s, 'L32'); if (e) return e;
      if (!isStr(section) || !L32.sectionaliserSites.includes(section)) return reject('ch8.switch.site', { id: String(section), list: L32.sectionaliserSites.join(', ') });
      if (kind !== 'none' && kind !== 'manual' && kind !== 'remote') return reject('ch8.switch.kind', { kind: String(kind) });
      const l = s.ch8!.l32!, was = l.sect[section]!;
      l.sect[section] = kind as SwitchKind;
      if (sectionalisersUsed(l) > L32.maxSectionalisers) { l.sect[section] = was; return reject('ch8.switch.tooMany', { max: L32.maxSectionalisers }); }
      const g = listed(s, 'placeSwitch', kind); if (g) { l.sect[section] = was; return g; }
      return accept(s, 'placeSwitch', kind === 'none' ? 'ch8.switch.none' : 'ch8.switch.ok', { section, kind: kind === 'manual' ? t('ch8.kind.manual') : t('ch8.kind.remote'), each: d.money(s, (kind === 'none' ? 0 : L32.price[kind as 'manual' | 'remote']) * s.ch8!.money), used: sectionalisersUsed(l), max: L32.maxSectionalisers, total: price(s) });
    },
    /** L32: a fuse at the tap of spur P1..P3 (true) or none (false). */
    setFuse: (s, spur: unknown, on: unknown) => {
      const e = here(s, 'L32'); if (e) return e;
      if (!isStr(spur) || !L32.spurs.includes(spur)) return reject('ch8.fuse.spur', { id: String(spur), list: L32.spurs.join(', ') });
      if (typeof on !== 'boolean') return reject('act.arg', { name: 'on', expected: t('exp.true_or_false') });
      s.ch8!.l32!.fuse[spur] = on;
      return accept(s, 'setFuse', on ? 'ch8.fuse.on' : 'ch8.fuse.off', { spur, each: d.money(s, L32.price.fuse * s.ch8!.money), total: price(s) });
    },
    /** L32: the normally open tie from the feeder's far end to the next feeder (true) or none (false). */
    setTie: (s, on: unknown) => {
      const e = here(s, 'L32'); if (e) return e;
      if (typeof on !== 'boolean') return reject('act.arg', { name: 'on', expected: t('exp.true_or_false') });
      s.ch8!.l32!.tie = on;
      return accept(s, 'setTie', on ? 'ch8.tie.on' : 'ch8.tie.off', { kw: L32.tie.capacityKw, min: Math.round(L32.tie.closeH * 60), each: d.money(s, L32.price.tie * s.ch8!.money), total: price(s) });
    },

    /** L33: the head recloser: pickup (A), time dial of the fast and of the slow curve, and the number of fast shots before the slow ones (0 = no fast curve). */
    setRecloser: (s, pickupA: unknown, fastTd: unknown, slowTd: unknown, fastShots: unknown) => {
      const e = here(s, 'L33'); if (e) return e;
      if (!isNum(pickupA) || !L33.pickupOptions.includes(pickupA)) return reject('ch8.reclose.pickup', { a: String(pickupA), list: L33.pickupOptions.join(', ') });
      if (!isNum(fastTd) || !L33.fastTdOptions.includes(fastTd)) return reject('ch8.reclose.fast', { td: String(fastTd), list: L33.fastTdOptions.join(', ') });
      if (!isNum(slowTd) || !L33.slowTdOptions.includes(slowTd)) return reject('ch8.reclose.slow', { td: String(slowTd), list: L33.slowTdOptions.join(', ') });
      if (!isNum(fastShots) || !L33.fastShotsOptions.includes(fastShots)) return reject('ch8.reclose.shots', { n: String(fastShots), list: L33.fastShotsOptions.join(', ') });
      const g = listed(s, 'setRecloser', `${pickupA}/${fastTd}/${slowTd}/${fastShots}`); if (g) return g;
      Object.assign(s.ch8!.l33!, { pickupA, fastTd, slowTd, fastShots });
      price(s);
      return accept(s, 'setRecloser', 'ch8.reclose.ok', { pickup: pickupA, fast: fastTd, slow: slowTd, shots: fastShots });
    },
    /** L33: the K-type fuse link of spur S1..S3 (rated amps: 6, 10, 15, 25, 40, 65, 100). */
    setFuseLink: (s, spur: unknown, k: unknown) => {
      const e = here(s, 'L33'); if (e) return e;
      if (!isStr(spur) || !L33.spurs.some((x) => x.id === spur)) return reject('ch8.fuse.spur', { id: String(spur), list: L33.spurs.map((x) => x.id).join(', ') });
      if (!isNum(k) || !L33.fuseOptions.includes(k)) return reject('ch8.link.bad', { k: String(k), list: L33.fuseOptions.join(', ') });
      const g = listed(s, 'setFuseLink', k); if (g) return g;
      s.ch8!.l33!.fuse[spur] = k;
      price(s);
      return accept(s, 'setFuseLink', 'ch8.link.ok', { spur, k, load: L33.spurs.find((x) => x.id === spur)!.loadA });
    },

    /** L34: a third primary transformer (same size as the pair) in a new bay. */
    addTransformer: (s, on: unknown) => {
      const e = here(s, 'L34'); if (e) return e;
      if (typeof on !== 'boolean') return reject('act.arg', { name: 'on', expected: t('exp.true_or_false') });
      s.ch8!.l34!.third = on;
      return accept(s, 'addTransformer', on ? 'ch8.tx.third.on' : 'ch8.tx.third.off', { total: price(s) });
    },
    /** L34: replace the pair with 20, 31.5 or 40 MVA transformers. */
    setTransformerSize: (s, mva: unknown) => {
      const e = here(s, 'L34'); if (e) return e;
      if (!isNum(mva) || !L34.sizes.includes(mva)) return reject('ch8.tx.sizeBad', { mva: String(mva), list: L34.sizes.join(', ') });
      const g = listed(s, 'setTransformerSize', mva); if (g) return g;
      s.ch8!.l34!.sizeMva = mva;
      return accept(s, 'setTransformerSize', 'ch8.tx.size', { mva, total: price(s) });
    },
    /** L34: the bus-section breaker: 'manual' close by a crew (about an hour) or 'auto' close (a changeover scheme). */
    setBusSection: (s, mode: unknown) => {
      const e = here(s, 'L34'); if (e) return e;
      if (mode !== 'manual' && mode !== 'auto') return reject('ch8.bus.bad', { mode: String(mode) });
      s.ch8!.l34!.bus = mode;
      return accept(s, 'setBusSection', mode === 'auto' ? 'ch8.bus.auto' : 'ch8.bus.manual', { h: L34.busSection.manualH, total: price(s) });
    },
    /** L34: load transfer through ties to the neighbouring substation after a trip: none, manual switching (1.5 h) or remote switching (6 minutes); 6 MVA. */
    setTransfer: (s, kind: unknown) => {
      const e = here(s, 'L34'); if (e) return e;
      if (kind !== 'none' && kind !== 'manual' && kind !== 'remote') return reject('ch8.transfer.bad', { kind: String(kind) });
      const g = listed(s, 'setTransfer', kind); if (g) return g;
      s.ch8!.l34!.tie = kind as TieKind;
      const tie = L34.ties[kind as TieKind];
      return accept(s, 'setTransfer', kind === 'none' ? 'ch8.transfer.none' : 'ch8.transfer.ok', { mva: tie.mva, min: Math.round(tie.h * 60), total: price(s) });
    },
    /** L34: demand response contracts, called after 15 minutes: none, small (2 MVA) or large (4 MVA). */
    setDemandResponse: (s, kind: unknown) => {
      const e = here(s, 'L34'); if (e) return e;
      if (kind !== 'none' && kind !== 'small' && kind !== 'large') return reject('ch8.dr.bad', { kind: String(kind) });
      const g = listed(s, 'setDemandResponse', kind); if (g) return g;
      s.ch8!.l34!.dr = kind as DrKind;
      return accept(s, 'setDemandResponse', kind === 'none' ? 'ch8.dr.none' : 'ch8.dr.ok', { mva: L34.dr[kind as DrKind].mva, min: Math.round(L34.drLeadH * 60), total: price(s) });
    },

    /** L35: the connection limit of the rooftop-PV queue on this feeder, kW (the connected PV equals the limit, spread over the four roofs nodes). */
    setPvLimit: (s, kw: unknown) => {
      const e = here(s, 'L35'); if (e) return e;
      if (!isNum(kw) || !L35S.pvLimitsKw.includes(kw)) return reject('ch8.pv.bad', { kw: String(kw), list: L35S.pvLimitsKw.join(', ') });
      s.ch8!.l35!.pvLimitKw = kw;
      return accept(s, 'setPvLimit', 'ch8.pv.ok', { kw, total: price(s) });
    },
    /** L35: the substation tap changer's voltage set point (pu) and whether it uses line-drop compensation (reads the feeder current to estimate the far-end voltage). */
    setOltc: (s, setPu: unknown, ldc: unknown) => {
      const e = here(s, 'L35'); if (e) return e;
      if (!isNum(setPu) || !L35S.oltcSetOptions.includes(setPu)) return reject('ch8.oltc.bad', { v: String(setPu), list: L35S.oltcSetOptions.join(', ') });
      if (typeof ldc !== 'boolean') return reject('act.arg', { name: 'ldc', expected: t('exp.true_or_false') });
      Object.assign(s.ch8!.l35!, { oltcSetPu: setPu, ldc });
      return accept(s, 'setOltc', ldc ? 'ch8.oltc.ldc' : 'ch8.oltc.plain', { v: setPu, each: d.money(s, L35S.price.oltcLdc * s.ch8!.money), total: price(s) });
    },
    /** L35: inverter volt-var control (IEEE 1547 category B curve) on every roof. */
    setVoltVar: (s, on: unknown) => {
      const e = here(s, 'L35'); if (e) return e;
      if (typeof on !== 'boolean') return reject('act.arg', { name: 'on', expected: t('exp.true_or_false') });
      s.ch8!.l35!.voltVar = on;
      return accept(s, 'setVoltVar', on ? 'ch8.vv.on' : 'ch8.vv.off', { each: d.money(s, L35S.price.voltVar * s.ch8!.money), total: price(s) });
    },

    /** L36: the "why" card: which equation governs the voltage drop along a feeder. */
    answerWhy: (s, choice: unknown) => {
      const e = here(s, 'L36'); if (e) return e;
      if (!isStr(choice) || !(L36.whyChoices as readonly string[]).includes(choice)) return reject('ch8.why.bad', { choice: String(choice), list: L36.whyChoices.join(', ') });
      s.ch8!.l36!.why = choice;
      price(s);
      return accept(s, 'answerWhy', 'ch8.why.ok', { choice });
    },
  };
}
