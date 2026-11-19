import { describe, expect, it } from 'vitest';
import SC from './scenarios.json';
import { chainFeeder } from './radial';
import { solveWithPv, hostingCapacity, voltVarQPu, VOLT_VAR_CAT_B } from './hosting';

const feeder = () => chainFeeder(SC.feeder5.kV, SC.feeder5.sections);
const sites = SC.hosting.sites;

describe('PV hosting', () => {
  it('PV raises the far-end voltage', () => {
    const f = feeder(), a = solveWithPv(f, { sites, loadScale: 0.3 }, 0), b = solveWithPv(f, { sites, loadScale: 0.3 }, 2000);
    expect(b.byId['n5']!.vPu).toBeGreaterThan(a.byId['n5']!.vPu);
  });
  it('volt-var curve is piecewise linear with a deadband', () => {
    expect(voltVarQPu(VOLT_VAR_CAT_B, 1)).toBe(0);
    expect(voltVarQPu(VOLT_VAR_CAT_B, 1.05)).toBeCloseTo(-0.22, 12);
    expect(voltVarQPu(VOLT_VAR_CAT_B, 0.9)).toBe(0.44);
  });
  it('volt-var raises hosting capacity; hosting result sits on the limit', () => {
    const lim = { vMaxPu: SC.hosting.vMaxPu };
    const u = hostingCapacity(feeder(), { sites, loadScale: 0.3 }, lim);
    const v = hostingCapacity(feeder(), { sites, loadScale: 0.3, voltVar: VOLT_VAR_CAT_B }, lim);
    expect(v.hostingKw).toBeGreaterThan(u.hostingKw);
    expect(u.atLimit.maxVPu).toBeLessThanOrEqual(lim.vMaxPu);
    expect(u.limitedBy).toBe('voltage');
  });
  it('OLTC with line-drop compensation lowers the tap under reverse flow', () => {
    const oltc = { vSetPu: 1.02, bandPu: 0.01, ratedA: 400, rLdcPu: 0.05, xLdcPu: 0.05 };
    const a = solveWithPv(feeder(), { sites, loadScale: 1, oltc }, 0), b = solveWithPv(feeder(), { sites, loadScale: 0.3, oltc }, 4000);
    expect(a.oltcStep).toBeGreaterThan(b.oltcStep);
  });
});
