// A released build must be scorable: the package version is one of the verifier's accepted game versions.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { verifier } from './scores';

describe('scores release check', () => {
  it('the package version is accepted by the rules bundle', () => {
    const v = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')).version as string;
    expect(verifier.gameVersions).toContain(v);
  });
});
