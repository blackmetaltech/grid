// Every star condition (star2 / star3 threshold) of every level has a lamp sentence (TH_<threshold>) in the Godot string tables, so the
// work order never prints a lamp without saying what it asks (chapter 8 shipped without them: CRITIQUE-1.1 #4).
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { LEVEL_SPECS } from './level';

const ui = join(__dirname, '..', 'godot', 'ui');
const files = [join(ui, 'grid_strings.gd'), ...readdirSync(ui, { withFileTypes: true }).filter((d) => d.isDirectory()).flatMap((d) => readdirSync(join(ui, d.name)).filter((f) => f.endsWith('_strings.gd')).map((f) => join(ui, d.name, f)))];
const TH = new Set(files.flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/"TH_(\w+)"\s*:/g)].map((m) => m[1]!)));
// levels whose lamps are written out whole by work_order.lamp_texts (exam bridges with their own sentences)
const OWN = new Set(['L22', 'L27']);

describe('lamp sentences', () => {
  it('every star threshold has a TH_ sentence', () => {
    const missing: string[] = [];
    for (const spec of LEVEL_SPECS) {
      if (!spec.stars || OWN.has(spec.id)) continue;
      for (const c of [...(spec.star2 ?? []), ...spec.star3]) { const k = c.min ?? c.max; if (k && !TH.has(k)) missing.push(`${spec.id}:${k}`); }
    }
    expect(missing).toEqual([]);
  });
});
