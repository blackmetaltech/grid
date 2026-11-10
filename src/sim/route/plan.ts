// Route planner (DEPTH §3, §4.2-4.3). Algorithm:
//  1. Validate: >= 2 distinct waypoints on the map, known family/conductor, kv <= kvMax (main family, and crossing family if given), spanM <= main maxSpanM.
//  2. Each straight leg is sampled every <= 5 m. Samples on a `noOverhead` kind refuse the route. Contiguous samples on `noSupport` kinds form a
//     stretch; ONE span goes from a bank support at the last sample before it to a bank support at the first sample after it (crossing family
//     if given, else the main family; gap > its maxSpanM refuses). A waypoint that itself sits on a noSupport tile cannot carry a support
//     (refused as route.noFoundation needing 'pile').
//  3. Land segments between fixed supports (waypoints, banks) are split into ceil(len/spanM) equal spans.
//  4. Angle = deviation between incoming and outgoing legs at a waypoint (0..180 deg); ends are 'terminal'; <=2 suspension, <=15 small, <=30 medium,
//     else large. Bank supports of a crossing are dead-ends: at least 'large'.
//  5. Foundation from the soil under each support: swamp -> pile, rock -> rock, else earth; the family must list it.
//  5b. Insulators: every support carries the request's insulator (default 'pin'), or its coast insulator where the tile is pollution class >= 3; it records its creepage, the creepage
//     its tile needs (Um x specific creepage) and the distance to the sea. The string's drop lowers that support's attachment in step 6.
//  6. Spans: H_everyday = everydayFrac * UTS at everydayC, H_design = state change to designC, D = parabolic sag. Conductor height at x is the
//     chord between attachment heights (ground + attachM - insulatorDropM) minus 4D x(L-x)/L^2. >= 21 samples (and <= 5 m apart) are checked
//     against ground (+ required clearance: ground, water above its tile elevation, + road extra). Worst margin gives clearanceM/requiredM/atM.
import { dmath } from '@core/numerics';
import { groundAt, seaDistanceM, tileIndexAt } from './terrain';
import { PIN_CREEPAGE_MM, PIN_ID, requiredCreepageMm } from './insulation';
import { INSULATORS } from '../../data/insulators';
import { sagParabola, stateChange, weightNPerM } from './sag';
import type {
  AngleClass, ConductorMech, Foundation, InsulatorMech, PlannedSpan, PlannedSupport, RouteRequest, RouteResult, RouteRules, SupportFamily, Terrain, TileKind,
} from './types';

const SAMPLE_M = 5;
const refuse = (refusal: Extract<RouteResult, { ok: false }>['refusal']): RouteResult => ({ ok: false, refusal });
const dist = (a: [number, number], b: [number, number]): number => Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]));

export function angleClassOf(deg: number): AngleClass {
  return deg <= 2 ? 'suspension' : deg <= 15 ? 'small' : deg <= 30 ? 'medium' : 'large';
}
const CLASS_ORDER: AngleClass[] = ['suspension', 'small', 'medium', 'large'];

interface Node { x: number; y: number; bank: boolean; angleDeg: number; terminal: boolean; gapNext: boolean }

/** Height margin (m) of a span's lowest point over the ground for a flat test span; exported for tests and UI previews. */
export function flatSpanMargin(c: ConductorMech, rules: RouteRules, L: number, attachM: number, requiredM: number, dropM: number = rules.insulatorDropM): number {
  const H1 = rules.everydayFrac * c.utsN;
  const D = sagParabola(weightNPerM(c), L, stateChange(c, L, H1, rules.everydayC, rules.designC));
  return attachM - dropM - D - requiredM;
}

/** The kit's insulator strings as the planner sees them (the plain pin insulator is built in, so old callers need no table). */
const INSULATOR_MECH: InsulatorMech[] = INSULATORS.map((i) => ({ id: i.id, creepageMm: i.creepageMm, dropM: i.dropM }));

export function planRoute(terrain: Terrain, req: RouteRequest, rules: RouteRules, families: SupportFamily[], conductors: ConductorMech[], insulators: InsulatorMech[] = INSULATOR_MECH): RouteResult {
  // 1. validation
  const main = families.find((f) => f.id === req.familyId);
  if (!main) return refuse({ key: 'route.unknownFamily', id: req.familyId });
  const crossing = req.crossingFamilyId === null ? null : families.find((f) => f.id === req.crossingFamilyId) ?? null;
  if (req.crossingFamilyId !== null && !crossing) return refuse({ key: 'route.unknownFamily', id: req.crossingFamilyId });
  const cond = conductors.find((c) => c.id === req.conductorId);
  if (!cond) return refuse({ key: 'route.unknownConductor', id: req.conductorId });
  for (const f of crossing ? [main, crossing] : [main]) if (req.kv > f.kvMax) return refuse({ key: 'route.kvTooHigh', kv: req.kv, kvMax: f.kvMax, familyId: f.id });
  const insId = req.insulatorId ?? PIN_ID, coastId = req.coastInsulatorId ?? insId;
  const insOf = (id: string): InsulatorMech | undefined => insulators.find((i) => i.id === id) ?? (id === PIN_ID ? { id: PIN_ID, creepageMm: PIN_CREEPAGE_MM, dropM: 0 } : undefined);
  const inland = insOf(insId), coast = insOf(coastId);
  if (!inland) return refuse({ key: 'route.unknownInsulator', id: insId });
  if (!coast) return refuse({ key: 'route.unknownInsulator', id: coastId });
  if (req.spanM > main.maxSpanM) return refuse({ key: 'route.spanTooLong', spanM: req.spanM, maxSpanM: main.maxSpanM });
  const wps: [number, number][] = [];
  const MERGE_M = 5;   // bend points closer than this are one point (a stray double click must not plant two angle towers 1.5 m apart; review 2026-11-10)
  req.waypoints.forEach((p, k) => {
    if (tileIndexAt(terrain, p[0], p[1]) === null) return;
    const last = wps[wps.length - 1];
    if (!last || dist(last, p) > MERGE_M) wps.push(p);
    else if (k === req.waypoints.length - 1 && wps.length > 1) wps[wps.length - 1] = p;   // the end point is the yard: keep it, drop the bend it nearly sits on
  });
  const off = req.waypoints.find((p) => tileIndexAt(terrain, p[0], p[1]) === null);
  if (off) return refuse({ key: 'route.offMap', at: off });
  if (wps.length < 2) return refuse({ key: 'route.tooShort' });
  const kindOf = (x: number, y: number): TileKind => terrain.kinds[tileIndexAt(terrain, x, y)!]!;
  const noSup = (k: TileKind): boolean => rules.noSupport.includes(k);

  // 2-3. legs -> support nodes
  const nodes: Node[] = [];
  const wpNode: number[] = [];   // node index of each waypoint (a waypoint visited twice keeps both visits' angles)
  const push = (n: Node): void => {
    const last = nodes[nodes.length - 1];
    if (last && Math.abs(last.x - n.x) < 1e-9 && Math.abs(last.y - n.y) < 1e-9) { last.bank = last.bank || n.bank; last.gapNext = last.gapNext || n.gapNext; return; }
    nodes.push(n);
  };
  for (let l = 0; l + 1 < wps.length; l++) {
    const a = wps[l]!, b = wps[l + 1]!, Ld = dist(a, b);
    const ns = Math.ceil(Ld / SAMPLE_M);
    const at = (k: number): [number, number] => [a[0] + ((b[0] - a[0]) * k) / ns, a[1] + ((b[1] - a[1]) * k) / ns];
    const kinds: TileKind[] = [];
    for (let k = 0; k <= ns; k++) {
      const p = at(k); const ti = tileIndexAt(terrain, p[0], p[1]);
      if (ti === null) return refuse({ key: 'route.offMap', at: p });
      const kind = terrain.kinds[ti]!;
      if (rules.noOverhead.includes(kind)) return refuse({ key: 'route.noOverhead', tile: ti, kind });
      kinds.push(kind);
    }
    const fixed: { s: number; bank: boolean; gapNext: boolean }[] = [{ s: 0, bank: false, gapNext: false }];
    let k = 0;
    while (k <= ns) {
      if (!noSup(kinds[k]!)) { k++; continue; }
      let e = k; while (e + 1 <= ns && noSup(kinds[e + 1]!)) e++;
      if (k === 0 || e === ns) { const p = k === 0 ? a : b; return refuse({ key: 'route.noFoundation', tile: tileIndexAt(terrain, p[0], p[1])!, kind: kinds[k === 0 ? 0 : ns]!, familyId: main.id, needs: 'pile' }); }
      const gapM = ((e + 1 - (k - 1)) * Ld) / ns, gf = crossing ?? main;
      if (gapM > gf.maxSpanM) return refuse({ key: 'route.noSupportGapTooLong', gapM, maxSpanM: gf.maxSpanM, familyId: gf.id });
      fixed.push({ s: k - 1, bank: true, gapNext: true }, { s: e + 1, bank: true, gapNext: false });
      k = e + 1;
    }
    fixed.push({ s: ns, bank: false, gapNext: false });
    for (let q = 0; q < fixed.length; q++) {
      const f = fixed[q]!, p = at(f.s);
      push({ x: p[0], y: p[1], bank: f.bank, angleDeg: 0, terminal: false, gapNext: f.gapNext });
      if (q === 0) wpNode[l] = nodes.length - 1;
      const nx = fixed[q + 1];
      if (nx && !f.gapNext && nx.s > f.s) {
        const len = ((nx.s - f.s) * Ld) / ns, n = Math.ceil(len / req.spanM - 1e-9);
        for (let i = 1; i < n; i++) { const t = f.s + ((nx.s - f.s) * i) / n; const x = a[0] + ((b[0] - a[0]) * t) / ns, y = a[1] + ((b[1] - a[1]) * t) / ns; push({ x, y, bank: false, angleDeg: 0, terminal: false, gapNext: false }); }
      }
    }
  }
  // 4. angles at waypoints
  nodes[0]!.terminal = true; nodes[nodes.length - 1]!.terminal = true;
  for (let w = 1; w + 1 < wps.length; w++) {
    const n = nodes[wpNode[w]!]!;
    const a = wps[w - 1]!, b = wps[w]!, c = wps[w + 1]!;
    const ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - b[0], vy = c[1] - b[1];
    n.angleDeg = (dmath.atan2(Math.abs(ux * vy - uy * vx), ux * vx + uy * vy) * 180) / Math.PI;
  }

  // 5. supports
  const supports: PlannedSupport[] = [];
  for (const n of nodes) {
    const ti = tileIndexAt(terrain, n.x, n.y)!, kind = terrain.kinds[ti]!;
    const fam = n.bank && crossing ? crossing : main;
    if (noSup(kind)) return refuse({ key: 'route.noFoundation', tile: ti, kind, familyId: fam.id, needs: 'pile' });   // an evenly split support that lands in water
    const foundation: Foundation = kind === 'swamp' ? 'pile' : kind === 'rock' ? 'rock' : 'earth';
    if (!fam.foundations.includes(foundation)) return refuse({ key: 'route.noFoundation', tile: ti, kind, familyId: fam.id, needs: foundation });
    let cls: AngleClass = n.terminal ? 'terminal' : angleClassOf(n.angleDeg);
    if (n.bank && cls !== 'terminal' && CLASS_ORDER.indexOf(cls) < 3) cls = 'large';
    const pollutionClass = terrain.pollution[ti]!, ins = pollutionClass >= 3 ? coast : inland;
    supports.push({ x: n.x, y: n.y, tile: ti, familyId: fam.id, angleDeg: n.angleDeg, angleClass: cls, foundation, insulatorId: ins.id, creepageMm: ins.creepageMm, needMm: requiredCreepageMm(req.kv, pollutionClass), pollutionClass, seaM: seaDistanceM(terrain, n.x, n.y) });
  }

  // 6. spans
  const fam = (id: string): SupportFamily => families.find((f) => f.id === id)!;
  const dropOf = (id: string): number => insOf(id)?.dropM ?? 0;
  const H1 = rules.everydayFrac * cond.utsN, w = weightNPerM(cond);
  const spans: PlannedSpan[] = [];
  let lengthM = 0, worstMarginM = Infinity, worstSpan = 0, forestM = 0;
  for (let s = 0; s + 1 < supports.length; s++) {
    const A = supports[s]!, B = supports[s + 1]!, L = dist([A.x, A.y], [B.x, B.y]);
    const hH = stateChange(cond, L, H1, rules.everydayC, rules.designC), D = sagParabola(w, L, hH);
    // the string's drop is the support's own (its insulator), on top of the pack's base drop (0 in both packs)
    const hA = groundAt(terrain, A.x, A.y) + fam(A.familyId).attachM - rules.insulatorDropM - dropOf(A.insulatorId);
    const hB = groundAt(terrain, B.x, B.y) + fam(B.familyId).attachM - rules.insulatorDropM - dropOf(B.insulatorId);
    const ns = Math.max(20, Math.ceil(L / SAMPLE_M));
    const over: TileKind[] = [];
    let best = Infinity, bestAt = 0, bestClear = 0, bestReq = 0;
    for (let k = 0; k <= ns; k++) {
      const x = (L * k) / ns, t = x / L;
      const px = A.x + (B.x - A.x) * t, py = A.y + (B.y - A.y) * t;
      const ti = tileIndexAt(terrain, px, py)!, kind = terrain.kinds[ti]!;
      if (!over.includes(kind)) over.push(kind);
      const water = kind === 'river' || kind === 'sea';
      const ground = water ? terrain.elevM[ti]! : groundAt(terrain, px, py);
      const req0 = water ? rules.waterClearanceM : rules.groundClearanceM + (kind === 'road' ? rules.roadExtraM : 0);
      const h = hA + (hB - hA) * t - (4 * D * x * (L - x)) / (L * L);
      const margin = h - ground - req0;
      if (margin < best) { best = margin; bestAt = x; bestClear = h - ground; bestReq = req0; }
      if (k < ns) {
        const tm = (k + 0.5) / ns;
        if (kindOf(A.x + (B.x - A.x) * tm, A.y + (B.y - A.y) * tm) === 'forest') forestM += L / ns;
      }
    }
    spans.push({ from: s, to: s + 1, lengthM: L, over, sagDesignM: D, hDesignN: hH, hEverydayN: H1, clearanceM: bestClear, requiredM: bestReq, atM: bestAt, ok: best >= 0 });
    lengthM += L;
    if (best < worstMarginM) { worstMarginM = best; worstSpan = s; }
  }

  const bomSup: Record<string, Record<AngleClass, number>> = {};
  const foundations: Record<Foundation, number> = { earth: 0, pile: 0, rock: 0 };
  const insCount: Record<string, number> = {};
  for (const sp of supports) {
    insCount[sp.insulatorId] = (insCount[sp.insulatorId] ?? 0) + 1;
    (bomSup[sp.familyId] ??= { suspension: 0, small: 0, medium: 0, large: 0, terminal: 0 })[sp.angleClass]++;
    foundations[sp.foundation]++;
  }
  return { ok: true, supports, spans, lengthM, worstMarginM, worstSpan, bom: { supports: bomSup, foundations, insulators: insCount, conductorM: lengthM, clearedForestM: forestM } };
}
