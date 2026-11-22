import { describe, expect, it } from 'vitest';
import { analyseFeeder, applyAction, buildDistrict, districtExpected, endQuarter, previewProject, runPersona, planner, weeklyDistrict, type CareerState } from './index';

const cmPerCi = (s: CareerState): number => { const e = districtExpected(s); return e.saidi / e.saifi; };

describe('1.10 new districts teach different things', () => {
  const home = buildDistrict(5), city = buildDistrict(5, 'city'), moor = buildDistrict(5, 'moor');
  it('Harbour City: underground cable, far fewer interruptions but each much longer', () => {
    expect(city.feeders.every((f) => f.kind === 'cable')).toBe(true);
    expect(districtExpected(city).saifi).toBeLessThan(districtExpected(home).saifi * 0.4);
    expect(cmPerCi(city)).toBeGreaterThan(cmPerCi(home) * 2.5);
  });
  it('Harbour City: a recloser saves nothing on a cable; a tie saves a lot', () => {
    const f = city.feeders.find((x) => !x.tie)!;
    const rec = previewProject(city, 'recloser', f.id), tie = previewProject(city, 'tieSwitch', f.id);
    expect(Math.abs(rec.dSaidi ?? 0)).toBeLessThan(0.5);
    expect(tie.dSaidi ?? 0).toBeLessThan(-5);
  });
  it('High Moor: long lines and few customers; a recloser saves a bigger share than at home', () => {
    expect(moor.feeders.every((f) => f.kind === 'moor')).toBe(true);
    expect(moor.feeders[0]!.sections[0]!.lengthKm).toBeGreaterThan(home.feeders[0]!.sections[0]!.lengthKm * 1.5);
    const share = (s: CareerState): number => { const f = s.feeders[2]!, before = analyseFeeder(s, f).rel.saidi; const after = analyseFeeder(s, { ...f, recloser: true }).rel.saidi; return 1 - after / before; };
    expect(share(moor)).toBeGreaterThan(share(home) * 1.5);
  });
  it('High Moor: winter brings the storms (snow and ice)', () => {
    let s = moor; let winter = 0, summer = 0;
    for (let q = 0; q < 40; q++) { const n = endQuarter(s).state; const k = n.history[n.history.length - 1]!; if (q % 4 === 0) winter += k.faults; if (q % 4 === 2) summer += k.faults; s = n; if (s.ending) break; }
    expect(winter).toBeGreaterThan(summer);
  });
  it('both are winnable by the reference planner on most seeds', () => {
    for (const ch of ['city', 'moor'] as const) {
      const ends = [5, 11, 23].map((seed) => runPersona(seed, planner, 40, ch).state.ending);
      expect(ends.filter((e) => e === 'chiefEngineer' || e === 'steady').length, ch).toBeGreaterThanOrEqual(2);
    }
  });
  it('the weekly district never lands on the new districts (past boards keep their charters)', () => {
    for (let w = 1; w <= 53; w++) expect(['city', 'moor']).not.toContain(weeklyDistrict(2027, w).charter);
  });
  it('the district story: Harbour City has its own letters, High Moor its snow call', () => {
    const seen = (ch: 'city' | 'moor'): string[] => {
      let s = buildDistrict(11, ch); const ids: string[] = [];
      for (let q = 0; q < 40 && !s.ending; q++) {
        for (const o of [...s.story!.open]) { ids.push(o.id); const r = applyAction(s, { a: 'story', id: o.id, opt: 'b' }); if (r.ok) s = r.state; }
        s = endQuarter(s, true).state;
        if (s.phase === 'incident') { for (const o of [...s.story!.open]) { ids.push(o.id); const r = applyAction(s, { a: 'story', id: o.id, opt: 'a' }); if (r.ok) s = r.state; } s = endQuarter(s, true).state; }
      }
      return ids;
    };
    const c = seen('city'), m = seen('moor');
    expect(c).toContain('cityDucts'); expect(c).toContain('cityHeat'); expect(c).not.toContain('tomVillages'); expect(c).not.toContain('vanceVeg');
    expect(m).toContain('moorTurbine');
  });
});
