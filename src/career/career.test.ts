import { describe, expect, it } from 'vitest';
import { Rng } from '@core/kit';
import {
  acceptConnection, applyAction, avgHealth, buildDistrict, cancelProject, careerHash, careerScore, crewsFree, decodeCareer, dispatchCrew, encodeCareer, endQuarter, inspect,
  poisson, previewProject, quoteProject, replayCareer, runPersona, setVegetationBudget, startProject, stateHash, switchTie, totalCustomers, trueHealth, planner, idle, firefighter,
  type CareerAction, type CareerState,
} from './index';

const finite = (x: unknown): boolean => JSON.stringify(x, (_k, v) => (typeof v === 'number' && !Number.isFinite(v) ? '#BAD' : v)).indexOf('#BAD') < 0;
const play = (s: CareerState, n: number): CareerState => { for (let i = 0; i < n; i++) s = endQuarter(s).state; return s; };

describe('district', () => {
  it('2 primaries x 2 transformers, 9 feeders, about 40 000 customers, 36 line assets with ages and health', () => {
    const s = buildDistrict(7);
    expect(s.primaries.length).toBe(2); expect(s.feeders.length).toBe(9);
    expect(s.assets.filter((a) => a.cls === 'tx').length).toBe(4); expect(s.assets.filter((a) => a.cls === 'line').length).toBe(36);
    expect(totalCustomers(s)).toBeGreaterThan(38000); expect(totalCustomers(s)).toBeLessThan(42000);
    for (const a of s.assets) { expect(trueHealth(a, 0)).toBeGreaterThanOrEqual(1); expect(trueHealth(a, 0)).toBeLessThanOrEqual(10); expect(a.installQ).toBeLessThan(0); }
    expect(avgHealth(s)).toBeLessThan(5.5); // the assets are old
    expect(s.saidiTarget).toBeGreaterThan(0); expect(s.ar).toBeGreaterThan(5);
  });
  it('different seeds give different districts, the same seed the same one', () => {
    expect(stateHash(buildDistrict(1))).toBe(stateHash(buildDistrict(1)));
    expect(stateHash(buildDistrict(1))).not.toBe(stateHash(buildDistrict(2)));
  });
});

describe('actions are pure and validated', () => {
  const s0 = buildDistrict(3);
  it('startProject returns a new state and leaves the old one alone', () => {
    const h = stateHash(s0), r = startProject(s0, 'tieSwitch', 'F1');
    expect(r.ok).toBe(true); expect(stateHash(s0)).toBe(h);
    expect(r.state.projects.length).toBe(1); expect(r.messageKey).toBe('career.project.started'); expect(r.params.capexM).toBeCloseTo(0.35, 9);
  });
  it('rejects duplicates, impossible targets, no free crew, the wrong phase', () => {
    let s = startProject(s0, 'tieSwitch', 'F1').state;
    expect(startProject(s, 'tieSwitch', 'F1').messageKey).toBe('career.err.duplicate');
    expect(startProject(s0, 'tieSwitch', 'F2').ok).toBe(false); // F2 already has a tie
    expect(startProject(s0, 'reconductor', 'nonsense').ok).toBe(false);
    expect(startProject(s0, 'remoteSwitch', 'F1.1').messageKey).toBe('career.err.headSection');
    for (const f of ['F1', 'F3', 'F4', 'F6']) { const r = startProject(s, 'recloser', f); if (r.ok) s = r.state; }
    expect(crewsFree(s)).toBe(0);
    expect(startProject(s, 'recloser', 'F7').messageKey).toBe('career.err.noCrew');
    expect(switchTie(s0, 'x').messageKey).toBe('career.err.phase'); // incident actions need the incident phase
  });
  it('a project pays its instalments, finishes after its lead time and applies its effect', () => {
    let s = startProject(s0, 'tieSwitch', 'F1').state;
    const f = (x: CareerState) => x.feeders.find((q) => q.id === 'F1')!;
    expect(f(s).tie).toBe(false);
    s = endQuarter(s).state; expect(f(s).tie).toBe(false); expect(s.projects[0]!.left).toBe(1);
    s = endQuarter(s).state; expect(f(s).tie).toBe(true); expect(s.projects.length).toBe(0); // done projects leave the board
    const rc = startProject(s0, 'reconductor', 'F1.1').state; // Dog -> Hyena
    const done = play(rc, 2);
    expect(done.feeders[0]!.sections[0]!.conductor).toBe('Hyena');
    expect(done.assets.find((a) => a.id === 'F1.1')!.wearFaults).toBe(0);
  });
  it('cancel removes a project (the spent money is sunk)', () => {
    let s = startProject(s0, 'newFeeder', 'P1').state; s = endQuarter(s).state;
    const c = cancelProject(s, 'J1');
    expect(c.ok).toBe(true); expect(c.state.projects.length).toBe(0); expect(c.params.sunkM).toBeGreaterThan(0);
    expect(cancelProject(s0, 'J9').ok).toBe(false);
  });
  it('inspection reveals the true health and costs money; vegetation budget is bounded', () => {
    const r = inspect(s0, 'F2.2'), a = r.state.assets.find((x) => x.id === 'F2.2')!;
    expect(a.known!.health).toBeCloseTo(trueHealth(a, 0), 12); expect(r.state.cash).toBeLessThan(s0.cash);
    expect(setVegetationBudget(s0, 5).ok).toBe(false);
    expect(setVegetationBudget(s0, 3).state.vegLevel).toBe(3);
    const hi = play(setVegetationBudget(s0, 3).state, 8), lo = play(setVegetationBudget(s0, 0).state, 8);
    expect(hi.feeders[0]!.veg).toBeLessThan(lo.feeders[0]!.veg);
  });
  it('a project preview names the effect: a tie cuts expected SAIDI; a reconductor lowers loading', () => {
    const tie = previewProject(s0, 'tieSwitch', 'F1');
    expect(tie.dSaidi).toBeLessThan(0);
    const rc = previewProject(s0, 'reconductor', 'F1.1');
    expect(rc.loadingAfterPct).toBeLessThan(rc.loadingBeforePct); expect(rc.whyKey).toBe('career.why.reconductor');
    expect(quoteProject(s0, 'newTransformer', 'P1').capexM).toBeGreaterThan(3);
  });
});

describe('the quarter', () => {
  it('growth, ageing, money and KPIs advance; every number stays finite', () => {
    let s = buildDistrict(5);
    const kw0 = s.feeders[0]!.baseKw;
    s = play(s, 8);
    expect(s.t).toBe(8); expect(s.history.length).toBe(8); expect(s.reviews.length).toBe(2);
    expect(s.feeders[0]!.baseKw).toBeGreaterThan(kw0); expect(s.rab).toBeGreaterThan(0);
    expect(finite(s)).toBe(true);
    const k = s.history[7]!; expect(k.saidiExp).toBeGreaterThan(0); expect(k.cash).toBe(s.cash);
    expect(s.reviews[0]!.verdicts.map((v) => v.axis)).toEqual(['regulator', 'finance', 'crew']);
  });
  it('realised outages are seeded: the same seed gives the same luck, another seed another', () => {
    const a = play(buildDistrict(11), 12).history.map((k) => k.saidiReal), b = play(buildDistrict(11), 12).history.map((k) => k.saidiReal), c = play(buildDistrict(12), 12).history.map((k) => k.saidiReal);
    expect(a).toEqual(b); expect(a).not.toEqual(c);
  });
  it('realised SAIDI scatters around the expected value (the average over seeds is within a factor of 1.6)', () => {
    let real = 0, ex = 0;
    for (let seed = 1; seed <= 20; seed++) { const h = play(buildDistrict(seed), 4).history; real += h.reduce((x, k) => x + k.saidiReal, 0); ex += h.reduce((x, k) => x + k.saidiExp, 0); }
    expect(real / ex).toBeGreaterThan(0.6); expect(real / ex).toBeLessThan(1.6);
  });
  it('Poisson draws have the right mean and variance', () => {
    const r = new Rng(99); let sum = 0, sq = 0; const n = 6000;
    for (let i = 0; i < n; i++) { const k = poisson(r, 3.2); sum += k; sq += k * k; }
    const m = sum / n; expect(Math.abs(m - 3.2)).toBeLessThan(0.1); expect(Math.abs(sq / n - m * m - 3.2)).toBeLessThan(0.3);
  });
  it('connection requests arrive; accepting one moves its load onto the feeder and pays the charge', () => {
    let s = buildDistrict(5);
    for (let i = 0; i < 12 && !s.requests.length; i++) s = endQuarter(s).state;
    expect(s.requests.length).toBeGreaterThan(0);
    const r = s.requests[0]!, f0 = s.feeders.find((f) => f.id === r.feederId)!;
    const res = acceptConnection(s, r.id);
    expect(res.ok).toBe(true);
    const f1 = res.state.feeders.find((f) => f.id === r.feederId)!;
    expect(f1.customers).toBe(f0.customers + r.customers); expect(f1.baseKw).toBeCloseTo(f0.baseKw + r.kw, 9);
    expect(res.state.cash).toBeCloseTo(s.cash + r.chargeM, 12); expect(res.state.requests.length).toBe(s.requests.length - 1);
    expect(acceptConnection(res.state, r.id).ok).toBe(false);
  });
  it('interactive quarters pause on incidents; a tie and a crew cut the incident customer-minutes', () => {
    let found = false;
    for (let seed = 1; seed <= 30 && !found; seed++) {
      let s = buildDistrict(seed);
      for (let q = 0; q < 12 && !found; q++) {
        const r = endQuarter(s, true);
        if (r.state.phase === 'incident') {
          found = true;
          const p = r.state, inc = p.incidents[0]!;
          expect(r.messageKey).toBe('career.incidents');
          expect(startProject(p, 'recloser', 'F1').messageKey).toBe('career.err.phase');
          let q2 = p; const tie = switchTie(q2, inc.id); if (inc.hasTie) { expect(tie.ok).toBe(true); q2 = tie.state; } else expect(tie.ok).toBe(false);
          const cr = dispatchCrew(q2, inc.id); expect(cr.ok).toBe(true); q2 = cr.state;
          expect(dispatchCrew(q2, inc.id).ok).toBe(false);
          const a = endQuarter(p).state, b = endQuarter(q2).state;
          expect(a.phase).toBe('plan'); expect(b.history[b.history.length - 1]!.saidiReal).toBeLessThanOrEqual(a.history[a.history.length - 1]!.saidiReal + 1e-9);
          expect(b.cash).toBeLessThan(a.cash + 1); // the crew cost money
        }
        s = r.state.phase === 'incident' ? endQuarter(r.state).state : r.state;
      }
    }
    expect(found).toBe(true);
  });
});

describe('endings', () => {
  it('idle ends early (licence revoked or bailed out), a finished career ends with an ending key and rejects further actions', () => {
    const r = runPersona(1, idle);
    expect(['licenceRevoked', 'bailedOut']).toContain(r.state.ending); expect(r.state.phase).toBe('over');
    expect(endQuarter(r.state).ok).toBe(false); expect(startProject(r.state, 'recloser', 'F1').ok).toBe(false);
    expect(careerScore(r.state)).toBeLessThan(0);
    const p = runPersona(2, planner);
    expect(p.state.t).toBeGreaterThan(0); expect(['chiefEngineer', 'steady', 'licenceRevoked', 'bailedOut']).toContain(p.state.ending);
    if (p.state.ending === 'chiefEngineer') { expect(p.state.t).toBe(40); expect(p.state.yearsMet).toBeGreaterThanOrEqual(8); expect(avgHealth(p.state)).toBeGreaterThan(p.state.startHealth); }
  });
  it('bailout: borrowing past the credit limit ends the career', () => {
    let s = buildDistrict(4); s = { ...s, cash: -20 }; s = endQuarter(s).state;
    expect(s.ending).toBe('bailedOut');
  });
  it('the time limit: 40 quarters', () => {
    const r = runPersona(2, planner, 60);
    expect(r.state.t).toBeLessThanOrEqual(40);
  });
});

describe('determinism: a career is a seed and an action list', () => {
  it('replaying a persona career reproduces the final state hash; the career code round-trips', () => {
    for (const [seed, p] of [[3, planner], [5, firefighter]] as const) {
      const r = runPersona(seed, p, 20), h = stateHash(r.state);
      expect(careerHash(seed, r.actions)).toBe(h);
      const code = encodeCareer(seed, r.actions), back = decodeCareer(code)!;
      expect(back.seed).toBe(seed); expect(back.actions).toEqual(r.actions);
      expect(careerHash(back.seed, back.actions)).toBe(h);
      expect(replayCareer(seed, r.actions).rejected).toBe(0);
    }
  });
  it('rejected actions are deterministic no-ops; a malformed code is refused', () => {
    const acts: CareerAction[] = [{ a: 'start', kind: 'tieSwitch', target: 'F2' }, { a: 'tie', id: 'zz' }, { a: 'end' }, { a: 'end' }];
    const x = replayCareer(9, acts), y = replayCareer(9, acts);
    expect(x.rejected).toBe(2); expect(stateHash(x.state)).toBe(stateHash(y.state));
    expect(decodeCareer('junk')).toBeNull(); expect(decodeCareer('C1/5/s:bogus:F1')).toBeNull();
    expect(applyAction(buildDistrict(1), { a: 'veg', level: 2 }).ok).toBe(true);
  });
  it('the leaderboard check: a tampered action list gives a different hash', () => {
    const r = runPersona(6, planner, 12), tampered = r.actions.filter((a) => !(a.a === 'start')).slice();
    expect(careerHash(6, tampered)).not.toBe(stateHash(r.state));
  });
});
