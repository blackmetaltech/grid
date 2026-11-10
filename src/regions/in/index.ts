// DRAFT region pack: India (DESIGN Appendix A). Not shipping in v0.1 (status 'draft': not offered to players), kept and tested so
// the region seam stays honest. Everything Indian lives here: rupees with lakh/crore grouping, IEGC grid-code values, CEA voltage
// bands, a fictional Indian state, local prices. `recall` rows are allowed in a draft pack; the release gate applies only if this
// pack ever ships. Bump `rulesetVersion` whenever a value in `data` changes (pins.ts enforces it).
import { defineRegion } from '@core/regions';
import { validateGridData, type GridRegionData } from '../data';

export const IN = defineRegion<GridRegionData>({
  id: 'in', name: 'India (draft)', status: 'draft', rulesetVersion: 1,
  currency: { code: 'INR', symbol: '₹', decimals: 2, position: 'prefix' },
  numbers: { grouping: 'indian', decimal: '.', group: ',' },
  standards: { voltage: 'CEA Grid Standards 2010', gridcode: 'IEGC', conductors: 'IS 398' },
  data: {
    f0: 50,
    voltage: {
      lvPhaseV: 230, lvLineV: 415,
      levelsKv: [11, 33, 66, 132, 220, 400, 765],
      bandsKv: {
        '33': { minKv: 30, maxKv: 36 }, '66': { minKv: 60, maxKv: 72 }, '132': { minKv: 122, maxKv: 145 },
        '220': { minKv: 198, maxKv: 245 }, '400': { minKv: 380, maxKv: 420 }, '765': { minKv: 728, maxKv: 800 },
      },
      pctBandLevelsKv: [11],
      lvBandPct: 6,
      mvBandPct: { learner: 6, engineer: 5 },
      emergencyMinKv: {},
    },
    gridcode: {
      standardRangeHz: [49.9, 50.05],
      maxSteadyDevHz: null,
      maxInstDevHz: null,
      fcrDeadbandHz: 0.03,
      fcrFullActivationS: 45,
      droopRangePct: [3, 6],
      ufls: [
        { hz: 49.4, shedPct: 5, delayS: 0.2 }, { hz: 49.2, shedPct: 6, delayS: 0.2 },
        { hz: 49.0, shedPct: 7, delayS: 0.2 }, { hz: 48.8, shedPct: 7, delayS: 0.2 },
      ],
      genUfTrip: { hz: 47.5, s: 0.5 },
      genOfTrip: { hz: 51.5, s: 2 },
      ovStages: [{ pu: 1.1, s: 5 }, { pu: 1.4, s: 0.1 }],
      uvLoadTrip: { pu: 0.85, s: 2 },
      settlementMin: 15,
    },
    economy: {
      energyPricePerMWh: 4500,
      vollPerMWh: 50000,
      fuelPerGJ: { coal: 220, gas: 800, diesel: 2500, biomass: 1300 },
      nuclearPerMWhe: null,
    },
    climate: { latitudeDeg: 23 },
    catalogues: { generators: [], transformers: [], compensation: [], storage: [], protection: [], lineCosts: [], cables: [], fuels: [] },
    provenance: {
      'f0': { source: 'IEGC cl. 30 (nominal 50 Hz)', confidence: 'standard' },
      'voltage.lv': { source: 'Indian LV supply practice, 415 V three-phase / 230 V phase', confidence: 'recall' },
      'voltage.levelsKv': { source: 'CEA Grid Standards 2010 voltage classes', confidence: 'secondary' },
      'voltage.bandsKv': { source: 'CEA Grid Standards 2010 (several copies agree; gazette not opened)', confidence: 'secondary' },
      'voltage.lvBandPct': { source: 'Indian LV supply-code band, +-6 % (unverified, varies by state)', confidence: 'recall' },
      'voltage.mvBandPct': { source: 'game band (Indian supply codes vary by state)', confidence: 'game' },
      'gridcode.standardRangeHz': { source: 'IEGC cl. 30 (49.90-50.05 Hz)', confidence: 'standard' },
      'gridcode.fcrDeadbandHz': { source: 'IEGC cl. 30.10(m) (deadband +-0.03 Hz)', confidence: 'standard' },
      'gridcode.fcrFullActivationS': { source: 'IEGC cl. 30.10(m) (full response within 45 s, sustained 5 min)', confidence: 'standard' },
      'gridcode.droopRangePct': { source: 'designer recall (3-6 %)', confidence: 'recall' },
      'gridcode.ufls.hz': { source: 'IEGC cl. 29.12 (49.4 / 49.2 / 49.0 / 48.8 Hz)', confidence: 'standard' },
      'gridcode.ufls.shedPct': { source: 'news summary of IEGC 2023 (5/6/7/7 %)', confidence: 'secondary' },
      'gridcode.ufls.delayS': { source: 'relay 100 ms + breaker 100 ms (DESIGN S27)', confidence: 'game' },
      'gridcode.genUfTrip.hz': { source: 'DESIGN 3.6 (S28)', confidence: 'game' },
      'gridcode.genUfTrip.s': { source: 'DESIGN 3.6 (S28)', confidence: 'game' },
      'gridcode.genOfTrip.hz': { source: 'DESIGN 3.6 (S28)', confidence: 'game' },
      'gridcode.genOfTrip.s': { source: 'DESIGN 3.6 (S28)', confidence: 'game' },
      'gridcode.ovStages': { source: 'EHV over-voltage practice (DESIGN 3.8)', confidence: 'recall' },
      'gridcode.uvLoadTrip': { source: 'game rule (DESIGN 3.8)', confidence: 'game' },
      'gridcode.settlementMin': { source: 'IEGC/CERC DSM 15-minute blocks (designer, not opened)', confidence: 'recall' },
      'economy.energyPricePerMWh': { source: 'about 2025 IEX day-ahead average, INR 4.5/kWh (powerline.net.in, DESIGN A.2)', confidence: 'secondary' },
      'economy.vollPerMWh': { source: 'designer value INR 50/kWh (DESIGN A.1)', confidence: 'game' },
      'economy.fuelPerGJ': { source: 'designer game constants for 2026 (DESIGN A.3: coal 220, LNG 800, diesel 2,500, biomass 1,300 INR/GJ)', confidence: 'game' },
      'climate.latitudeDeg': { source: 'fictional state (DESIGN A.1)', confidence: 'game' },
    },
  },
  strings: {
    region: 'Prakash Pradesh', gridcode: 'IEGC',
    'place.delta': 'Sundar delta', 'place.hydro': 'Kaveri Valley hydro',
    'cast.mentor': 'Kavya Rao', 'cast.operator': 'Sharma-ji', 'cast.regulator': 'Commissioner Iyer', 'cast.student': 'Asha',
    'licence.1': 'Junior Engineer', 'licence.2': 'Assistant Engineer', 'licence.3': 'Executive Engineer', 'licence.4': 'Superintending Engineer', 'licence.5': 'Chief Engineer',
  },
  leakMarkers: ['₹', 'lakh', 'crore', 'Prakash', 'Meera', 'Kavya', 'Sharma', 'Iyer', 'Asha', 'IEGC', 'CEA', 'CERC', 'IS 398'],
}, validateGridData);
