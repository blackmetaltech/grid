import { describe, expect, it } from 'vitest';
import { ieeeTime, fuseK, fuseMinMelt, fuseTotalClear, recloserPair, coordination, logLogTime } from './tcc';

describe('time-current curves', () => {
  it('IEEE very-inverse: t = TD (3.922/(M^2-1) + 0.0982)', () => {
    expect(ieeeTime('VI', 1, 3, 1)).toBeCloseTo(3.922 / 8 + 0.0982, 12);
    expect(ieeeTime('VI', 2, 3, 1)).toBeCloseTo(2 * (3.922 / 8 + 0.0982), 12);
    expect(ieeeTime('EI', 1, 1, 1)).toBe(Infinity);
  });
  it('inverse curves order MI > VI > EI at high multiples', () => {
    expect(ieeeTime('EI', 1, 20, 1)).toBeLessThan(ieeeTime('VI', 1, 20, 1));
  });
  it('log-log interpolation hits table points and is monotone', () => {
    const f = fuseK(40);
    expect(fuseMinMelt(f, 6 * 40)).toBeCloseTo(2.6, 12);
    expect(fuseMinMelt(f, 20 * 40)).toBeLessThan(fuseMinMelt(f, 10 * 40));
    expect(fuseMinMelt(f, 50)).toBe(Infinity);
    expect(logLogTime([[1, 10], [10, 1]], Math.sqrt(10))).toBeCloseTo(Math.sqrt(10), 9);
    expect(fuseTotalClear(f, 400)).toBeGreaterThan(fuseMinMelt(f, 400));
  });
  it('coordination range and worst margin; a too-slow fast curve breaks it', () => {
    const { fast, slow } = recloserPair(200);
    const ok = coordination(fast, slow, fuseK(65), 500, 3000);
    expect(ok.range).not.toBeNull();
    expect(ok.worstMargin).toBeGreaterThan(0);
    const bad = coordination({ ...fast, td: 3 }, slow, fuseK(65), 500, 3000);
    expect(bad.worstFast).toBeLessThan(0);
  });
});
