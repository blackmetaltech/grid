// Chapter 6 query: the day's net load (demand minus the sun) as the engine will see it, so the card can draw the forecast before Run.
import type { QueryFn } from '@core/kit';
import { BLOCKS_PER_DAY, type GridState } from './types';
import { pvPlantOutput } from './sim/weather';
import { START_DOY } from './sim/tick';
import type { SimParams } from './sim/params';

export function buildFreqQueries(d: { getParams: (s: GridState) => SimParams }): Record<string, QueryFn<GridState>> {
  return {
    /** netForecast: net load (MW) per block of the day from the loads' shapes and the clear-sky PV model, and the steepest climb in MW/min. Shapes only: loads without one are skipped. */
    netForecast: (s) => {
      const p = d.getParams(s), doy = ((START_DOY - 1 + s.clock.day) % 365) + 1;
      const net: number[] = [];
      for (let b = 0; b < BLOCKS_PER_DAY; b++) {
        const dem = s.loads.reduce((a, l) => a + (l.shape ? (l.shape.p[b] ?? 0) * l.Ppeak : 0), 0);
        const pv = s.units.reduce((a, u) => a + (u.kind === 'pv' ? pvPlantOutput({ pAcRatedMW: u.pMax, latDeg: p.latitudeDeg, dayOfYear: doy, block: b, tAmbC: s.weather.tempC, transmittance: 1 }).pAcMW : 0), 0);
        net.push(dem - pv);
      }
      let ramp = 0, at = 0;
      for (let b = 1; b < net.length; b++) { const r = (net[b]! - net[b - 1]!) / 15; if (r > ramp) { ramp = r; at = b; } }
      return { net, ramp, at };
    },
  };
}
