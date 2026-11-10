// L29 Salt Wind, engine side: the fog gate (naive pins flash over at 04:00, the lesson passes, the reference earns three stars), the args and their defaults, preview == build,
// refund on demolish, determinism, the lesson numbers recompute, the map's pollution classes.
import { describe, expect, it } from 'vitest';
import { Env, TICK, hashOf } from '@core/kit';
import { GAME } from '../game';
import { specOf } from './index';
import { runDesign } from './run';
import { terrainOf } from './maps';
import { route, harbourXfmr, NAIVE, COAST_NEED_MM, YARD_TILE } from './levels/l29';
import type { GridState } from '../types';

const spec = specOf('L29')!;
const fresh = (region = 'global'): Env<GridState> => { const e = new Env(GAME); e.reset({ seed: 1, level: 'L29', region }); return e as Env<GridState>; };

describe('L29 fog gate', () => {
  for (const region of ['global', 'in']) {
    it(`${region}: pins everywhere flash over at 04:00, the lesson passes, the reference earns three stars`, () => {
      const n = runDesign(spec, region, NAIVE);
      expect(n.rejected).toBeNull(); expect(n.status).toBe('lost'); expect(n.failKind).toBe('saltFlashover');
      expect(n.state.clock.block).toBe(16); expect(n.state.block.verdictKey).toBe('level.lost.saltFlashover');
      expect(n.reason).toMatch(/^At 04:00 the sea fog rolled in\. Pole \d+ stands \d+ m from the surf \(class IV\): it needs 372 mm of creepage and its insulator offers 320 mm\./);
      expect(n.state.events.log.some((e) => e.causeKey === 'route.saltFlashover')).toBe(true);
      expect(n.state.metrics.poorSupplyMin).toBeLessThanOrEqual(15);   // fine until the fog
      const l = runDesign(spec, region, spec.lesson);
      expect(l.status).toBe('won'); expect(l.stars).toBeGreaterThanOrEqual(1);
      const r = runDesign(spec, region, spec.reference);
      expect(r.status).toBe('won'); expect(r.stars).toBe(3); expect(r.track.coastMinCreepageMm!).toBeGreaterThanOrEqual(COAST_NEED_MM);
    });
  }
  it('the lesson design misses the third star: a pin on the class II stretch is under 372 mm', () => {
    const l = runDesign(spec, 'global', spec.lesson);
    expect(l.stars).toBe(2); expect(l.track.coastMinCreepageMm).toBe(320);
  });
  it('fog is the level\'s: the same line stands in free play and the rules carry the fog block only here', () => {
    const e = new Env(GAME); e.reset({ seed: 1 }); expect(e.state.rules.fogBlock ?? null).toBeNull();
    expect(fresh().state.rules.fogBlock).toBe(16);
    const li = fresh().engine.q('levelInfo') as any; expect(li.fogBlock).toBe(16); expect(li.fogTime).toBe('04:00'); expect(li.startBlock).toBe(72);
  });
});

describe('insulator args', () => {
  const pv = (e: Env<GridState>, a: unknown[]): any => e.engine.q('routePreview', a);
  const base = route('east', 'pcc-11', 90, 'rabbit', 'pin', 'pin').args as unknown[];
  it('defaults: no insulator args == pins; coast defaults to the inland insulator', () => {
    const e = fresh();
    const a = pv(e, base.slice(0, 7)), b = pv(e, base), c = pv(e, [...base.slice(0, 7), 'fog1']), d = pv(e, [...base.slice(0, 7), 'fog1', 'fog1']);
    expect(a.ok).toBe(true); expect(a.cost).toEqual(b.cost); expect(a.supports).toEqual(b.supports);
    expect(c.cost).toEqual(d.cost);
    expect(b.cost.insulators).toBeCloseTo(3 * 25 * b.supports.length, 2);
  });
  it('every support reports {creepageMm, needMm, insulatorId, pollutionClass}, and the coast string applies on class >= III only', () => {
    const e = fresh(); const p = pv(e, route('east', 'pcc-11', 90, 'rabbit', 'pin', 'fog1').args as unknown[]);
    for (const s of p.supports) {
      expect(s.needMm).toBe(12 * [0, 16, 20, 25, 31][s.pollutionClass]);
      expect(s.insulatorId).toBe(s.pollutionClass >= 3 ? 'fog1' : 'pin'); expect(s.creepageMm).toBe(s.pollutionClass >= 3 ? 430 : 320);
    }
    const last = p.supports[p.supports.length - 1]; expect(last.pollutionClass).toBe(4); expect(last.seaM).toBeCloseTo(25, 3);
  });
  it('unknown insulators are refused as data by the preview and by the part list', () => {
    expect(pv(fresh(), [...base.slice(0, 7), 'ghost']).refusal.key).toBe('route.unknownInsulator');
    const r = fresh().engine.act('buildRoute', [...base.slice(0, 7), 'ghost']);
    expect(r.ok).toBe(false); expect(r.key).toBe('level.part.notAllowed');
    expect(pv(fresh(), [...base.slice(0, 7), 5]).refusal.key).toBe('act.arg');
  });
  it('preview == build cost (insulators line included), demolish refunds it, and a disc string eats clearance', () => {
    const e = fresh(); const a = route('east', 'pcc-11', 90, 'rabbit', 'disc2', 'disc2');
    const p = pv(e, a.args as unknown[]); const before = e.state.budget.spent;
    expect(p.cost.total).toBeCloseTo(p.cost.supports + p.cost.foundations + p.cost.conductor + p.cost.clearing + p.cost.insulators, 2);
    expect(e.engine.act('buildRoute', a.args as unknown[]).ok).toBe(true);
    expect(e.state.budget.spent - before).toBeCloseTo(p.cost.total, 2);
    const rec = e.state.routes[e.state.routes.length - 1]!;
    expect(e.engine.act('demolish', [rec.branchId]).ok).toBe(true);
    expect(e.state.budget.spent).toBeCloseTo(before, 6);
    const pin = pv(e, route('east', 'pcc-11', 90, 'rabbit', 'pin', 'pin').args as unknown[]);
    expect(pin.worstMarginM - p.worstMarginM).toBeCloseTo(0.3, 3);   // oracle S-10: -0.30 m at the same spans
  });
  it('the district stands: the L05 line and its transformers, and the harbour straight line is refused over the town', () => {
    const e = fresh(); expect(e.state.routes.length).toBe(1); expect(e.state.branches.filter((b) => b.kind === 'xfmr').length).toBe(2);
    expect(e.state.budget.spent).toBe(0);
    const r = pv(e, ['B3', 'B5', 'rabbit', 'pcc-11', null, 90, [], 'pin', 'pin']); expect(r.ok).toBe(false); expect(r.refusal.key).toBe('route.noOverhead');
  });
});

describe('determinism and lesson numbers', () => {
  it('same actions, same hash', () => {
    const run = (): string => { const e = fresh(); for (const a of spec.lesson) e.step(a); for (let i = 0; i < 20; i++) e.step(TICK); return hashOf(e.state); };
    expect(run()).toBe(run());
  });
  it('the lesson names the worst coastal support with Um x mm/kV and the printed numbers recompute', () => {
    for (const [acts, short] of [[NAIVE, true], [spec.reference, false]] as const) {
      const e = fresh(); for (const a of acts) e.engine.act(a.name, a.args as unknown[]);
      const li = e.engine.q('levelInfo') as { lesson: string };
      const m = li.lesson.match(/pole (\d+), is (\d+) m from the surf: pollution class (IV|III|II), (\d+) mm of creepage per kV × Um (\d+) kV = (\d+) mm needed.* offers (\d+) mm\./)!;
      expect(m).not.toBeNull();
      expect(Number(m[4]) * Number(m[5])).toBe(Number(m[6]));
      expect(m[3]).toBe('IV'); expect(Number(m[6])).toBe(372);
      if (short) { expect(li.lesson).toContain(`That is ${372 - Number(m[7])} mm short`); } else { expect(li.lesson).toContain(`clears the need by ${Number(m[7]) - 372} mm`); }
    }
    expect((fresh().engine.q('levelInfo') as any).lesson).toBe('');
  });
});

describe('map', () => {
  it('pollution classes follow sea distance: the harbour yard row is class IV (<= 1 tile), the row behind class III, then II up to 6 tiles', () => {
    const t = terrainOf('mainland')!, at = (i: number, j: number): number => t.pollution[j * t.cols + i]!;
    expect(t.kinds[41 * t.cols + 82]).toBe('sand'); expect(at(YARD_TILE[0], 41)).toBe(4); expect(at(82, 40)).toBe(3);
    for (let j = 36; j <= 39; j++) expect(at(82, j)).toBe(2);
    expect(at(82, 35)).toBe(1);
    expect(t.kinds[38 * t.cols + 80]).toBe('town'); expect(t.kinds[36 * t.cols + 80]).toBe('road');
    for (let j = 0; j < t.rows; j++) for (let i = 0; i < t.cols; i++) {   // every tile's class equals its Chebyshev sea distance class
      let d = 99; for (let b = Math.max(0, j - 6); b <= Math.min(t.rows - 1, j + 6); b++) for (let a = Math.max(0, i - 6); a <= Math.min(t.cols - 1, i + 6); a++) if (t.kinds[b * t.cols + a] === 'sea') d = Math.min(d, Math.max(Math.abs(a - i), Math.abs(b - j)));
      const want = d <= 1 ? 4 : d <= 2 ? 3 : d <= 6 ? 2 : 1;
      expect(at(i, j)).toBe(t.kinds[j * t.cols + i] === 'swamp' && d <= 6 ? Math.max(3, want) : want);
    }
  });
});
void harbourXfmr;

describe('L29 incident advice', () => {
  it('a salt flashover: what to try names the coast insulators and 372 mm', () => {
    const e = fresh();
    for (const a of NAIVE) expect(e.step(a).info.ok).toBe(true);
    for (let i = 0; i < 80 && e.state.status === 'playing'; i++) e.step(TICK);
    expect(e.state.status).toBe('lost');
    const li = e.engine.q('levelInfo') as { tryHint: string };
    expect(li.tryHint).toContain('372 mm');
    expect(li.tryHint).toContain('fog disc');
  });
});
