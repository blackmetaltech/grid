// Chapter 4 design values (DESIGN 2.6 L10-L13, DEPTH 3-4). Region packs change prices and bands, never these: they are the scenarios of the four levels.
// tools/oracles/ch4_oracles.py repeats every number on purpose (independent re-derivation); src/level/ch4.test.ts compares the engine to its JSON.

// ---- L10 Balance the Phases: a 230/400 V, 4-wire street (IEC 60038) of 18 houses on 6 poles -------------------------------------------------
export type Phase = 'a' | 'b' | 'c';
export const PHASES: readonly Phase[] = ['a', 'b', 'c'];
/** Nominal phase-to-neutral volts: houses are constant-impedance loads at this voltage. */
export const V_PH = 230;
/** Transformer EMF behind its impedance (1.03 pu: the OLTC is set high for the evening, S23 earths the star point through 1 ohm). */
export const EMF_PH = 237;
export const Z_TX = { re: 0.012, im: 0.038 };   // 160 kVA 4 % 11/0.4 kV, per phase (ohm)
export const RN_TX = 0.0005;                    // neutral bonding of the transformer riser (ohm)
export const SPANS = 6;
export const SPAN_M = 70;
export const FEEDER_M = SPANS * SPAN_M;
/** ABC 3 x 70 mm2 Al phase conductors (ohm/km). */
export const Z_PH_KM = { re: 0.443, im: 0.082 };
export const X_N_KM = 0.082;
/** The neutral (messenger) conductor choices: mm2 -> resistance ohm/km, ampacity A, price USD per metre (game). 54.6 mm2 is what the street was built with. */
export const NEUTRAL: Record<number, { rOhmKm: number; ampacityA: number; usdPerM: number }> = {
  54.6: { rOhmKm: 0.554, ampacityA: 150, usdPerM: 3.0 }, 70: { rOhmKm: 0.443, ampacityA: 175, usdPerM: 3.9 }, 95: { rOhmKm: 0.32, ampacityA: 215, usdPerM: 5.2 },
};
export const NEUTRAL_SIZES: readonly number[] = [54.6, 70, 95];
export const NEUTRAL_STD = 54.6;
/** Houses: kW at the evening peak and power factor (ACs make the low ones). Three per pole, poles 1 to 6 from the transformer. */
export const HOUSES: readonly { kw: number; pf: number }[] = [
  [3.2, 0.95], [1.1, 0.85], [4.0, 0.80], [0.8, 0.90], [2.4, 1.0], [1.6, 0.85], [3.6, 0.90], [0.5, 0.95], [2.0, 0.80],
  [1.4, 1.0], [3.0, 0.85], [0.9, 0.90], [2.8, 0.95], [1.8, 0.80], [0.6, 1.0], [3.9, 0.85], [1.2, 0.90], [2.2, 0.95],
].map(([kw, pf]) => ({ kw: kw!, pf: pf! }));
/** Evening load shape, 19:00 to 23:00, one factor per block (the ACs are in from the first block). */
export const SHAPE: readonly number[] = [0.95, 1, 1, 1, 1, 1, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5];
/** Game prices, USD: a crew re-connects one service drop; upgrading the neutral costs the price difference per metre plus a crew day. */
export const PRICE10 = { moveHouse: 85, neutralCrew: 300 };

// ---- L11 Star or Delta: an industrial estate at 400 V ------------------------------------------------------------------------------------------
export const VL = 400;
export const EST = { kw: 500, pf: 0.7 };
/** Estate supply behind the bus: a weak rural feeder (about 4 MVA short-circuit level), per-phase impedance in ohm. */
export const Z_SUPPLY = { re: 0.008, im: 0.0392 };
export const PUMP = { kw: 75, eta: 0.92, pf: 0.88, startPf: 0.3 };
/** Starting current as a multiple of full-load current (DOL ~6x, Y-delta one third of DOL, soft starter current limit 3.5x). USD: what the player pays to fit it (the estate's pump has a DOL starter already). */
export const STARTERS = { dol: { mult: 6, usd: 0 }, yd: { mult: 2, usd: 1900 }, soft: { mult: 3.5, usd: 6500 } } as const;
export type Starter = keyof typeof STARTERS;
/** LV capacitor units per phase (the pack's cap-lv-25/50/100uF), can ratings and the price per kVAr of a can at its rating (USD, global pack). */
export const CAP_UNITS_UF: readonly number[] = [25, 50, 100];
export const CAN_RATINGS_V: readonly number[] = [250, 440];
export const CAP_USD_PER_KVAR = 25;
export const MAX_CANS = 140;
/** A can survives up to this multiple of its rated voltage (insulation margin); beyond it the unit bursts. */
export const CAN_TOLERANCE = 1.1;
export const PF_TARGET = 0.95;
export const DIP_MAX_PCT = 10;

// ---- L12 Over the Hill: Kestrel Falls hydro to the city over two 300 km 220 kV Zebra circuits --------------------------------------------------
export const BASE_MVA = 100;
export const X_DPRIME = 0.16;   // generator X'd (pu on 100 MVA)
export const X_GSU = 0.06;      // step-up transformers
export const ZEBRA = { xOhmKm: 0.417, km: 300, kv: 220, thermalMva: 210 };
export const X_CIRCUIT = (ZEBRA.xOhmKm * ZEBRA.km) / ((ZEBRA.kv * ZEBRA.kv) / BASE_MVA);
export const HYDRO = { mw: 200, H: 3, D: 1.5, f0: 50 };
export const VREF_STEPS: readonly number[] = [0.9, 0.95, 1, 1.05];
export const VREF_NIGHT = 0.9;
export const SERIES_PCT: readonly number[] = [0, 30, 50];
export const REDUCE_STEPS_MW: readonly number[] = [0, 20, 40, 60];
/** Game prices, USD: series capacitor at 15 USD/kVAr of its rating (3 I^2 Xc with I the circuit's thermal current), a re-dispatch contract per MW, the third circuit per km (DESIGN 4.3: 1.37 M per km per circuit). */
export const PRICE12 = { seriesUsdPerKvar: 15, redispatchUsdPerMw: 12000, circuitUsdPerKm: 1.37e6 };

// ---- L13 Exam Bridge: generator phasors ---------------------------------------------------------------------------------------------------------
export const XS = 1.2;
export const RATED = { vt: 1, i: 1, pf: 0.8 };
export const NIGHT = { p: 0.6, qTarget: -0.2, deltaMaxDeg: 60 };
export const EXAM_IDS = { E: 'L13.E', delta: 'L13.delta', pmax: 'L13.pmax' } as const;
