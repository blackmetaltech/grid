// Every scaffolded game inherits this guard: game rules must not call Math.sin/exp/pow/... or use `**`, because
// those are not bit-reproducible between desktop Node and Android's nodejs-mobile. Use `dmath` from '@core/numerics'.
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { findNativeTranscendentals } from '@core/kit/determinism';

describe('determinism', () => {
  it('src/ uses dmath instead of Math.sin/cos/exp/log/pow/... and has no `**`', () => {
    const offenders = findNativeTranscendentals(fileURLToPath(new URL('.', import.meta.url)));
    expect(offenders.map((o) => `${o.file}:${o.line}: ${o.message}\n    ${o.text}`)).toEqual([]);
  });
});
