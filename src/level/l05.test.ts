// L05 The River Line, engine side: the sag lesson gate (an electrically fine line with a span under its clearance rule flashes over at 19:30), the
// refusals of buildRoute (one teaching key per planner refusal), routePreview == buildRoute, the world's terrain and routes, demolish, determinism.
import { describe, expect, it } from 'vitest';
import { Env, TICK, hashOf } from '@core/kit';
import { GAME } from '../game';
import { en } from '../locales/en';
import { MAINLAND_ROWS } from './maps/mainland';
import { specOf } from './index';
import { runDesign } from './run';
import { route, xfmrPair, NAIVE } from './levels/l05';
import type { GridState } from '../types';
import { ruleFail } from '../rules';

const spec = specOf('L05')!;
const fresh = (region = 'global'): Env<GridState> => { const e = new Env(GAME); e.reset({ seed: 1, level: 'L05', region }); return e as Env<GridState>; };
const wood70 = (): ReturnType<typeof route> => route('saddle', 'wood-9', 'crossing-h', 70, 'rabbit');

describe('L05 sag lesson gate', () => {
  it('saddle, wood poles, H-frame crossing, 70 m spans, Rabbit: electrically fine, margin -0.52 m, flashes over at 19:30 and ends the level', () => {
    const o = runDesign(spec, 'global', [wood70(), ...xfmrPair('dt-250')]);
    expect(o.rejected).toBeNull();
    expect(o.track.worstMarginM).toBeCloseTo(-0.521, 2);
    expect(o.status).toBe('lost'); expect(o.failKind).toBe('flashover');
    expect(o.ticks).toBe(14);                                  // 16:00 + 14 blocks = 19:30
    expect(o.state.clock.block).toBe(78);
    expect(o.state.block.verdictKey).toBe('level.lost.flashover');
    expect(o.reason).toMatch(/19:30.*sag 1\.031 m.*only 6\.479 m above the road.*7 m is the rule/);
    expect(o.state.events.log.some((e) => e.causeKey === 'route.flashover')).toBe(true);
    // electrically fine until the peak: nothing before 19:30 browned out (the poor-supply clock only ran after the trip)
    expect(o.state.metrics.poorSupplyMin).toBeLessThanOrEqual(15);
  });
  it('the same design with the low-clearance span fixed (pcc-11 poles) does not flash over, and the naive 0.42 kV run browns out first', () => {
    expect(runDesign(spec, 'global', spec.reference).status).toBe('won');
    const n = runDesign(spec, 'global', [NAIVE]);
    expect(n.failKind).toBe('brownout'); expect(n.track.loadVMinPu).toBeLessThan(0.8);
  });
  it('the clearance rule is the pack\'s: the CEA draft pack (4.6 m) lets the wood-pole line stand', () => {
    expect(runDesign(spec, 'in', [wood70(), ...xfmrPair('dt-250')]).status).toBe('won');
  });
});

describe('buildRoute refusals teach', () => {
  const refuse = (args: unknown[], key: string): void => {
    const e = fresh(); const r = e.engine.act('buildRoute', args);
    expect(r.ok, key).toBe(false); expect(r.key).toBe(key); expect(en[key], key).toBeTruthy(); expect(r.message).not.toMatch(/\{/);
    expect(e.state.routes).toEqual([]); expect(e.state.budget.spent).toBe(0);
  };
  const A = (over: Record<number, unknown>): unknown[] => { const a: unknown[] = ['B2', 'B3', 'rabbit', 'tubular-13', 'crossing-h', 90, []]; for (const [i, v] of Object.entries(over)) a[Number(i)] = v; return a; };
  it('each refusal kind has its key', () => {
    refuse(A({ 4: null }), 'route.noSupportGapTooLong');
    refuse(A({ 3: 'wood-9', 4: 'crossing-h', 5: 60 }), 'route.noFoundation');
    refuse(A({ 5: 150 }), 'route.spanTooLong');
    refuse(A({ 3: 'ghost' }), 'level.part.notAllowed');   // the level's part list answers first; the planner's own keys are checked through the preview
    const pv = (a: unknown[]): any => fresh().engine.q('routePreview', a);
    expect(pv(A({ 3: 'ghost' })).refusal.key).toBe('route.unknownFamily');
    expect(pv(A({ 2: 'unobtainium' })).refusal.key).toBe('route.unknownConductor');
    refuse(A({ 1: 'B2' }), 'act.line.same');
    refuse(A({ 1: 'B4' }), 'route.kvMismatch');
    refuse(A({ 1: 'B9' }), 'act.unknownId');
    refuse(['B2', 'B3', 'rabbit', 'tubular-13', 'crossing-h', 90, [[-500, 100]]], 'route.offMap');
    refuse(['B2', 'B3', 'rabbit', 'tubular-13', 'crossing-h', 90, [[4400, 700], [4500, 700]]], 'route.noOverhead');   // through the market town
    refuse(['B2', 'B3', 'rabbit', 'pcc-11', 'crossing-h', 90, []], 'route.noFoundation');                             // concrete poles on the gorge's rock? (straight line: rock at the ridge)
    refuse(A({ 5: 'long' }), 'act.arg');
  });
  it('a line above the family kV is refused: lattice-33 is not offered, a family made for 11 kV carries 11 kV only where it says', () => {
    const e = fresh(); const r = e.engine.act('buildRoute', ['B2', 'B3', 'rabbit', 'lattice-33', null, 90, []]);
    expect(r.ok).toBe(false); expect(r.key).toBe('level.part.notAllowed');
  });
});

describe('routePreview and buildRoute agree', () => {
  it('same plan, same cost; refusals come back as data, never as a throw', () => {
    const e = fresh(); const a = spec.reference[0]!;
    const pv = e.engine.q('routePreview', a.args as unknown[]) as any;
    expect(pv.ok).toBe(true);
    const r = e.engine.act('buildRoute', a.args as unknown[]);
    expect(r.ok).toBe(true);
    expect(e.state.budget.spent).toBeCloseTo(pv.cost.total, 2);
    expect(pv.cost.total).toBeCloseTo(pv.cost.supports + pv.cost.foundations + pv.cost.conductor + pv.cost.clearing + pv.cost.insulators, 2);
    const rec = e.state.routes[0]!;
    expect(rec.cost).toBeCloseTo(pv.cost.total, 2); expect(rec.worstMarginM).toBeCloseTo(pv.worstMarginM, 3); expect(rec.supports).toBe(pv.supports.length);
    expect(rec.badSpans).toEqual(pv.badSpans); expect(rec.lengthM).toBeCloseTo(pv.lengthM, 3);
    const w = e.engine.q('world') as any;
    expect(w.routes[0].branchId).toBe(rec.branchId); expect(w.routes[0].supports).toEqual(pv.supports); expect(w.routes[0].spans).toEqual(pv.spans);
    const bad = e.engine.q('routePreview', ['B2', 'B3', 'rabbit', 'wood-9', null, 70, []]) as any;
    expect(bad.ok).toBe(false); expect(bad.refusal.key).toBe('route.noSupportGapTooLong'); expect(bad.refusal.message).toMatch(/river here is/);
    expect((e.engine.q('routePreview', [1, 2]) as any).ok).toBe(false);
    const finite = JSON.stringify(pv, (_k, v) => (typeof v === 'number' && !Number.isFinite(v) ? '__NF__' : v));
    expect(finite).not.toContain('__NF__');
  });
});

describe('world terrain', () => {
  it('round-trips the map rows and carries a 1 dp elevation per tile', () => {
    const e = fresh(); const w = e.engine.q('world') as any;
    expect(w.terrain.id).toBe('mainland'); expect(w.terrain.rows).toEqual([...MAINLAND_ROWS]);
    expect(w.terrain.cols).toBe(100); expect(w.terrain.nrows).toBe(44); expect(w.terrain.tileM).toBe(50);
    expect(w.terrain.elev.length).toBe(4400); expect(w.terrain.elev.every((v: number) => Math.round(v * 10) / 10 === v)).toBe(true);
    expect(w.map).toEqual({ w: 100, h: 44 }); expect(w.routes).toEqual([]);
    const free = new Env(GAME); free.reset({ seed: 1 });
    expect((free.engine.q('world') as any).terrain).toBeNull();
  });
});

describe('demolish and determinism', () => {
  it('demolishing a route line (or its bus) removes its record', () => {
    const e = fresh(); for (const a of spec.reference) expect(e.step(a).info.ok).toBe(true);
    expect(e.state.routes.length).toBe(1);
    const id = e.state.routes[0]!.branchId;
    expect(e.engine.act('demolish', [id]).ok).toBe(true); expect(e.state.routes).toEqual([]);
    const f = fresh(); f.step(spec.reference[0]!); f.engine.act('demolish', ['B2']); expect(f.state.routes).toEqual([]);
  });
  it('a demolished route is refunded, so re-stringing with another kit costs only the difference (review 2026-11-10)', () => {
    const e = fresh(); const before = e.state.budget.spent;
    for (const a of spec.reference) expect(e.step(a).info.ok).toBe(true);
    const rec = e.state.routes[0]!, paid = e.state.budget.spent;
    expect(paid - before).toBeGreaterThanOrEqual(rec.cost);
    expect(e.engine.act('demolish', [rec.branchId]).ok).toBe(true);
    expect(e.state.budget.spent).toBeCloseTo(paid - rec.cost, 6);
  });
  it('the same actions give the same state hash', () => {
    const run = (): string => { const e = fresh(); for (const a of spec.lesson) e.step(a); for (let i = 0; i < 20; i++) e.step(TICK); return hashOf(e.state); };
    expect(run()).toBe(run());
  });
  it('flashover only fires at the level\'s block: the same bad line is fine in free play', () => {
    const e = new Env(GAME); e.reset({ seed: 1 });
    expect(e.state.rules.flashoverBlock).toBeNull();
  });
});

describe('L05 review fixes (2026-11-10)', () => {
  it('a span shorter than 20 m or more than 40 waypoints is refused as a bad argument (no million-pole plans)', async () => {
    const { parseArgs, MIN_SPAN_M, MAX_WAYPOINTS } = await import('../route-actions');
    expect('bad' in parseArgs(['B2', 'B3', 'acsr-rabbit', 'pcc-11', null, MIN_SPAN_M - 1, []])).toBe(true);
    expect('bad' in parseArgs(['B2', 'B3', 'acsr-rabbit', 'pcc-11', null, MIN_SPAN_M, []])).toBe(false);
    const many = Array.from({ length: MAX_WAYPOINTS + 1 }, (_, i) => [100 + i, 100]);
    expect('bad' in parseArgs(['B2', 'B3', 'acsr-rabbit', 'pcc-11', null, 90, many])).toBe(true);
  });
  it('the foundation is a share of the support price, not on top of it', async () => {
    const { priceRoute } = await import('../route-actions');
    const plan = { supports: [{ x: 0, y: 0, tile: 0, familyId: 'pcc-11', angleDeg: 0, angleClass: 'suspension', foundation: 'earth' }], spans: [], lengthM: 0, worstMarginM: 0, worstSpan: 0, ok: true,
      bom: { supports: {}, foundations: { earth: 1, pile: 0, rock: 0 }, conductorM: 0, clearedForestM: 0 } } as never;
    const prices = { support: { 'pcc-11': 1000 }, angleMultiplier: { suspension: 1 }, foundationShare: 0.4, foundationMultiplier: { earth: 1, pile: 2.5, rock: 1.8 }, phaseWires: { lv: 4, mv: 3 }, conductorPerM: {}, clearingPerM: 0 } as never;
    expect(priceRoute(plan, 11, 'rabbit', prices).total).toBeCloseTo(1000, 6);
  });
});

describe('L05 shift-report lesson', () => {
  it('names the LONGEST span with D = wL²/8H in the player\'s numbers, and the printed numbers recompute', () => {
    const e = fresh();
    for (const a of spec.reference) e.engine.act(a.name, a.args as unknown[]);
    const s = e.state as GridState;
    const li = e.engine.q('levelInfo') as { lesson: string };
    const rec = s.routes[0]!, w = rec.longest!;
    expect(w.over).toBe('river'); expect(w.lengthM).toBeGreaterThanOrEqual(rec.worst.lengthM);
    expect(w.lengthM).toBeCloseTo(Math.max(...(e.engine.q('routePreview', spec.reference[0]!.args as unknown[]) as any).spans.map((x: any) => x.lengthM)), 3);
    expect(li.lesson).toMatch(/^Your 11 kV line runs \d+\.\d km on \d+ supports\. Its longest span, \d+ m over the river, sags \d+\.\d\d m at 75 °C/);
    const m = li.lesson.match(/w = ([\d.]+) N\/m and H = (\d+) N: [\d.]+ × (\d+)² ÷ \(8 × \d+\) = ([\d.]+) m/)!;
    expect(m).not.toBeNull();
    const [, pw, pH, pL, pSag] = m;
    expect(Number(pw) * Number(pL) ** 2 / (8 * Number(pH))).toBeCloseTo(Number(pSag), 2);
    expect(li.lesson).toContain(`sags ${pSag} m`);
    expect(Number(pSag)).toBeCloseTo(w.sagM, 1);       // the true sag, to the rounding of the printed w and H
    expect(li.lesson).toContain(`clears it by ${w.clearanceM.toFixed(2)} m`);
  });
  it('the 11 kV line adds the voltage sentence: hand oracle for current and heat ratios', () => {
    const e = fresh();
    for (const a of spec.reference) e.engine.act(a.name, a.args as unknown[]);
    const li = e.engine.q('levelInfo') as { lesson: string };
    const sMva = 0.2 / 0.9, iLow = sMva * 1e6 / (Math.sqrt(3) * 420), iHigh = sMva * 1e6 / (Math.sqrt(3) * 11000);
    expect(Math.round(iLow)).toBe(305); expect(Math.round(iHigh)).toBe(12);
    expect(li.lesson).toContain(`draws ${Math.round(iLow)} A at 0.42 kV but only ${Math.round(iHigh)} A at 11 kV`);
    expect(li.lesson).toContain('1/26 of the current and loses about 1/690 of the heat');
  });
  it('the 0.42 kV line that browned out says what the drop was instead', () => {
    const o = runDesign(spec, 'global', [NAIVE]);
    const li = (() => { const e = fresh(); e.engine.act(NAIVE.name, NAIVE.args as unknown[]); e.state.metrics.track.loadVMinPu = o.track.loadVMinPu!; return e.engine.q('levelInfo') as { lesson: string }; })();
    expect(li.lesson).toMatch(/At 0\.42 kV the village sagged to 0\.\d\d pu, \d+\.\d % under nominal\. Carry the same 0\.20 MW at a higher voltage and the current is smaller/);
    expect(li.lesson).not.toContain('Voltage did the rest');
    expect(li.lesson).toContain(`${((1 - o.track.loadVMinPu!) * 100).toFixed(1)} %`);
  });
});

describe('L05 crossing refusal honesty (critique 0.3)', () => {
  const pv = (cross: string | null): any => fresh().engine.q('routePreview', ['B2', 'B3', 'rabbit', 'tubular-13', cross, 90, []]);
  it('a chosen crossing family that is too short is named with the gap, its max and the family that would do; never "use a crossing structure"', () => {
    const r = pv('tubular-13').refusal;
    expect(r.key).toBe('route.crossingTooNarrow');
    expect(r.message).toBe('The river is 155 m wide; steel tubular pole banks span at most 130 m. Change the bank structure to: H-frame crossing structure.');
    expect(r.message).not.toMatch(/crossing structure on each bank/);
  });
  it('with no crossing chosen the old advice stands', () => {
    const r = pv(null).refusal;
    expect(r.key).toBe('route.noSupportGapTooLong'); expect(r.message).toMatch(/Use a crossing structure on each bank/);
  });
});

describe('L05 budget message shows money', () => {
  it('Spent $452,353 but the budget is $260,000', () => {
    // rendered by the level's fail text (rules.ts), from the verdict params the sim stores as plain numbers
    const s = fresh().state as GridState;
    s.block.verdict = 'lost'; s.block.verdictKey = 'level.lost.budget'; s.block.verdictParams = { spent: 452353, max: 260000 };
    expect(ruleFail(s)).toBe('Spent $452,353 but the budget is $260,000.');
  });
});
