// The default region: a neutral, fictional setting ("Lumen Province"), US$, international standards (IEC 60038 voltages, a grid code
// modelled on ENTSO-E Continental Europe). Ships in v0.1. Values and confidence tags come from DESIGN §3.6, §4.7 and §4.8; the
// `recall` entries are known open items for the M1 data task (the EU network-code texts could not be opened); the release gate
// (releaseGateProblems, RELEASE=1) lists them. Bump `rulesetVersion` whenever a value in `data` changes (pins.ts enforces it).
import { defineRegion } from '@core/regions';
import { validateGridData, type GridRegionData } from '../data';

const SOGL = 'SOGL (EU) 2017/1485 Annex III (CE)';

export const GLOBAL = defineRegion<GridRegionData>({
  id: 'global', name: 'Global', status: 'shipping', rulesetVersion: 1,
  currency: { code: 'USD', symbol: '$', decimals: 2, position: 'prefix' },
  numbers: { grouping: 'western', decimal: '.', group: ',' },
  standards: { voltage: 'IEC 60038', gridcode: 'Lumen Grid Code', conductors: 'BS 215 / IEC 60228' },
  data: {
    f0: 50,
    voltage: {
      lvPhaseV: 230, lvLineV: 400,
      levelsKv: [11, 33, 66, 132, 220, 400],
      bandsKv: {
        '11': { minKv: 10, maxKv: 12 }, '33': { minKv: 30, maxKv: 36 }, '66': { minKv: 59.4, maxKv: 72.5 },
        '132': { minKv: 119, maxKv: 145 }, '220': { minKv: 198, maxKv: 245 }, '400': { minKv: 380, maxKv: 420 },
      },
      pctBandLevelsKv: [],
      lvBandPct: 10,
      mvBandPct: { learner: 6, engineer: 5 },
      emergencyMinKv: { '400': 360 },
    },
    gridcode: {
      standardRangeHz: [49.95, 50.05],
      maxSteadyDevHz: 0.2,
      maxInstDevHz: 0.8,
      fcrDeadbandHz: 0.01,
      fcrFullActivationS: 30,
      droopRangePct: [2, 12],
      ufls: [
        { hz: 49.0, shedPct: 5, delayS: 0.2 }, { hz: 48.8, shedPct: 8, delayS: 0.2 }, { hz: 48.6, shedPct: 8, delayS: 0.2 },
        { hz: 48.4, shedPct: 8, delayS: 0.2 }, { hz: 48.2, shedPct: 8, delayS: 0.2 }, { hz: 48.0, shedPct: 8, delayS: 0.2 },
      ],
      genUfTrip: { hz: 47.5, s: 0.5 },
      genOfTrip: { hz: 51.5, s: 2 },
      ovStages: [{ pu: 1.1, s: 5 }, { pu: 1.4, s: 0.1 }],
      uvLoadTrip: { pu: 0.85, s: 2 },
      settlementMin: 15,
    },
    economy: {
      energyPricePerMWh: 50,
      vollPerMWh: 10000,
      fuelPerGJ: { coal: 2.6, gas: 4, diesel: 25, biomass: 4 },
      nuclearPerMWhe: 7,
    },
    climate: { latitudeDeg: 23 },
    catalogues: { generators: [], transformers: [], compensation: [], storage: [], protection: [], lineCosts: [], cables: [], fuels: [] },
    provenance: {
      'f0': { source: `${SOGL}, nominal frequency`, confidence: 'recall' },
      'voltage.lv': { source: 'IEC 60038:2009 Table 1 (230/400 V)', confidence: 'standard' },
      'voltage.levelsKv': { source: 'IEC 60038:2009 Tables 3-5 (11, 33, 66, 132, 220, 400 kV)', confidence: 'standard' },
      'voltage.bandsKv': { source: 'upper = IEC 60038 highest equipment voltage; lower 0.90 pu modelled on SOGL Annex II (CE) ranges', confidence: 'game' },
      'voltage.lvBandPct': { source: 'EN 50160 (230/400 V +-10 %, 95 % of 10-min means)', confidence: 'recall' },
      'voltage.mvBandPct': { source: 'game band for MV load buses (Learner 6 %, Engineer 5 %)', confidence: 'game' },
      'gridcode.standardRangeHz': { source: SOGL, confidence: 'recall' },
      'gridcode.maxSteadyDevHz': { source: SOGL, confidence: 'recall' },
      'gridcode.maxInstDevHz': { source: SOGL, confidence: 'recall' },
      'gridcode.fcrDeadbandHz': { source: 'SOGL (EU) 2017/1485 Annex V (FCR insensitivity <= 10 mHz)', confidence: 'recall' },
      'gridcode.fcrFullActivationS': { source: 'SOGL (EU) 2017/1485 Annex V (full activation at +-200 mHz within 30 s)', confidence: 'recall' },
      'gridcode.droopRangePct': { source: 'NC RfG (EU) 2016/631 Art. 15(2)(d)', confidence: 'recall' },
      'gridcode.ufls.hz': { source: 'NC ER (EU) 2017/2196 Annex (CE: start 49.0 Hz, end 48.0 Hz, >= 6 steps)', confidence: 'recall' },
      'gridcode.ufls.shedPct': { source: 'stage quanta chosen inside the NC ER rules (<= 10 % per step, 45 % total)', confidence: 'game' },
      'gridcode.ufls.delayS': { source: 'relay 100 ms + breaker 100 ms (DESIGN S27)', confidence: 'game' },
      'gridcode.genUfTrip.hz': { source: 'NC RfG (EU) 2016/631 Art. 13 (CE)', confidence: 'recall' },
      'gridcode.genUfTrip.s': { source: 'trip delay (DESIGN S28)', confidence: 'game' },
      'gridcode.genOfTrip.hz': { source: 'NC RfG (EU) 2016/631 Art. 13 (CE)', confidence: 'recall' },
      'gridcode.genOfTrip.s': { source: 'trip delay (DESIGN S28)', confidence: 'game' },
      'gridcode.ovStages': { source: 'EHV over-voltage practice (DESIGN 3.8: 110 % for 5 s, 140 % for 100 ms)', confidence: 'recall' },
      'gridcode.uvLoadTrip': { source: 'game rule (DESIGN 3.8, 0.85 pu for 2 s)', confidence: 'game' },
      'gridcode.settlementMin': { source: 'EB GL (EU) 2017/2195 Art. 53', confidence: 'recall' },
      'economy.energyPricePerMWh': { source: 'typical US/EU wholesale order of magnitude (DESIGN 4.8)', confidence: 'game' },
      'economy.vollPerMWh': { source: 'anchored to LBNL 2015 value-of-service tables (DESIGN 4.8, S37)', confidence: 'game' },
      'economy.fuelPerGJ': { source: 'order-of-magnitude US 2023-25 delivered costs (DESIGN 4.1)', confidence: 'game' },
      'climate.latitudeDeg': { source: 'fictional province (DESIGN 11.2)', confidence: 'game' },
    },
  },
  strings: {
    region: 'Lumen Province', gridcode: 'Lumen Grid Code',
    'place.delta': 'Seaglass Delta', 'place.hydro': 'Kestrel Falls',
    'cast.mentor': 'Ada Moreno', 'cast.operator': 'Tobi Hart', 'cast.regulator': 'Commissioner Vance', 'cast.student': 'Nia',
    'licence.1': 'Graduate Engineer', 'licence.2': 'Project Engineer', 'licence.3': 'Senior Engineer', 'licence.4': 'Principal Engineer', 'licence.5': 'Chief Engineer',
  },
  leakMarkers: ['Lumen', 'Seaglass', 'Kestrel', 'Moreno', 'Vance'],
}, validateGridData);
