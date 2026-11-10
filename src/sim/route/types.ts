// Route module contract (design/grid/DEPTH.md §3-4, §8 step 1). Pure physics + geometry: no GridState, no region pack, no strings.
// A route is a polyline of waypoints over a terrain map; the planner places supports, classifies line angles, picks foundations from
// the soil under each support, checks every span's ground clearance at the design conductor temperature (parabolic sag after the
// state-change equation) and prices the bill of materials. Levels and actions (src/level, src/actions) consume RoutePlan.

/** One char per tile in level data: f field, s swamp (mangrove), r river, w forest, k rock, a sand/beach, e sea, t town, d road. */
export type TileKind = 'field' | 'swamp' | 'river' | 'forest' | 'rock' | 'sand' | 'sea' | 'town' | 'road';
/** IEC 60815 (1986) site pollution severity: 1 light 16, 2 medium 20, 3 heavy 25, 4 very heavy 31 mm/kV of Um. */
export type PollutionClass = 1 | 2 | 3 | 4;

export interface Terrain {
  cols: number; rows: number;
  /** Tile edge in metres (Ch 2 district maps: 50 m). Tile (i, j) covers x in [i·tileM, (i+1)·tileM), y likewise. */
  tileM: number;
  kinds: TileKind[];            // row-major, length cols·rows
  /** Ground elevation at the tile centre (m); for river/sea tiles it is the high-water level. */
  elevM: number[];
  pollution: PollutionClass[];
}

/** Region-independent physical data of a support family (src/data/supports.ts). Prices live in the region pack. */
export interface SupportFamily {
  id: string;                    // 'wood-9', 'pcc-11', 'tubular-13', 'lattice-33', 'crossing-h'
  kvMax: number;                 // highest nominal kV it may carry
  attachM: number;               // conductor attachment height above ground (pin insulator top / crossarm for strings)
  maxSpanM: number;              // mechanical limit (pole strength, crossarm), independent of clearance
  /** Can stand on these soils. Swamp needs 'pile', rock needs 'rock'; 'earth' is the normal foundation. */
  foundations: Foundation[];
}
export type Foundation = 'earth' | 'pile' | 'rock';
/** Line-angle class at a support (deviation of the route there), plus 'terminal' at both ends. */
export type AngleClass = 'suspension' | 'small' | 'medium' | 'large' | 'terminal';

/** Mechanical data of a conductor (src/data/conductors.ts adds these columns). */
export interface ConductorMech {
  id: string; utsN: number; kgPerKm: number; areaMm2: number; eGPa: number; alphaPerC: number; ampA: number; diaMm: number;
}

/** Rules the planner applies (from the region pack's grid code + level; numbers, never strings). */
export interface RouteRules {
  /** Everyday stringing tension as a fraction of UTS at `everydayC` (0.20). */
  everydayFrac: number; everydayC: number;
  /** Design (maximum) conductor temperature for clearance checks (75 °C). */
  designC: number;
  /** Minimum clearance to ground for the line's kV (m), to water above high-water level, and the extra over roads. */
  groundClearanceM: number; waterClearanceM: number; roadExtraM: number;
  /** Insulator string drop below `attachM` (m): 0 for pin insulators, 0.15 m per disc for strings. */
  insulatorDropM: number;
  /** Tiles that cannot hold a support at all ('sea', 'river') and tiles a line may not cross overhead ('town' for overhead). */
  noSupport: TileKind[]; noOverhead: TileKind[];
}

/** What the player asks for: waypoints in metres (map coordinates), the support family, the planned span length (supports are
 *  spaced evenly on each straight leg at ≤ spanM; river/no-support stretches become one span from bank to bank). */
export interface RouteRequest {
  waypoints: [number, number][];   // ≥ 2 points; first and last are the terminals
  familyId: string;
  /** Crossing family used at both banks of a river (or any no-support gap); null = the main family must make the gap itself. */
  crossingFamilyId: string | null;
  conductorId: string;
  kv: number;
  spanM: number;
}

export interface PlannedSupport {
  x: number; y: number;            // metres
  tile: number;                    // tile index
  familyId: string;
  angleDeg: number;                // deviation at this support (0 on straight runs)
  angleClass: AngleClass;
  foundation: Foundation;
}

export interface PlannedSpan {
  from: number; to: number;        // support indices
  lengthM: number;                 // horizontal distance
  /** Tile kinds the span passes over (unique, in order of first crossing). */
  over: TileKind[];
  /** Sag at the design temperature (m), tension H at the design temperature and at the everyday temperature (N). */
  sagDesignM: number; hDesignN: number; hEverydayN: number;
  /** Lowest clearance along the span at design temperature (m), what it must be (m), and where (m from `from`). */
  clearanceM: number; requiredM: number; atM: number;
  ok: boolean;
}

export type RouteRefusal =
  | { key: 'route.tooShort' }
  | { key: 'route.offMap'; at: [number, number] }
  | { key: 'route.noOverhead'; tile: number; kind: TileKind }          // e.g. crossing the town overhead
  | { key: 'route.noSupportGapTooLong'; gapM: number; maxSpanM: number; familyId: string }
  | { key: 'route.kvTooHigh'; kv: number; kvMax: number; familyId: string }
  | { key: 'route.noFoundation'; tile: number; kind: TileKind; familyId: string; needs: Foundation }   // e.g. a wood pole in swamp
  | { key: 'route.unknownFamily'; id: string }
  | { key: 'route.unknownConductor'; id: string }
  | { key: 'route.spanTooLong'; spanM: number; maxSpanM: number };

export interface RoutePlan {
  ok: true;
  supports: PlannedSupport[];
  spans: PlannedSpan[];
  /** Conductor route length (m) = sum of span lengths. */
  lengthM: number;
  /** Worst clearance margin over all spans (m; negative = a violation) and its span index. */
  worstMarginM: number; worstSpan: number;
  /** Counts for the bill of materials (pricing is done by the caller with the region pack's prices). */
  bom: {
    supports: Record<string, Record<AngleClass, number>>;     // family -> angle class -> count
    foundations: Record<Foundation, number>;
    conductorM: number;                                       // per phase-conductor metres (caller multiplies by conductors)
    clearedForestM: number;                                   // route metres over forest (right-of-way clearing)
  };
}
export type RouteResult = RoutePlan | { ok: false; refusal: RouteRefusal };
