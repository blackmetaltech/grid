// The version lives in several files. A release once shipped as 1.17.0 because two of them were not bumped (v1.18.0).
// All of them must agree with the newest CHANGELOG heading.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { verifier } from './scores';

const read = (p: string): string => readFileSync(join(__dirname, '..', p), 'utf8');
const changelogVersion = /^## \[(\d+\.\d+\.\d+)\]/m.exec(read('CHANGELOG.md'))?.[1];

describe('version sync', () => {
  it('the newest CHANGELOG heading has a version', () => {
    expect(changelogVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });
  it('package.json matches the CHANGELOG', () => {
    expect(JSON.parse(read('package.json')).version).toBe(changelogVersion);
  });
  it('godot/project.godot config/version matches the CHANGELOG', () => {
    expect(/^config\/version="([^"]+)"/m.exec(read('godot/project.godot'))?.[1]).toBe(changelogVersion);
  });
  it('the macOS export preset versions match the CHANGELOG', () => {
    const p = read('godot/export_presets.cfg');
    expect(/^application\/short_version="([^"]+)"/m.exec(p)?.[1]).toBe(changelogVersion);
    expect(/^application\/version="([^"]+)"/m.exec(p)?.[1]).toBe(changelogVersion);
  });
  it('the score rules accept the CHANGELOG version', () => {
    expect(verifier.gameVersions).toContain(changelogVersion);
  });
});
