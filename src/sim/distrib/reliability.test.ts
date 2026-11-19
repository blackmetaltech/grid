import { describe, expect, it } from 'vitest';
import { reliability, type ReliabilitySection } from './reliability';

const chain = (dev: ReliabilitySection['device'][], tie = false): ReliabilitySection[] => [0, 1, 2].map((i) => ({
  id: 'S' + (i + 1), parent: i ? 'S' + i : null, lengthKm: 2, lambdaPerKm: 0.1, repairH: 4, customers: 100, avgLoadKw: 300,
  device: dev[i], ...(tie && i === 2 ? { tie: { closeH: 0.25 } } : {}),
}));

describe('radial reliability', () => {
  it('no devices: every fault interrupts everyone for the repair time', () => {
    const r = reliability(chain(['none', 'none', 'none']));
    expect(r.saifi).toBeCloseTo(0.6, 12); // 3 sections x 0.2 faults/yr
    expect(r.saidi).toBeCloseTo(0.6 * 4 * 60, 9);
    expect(r.caidi).toBeCloseTo(240, 9);
    expect(r.ensMWh).toBeCloseTo(0.6 * 4 * 0.9, 9);
  });
  it('sectionalisers cut SAIDI, not SAIFI; remote beats manual', () => {
    const none = reliability(chain(['none', 'none', 'none'])), man = reliability(chain(['none', 'manual', 'manual'])), rem = reliability(chain(['none', 'remote', 'remote']));
    expect(man.saifi).toBeCloseTo(none.saifi, 12);
    expect(man.saidi).toBeLessThan(none.saidi);
    expect(rem.saidi).toBeLessThan(man.saidi);
  });
  it('a tie restores the downstream loads; momentary (<5 min) outages are not in SAIFI', () => {
    const noTie = reliability(chain(['none', 'manual', 'manual'])), tie = reliability(chain(['none', 'manual', 'manual'], true));
    expect(tie.saidi).toBeLessThan(noTie.saidi);
    const fast = reliability(chain(['none', 'remote', 'remote']), { manualH: 1, remoteH: 0.04, fuseH: 1 });
    const slow = reliability(chain(['none', 'remote', 'remote']), { manualH: 1, remoteH: 0.2, fuseH: 1 }); // 12 min: sustained
    expect(fast.saifi).toBeLessThan(slow.saifi);
  });
  it('per-section contributions add up to the totals', () => {
    const r = reliability(chain(['none', 'fuse', 'manual'], true));
    expect(r.sections.reduce((a, s) => a + s.saidiMin, 0)).toBeCloseTo(r.saidi, 9);
    expect(r.sections.reduce((a, s) => a + s.ensMWh, 0)).toBeCloseTo(r.ensMWh, 9);
  });
});
