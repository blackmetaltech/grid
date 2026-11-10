// Solar PV (DESIGN 3.10; S34). Pure, deterministic (dmath). Angles in radians inside, degrees at the API.
import { dmath } from '@core/numerics';

const DEG = Math.PI / 180;
export const DEFAULT_LATITUDE_DEG = 23;
export const DC_AC_RATIO = 1.25;
export const INVERTER_EFF = 0.97;

/** Solar declination delta = 23.45 deg * sin(2 pi (284 + n)/365), radians; n = day of year 1..365. */
export function declination(dayOfYear: number): number {
  return 23.45 * DEG * dmath.sin((2 * Math.PI * (284 + dayOfYear)) / 365);
}

/**
 * Solar time (hours) of a block. Convention: BLOCK MIDPOINT, t = (block + 0.5) * 0.25 h, so blocks b and 95-b are
 * mirror images about solar noon (12:00) and the profile is exactly symmetric.
 */
export function blockSolarHour(block: number): number { return (block + 0.5) * 0.25; }

/** Hour angle omega = 15 deg/h * (t_solar - 12), radians. */
export function hourAngle(solarHour: number): number { return 15 * DEG * (solarHour - 12); }

/** cos(zenith) = sin(lat) sin(delta) + cos(lat) cos(delta) cos(omega). */
export function cosZenith(latDeg: number, dayOfYear: number, solarHour: number): number {
  const phi = latDeg * DEG, d = declination(dayOfYear);
  return dmath.sin(phi) * dmath.sin(d) + dmath.cos(phi) * dmath.cos(d) * dmath.cos(hourAngle(solarHour));
}

/** Zenith angle z = acos(cos z), radians (clamped). */
export function zenith(latDeg: number, dayOfYear: number, solarHour: number): number {
  return dmath.acos(Math.max(-1, Math.min(1, cosZenith(latDeg, dayOfYear, solarHour))));
}

/** G_clear = 1000 cos(z)^1.15 W/m2, 0 when the sun is down. */
export function clearSkyIrradiance(latDeg: number, dayOfYear: number, block: number): number {
  const c = cosZenith(latDeg, dayOfYear, blockSolarHour(block));
  return c <= 0 ? 0 : 1000 * dmath.pow(c, 1.15);
}

/** Day length (hours) = 24/pi * acos(-tan(lat) tan(delta)), clamped for polar day/night. */
export function dayLengthHours(latDeg: number, dayOfYear: number): number {
  const x = -dmath.tan(latDeg * DEG) * dmath.tan(declination(dayOfYear));
  return (24 / Math.PI) * dmath.acos(Math.max(-1, Math.min(1, x)));
}

/** T_cell = T_amb + 25 G/800, degC. */
export function cellTemperature(tAmbC: number, g: number): number { return tAmbC + (25 * g) / 800; }

/** P_dc = P_dc,rated (G/1000)(1 + gamma (T_cell - 25)), gamma = -0.004/degC; MW. */
export function pvDcPower(pDcRatedMW: number, g: number, tCellC: number, gammaPerC = -0.004): number {
  return pDcRatedMW * (g / 1000) * (1 + gammaPerC * (tCellC - 25));
}

/** P_ac = min(0.97 P_dc, P_ac,rated); MW. */
export function pvAcPower(pDcMW: number, pAcRatedMW: number): number { return Math.min(INVERTER_EFF * pDcMW, pAcRatedMW); }

/** Plant output, MW_ac, for a block: irradiance * cloud transmittance -> T_cell -> DC -> AC. P_dc,rated = DC/AC * P_ac,rated. */
export function pvPlantOutput(o: { pAcRatedMW: number; latDeg?: number; dayOfYear: number; block: number; tAmbC: number; transmittance?: number }): { gWm2: number; tCellC: number; pDcMW: number; pAcMW: number } {
  const g = clearSkyIrradiance(o.latDeg ?? DEFAULT_LATITUDE_DEG, o.dayOfYear, o.block) * Math.max(0, Math.min(1, o.transmittance ?? 1));
  const tCellC = cellTemperature(o.tAmbC, g);
  const pDcMW = Math.max(0, pvDcPower(o.pAcRatedMW * DC_AC_RATIO, g, tCellC));
  return { gWm2: g, tCellC, pDcMW, pAcMW: pvAcPower(pDcMW, o.pAcRatedMW) };
}
