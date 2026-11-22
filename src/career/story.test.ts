import { describe, expect, it } from 'vitest';
import { applyAction, buildDistrict, decodeCareer, encodeCareer, endQuarter, replayCareer, startProject, type CareerAction, type CareerState } from './index';
import { BEATS, chooseStory, hospitalProtected } from './story';

/** Play interactively (incidents pause) until a storm beat opens; answers nothing else. */
function toStormBeat(seed: number, maxQ = 40): CareerState | null {
  let s = buildDistrict(seed);
  for (let q = 0; q < maxQ && !s.ending; q++) {
    s = endQuarter(s, true).state;
    if (s.phase === 'incident' && s.story!.open.some((o) => o.inc)) return s;
    if (s.phase === 'incident') s = endQuarter(s, true).state;
  }
  return null;
}
const settleCm = (s: CareerState): number => { const before = s.ytdCustMin; const r = endQuarter(s, true).state; return r.t % 4 === 0 ? r.history[r.history.length - 1]!.saidiReal : r.ytdCustMin - before; };

describe('1.9 storylines', () => {
  it('every beat has its two answers, their results, recaps and a lapse line in the locale, and distinct ids', async () => {
    const { EN_CAREER: career } = await import('../locales/career.en');
    const ids = new Set<string>();
    for (const b of BEATS) {
      expect(ids.has(b.id)).toBe(false); ids.add(b.id);
      for (const k of Object.values(b.keys)) expect((career as Record<string, string>)[k], k).toBeTruthy();
    }
  });

  it('a storm opens a call from the crew; the two answers move the outage in opposite directions', () => {
    const s = toStormBeat(11);
    expect(s).not.toBeNull();
    const o = s!.story!.open.find((x) => x.inc)!;
    const a = chooseStory(s!, o.id, 'a'), b = chooseStory(s!, o.id, 'b');
    expect(a.ok && b.ok).toBe(true);
    const ca = settleCm(a.state), cb = settleCm(b.state);
    expect(ca).not.toBe(cb);
    const beat = BEATS.find((x) => x.id === o.id)!;
    expect(ca < cb).toBe((beat.a.cm ?? 1) < (beat.b.cm ?? 1));
    // answered once: the same call cannot be answered twice
    expect(chooseStory(a.state, o.id, 'b').ok).toBe(false);
  });

  it('an unanswered call lapses at the end of the quarter: logged, trust only, no change to the outage', () => {
    const s = toStormBeat(11)!;
    const o = s.story!.open.find((x) => x.inc)!;
    const lapsed = endQuarter(s, true).state;
    expect(lapsed.story!.open.length).toBe(0);
    expect(lapsed.story!.log.some((l) => l.id === o.id && l.opt === 'lapse')).toBe(true);
    const beat = BEATS.find((x) => x.id === o.id)!;
    expect(beat.lapse.cm ?? 1).toBe(beat.id === 'tobiShort' ? 1.2 : 1);
  });

  it('a written promise to the hospital comes due: broken when nothing was built, kept when a tie went in', () => {
    // walk to the quarter the hospital letter opens
    let s = buildDistrict(5);
    while (!s.story!.open.some((o) => o.id === 'inesPromise') && s.t < 10) s = endQuarter(s).state;
    expect(s.story!.open.some((o) => o.id === 'inesPromise')).toBe(true);
    s = chooseStory(s, 'inesPromise', 'a').state;
    const due = s.story!.due!;
    expect(due).toBe(s.t + 8);
    // A: build nothing
    let a = s;
    while (a.t < due && !a.ending) a = endQuarter(a).state;
    expect(a.story!.open.some((o) => o.id === 'inesBroken')).toBe(true);
    // B: a tie switch on the hospital feeder
    let b = startProject(s, 'tieSwitch', s.story!.hospital).state;
    while (b.t < due && !b.ending) b = endQuarter(b).state;
    expect(hospitalProtected(b, b.story!)).toBe(true);
    expect(b.story!.open.some((o) => o.id === 'inesKept')).toBe(true);
  });

  it('story answers ride in the career code and replay to the same state', () => {
    let s = buildDistrict(5); const acts: CareerAction[] = [];
    const go = (a: CareerAction): void => { const r = applyAction(s, a); if (r.ok) { s = r.state; acts.push(a); } };
    for (let q = 0; q < 12; q++) {
      for (const o of [...s.story!.open]) go({ a: 'story', id: o.id, opt: q % 2 ? 'a' : 'b' });
      go({ a: 'end', interactive: true });
      if (s.phase === 'incident') { for (const o of [...s.story!.open]) go({ a: 'story', id: o.id, opt: 'a' }); go({ a: 'end', interactive: true }); }
    }
    expect(acts.some((a) => a.a === 'story')).toBe(true);
    const code = encodeCareer(5, acts), d = decodeCareer(code)!;
    expect(d.actions).toEqual(acts);
    const r = replayCareer(5, d.actions);
    expect(r.rejected).toBe(0);
    expect(JSON.stringify(r.state.story)).toBe(JSON.stringify(s.story));
  });

  it('the apprentices add a crew; the tree-cutting pause sets the level to 0', () => {
    let s = buildDistrict(9);
    while (!s.story!.open.some((o) => o.id === 'tobiApprentices') && s.t < 30) s = endQuarter(s).state;
    const c0 = s.crews;
    expect(chooseStory(s, 'tobiApprentices', 'a').state.crews).toBe(c0 + 1);
    let v = buildDistrict(9);
    while (!v.story!.open.some((o) => o.id === 'vanceVeg') && v.t < 16) v = endQuarter(v).state;
    expect(chooseStory(v, 'vanceVeg', 'a').state.vegLevel).toBe(0);
  });
});
