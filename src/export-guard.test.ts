// Godot exports leave out godot/tests/ (export_presets exclude_filter). A shipped script that names a class declared there fails to
// parse on Android and the game never starts (found on the Pixel, 2026-11-10). Shipped scripts must load test code by path only.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const GODOT = fileURLToPath(new URL('../godot', import.meta.url));
const walk = (d: string, out: string[] = []): string[] => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) { if (!/^(\.godot|android|addons|build)$/.test(f)) walk(p, out); } else if (f.endsWith('.gd')) out.push(p);
  }
  return out;
};

describe('export guard', () => {
  it('no shipped GDScript names a class that lives in godot/tests/', () => {
    const files = walk(GODOT);
    const testClasses = files.filter((f) => f.includes('/tests/')).flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/^class_name\s+(\w+)/gm)].map((m) => m[1]!));
    const bad: string[] = [];
    for (const f of files.filter((x) => !x.includes('/tests/'))) {
      const src = readFileSync(f, 'utf8').split('\n');
      src.forEach((line, i) => { for (const c of testClasses) if (new RegExp(`\\b${c}\\b`).test(line.replace(/#.*$/, ''))) bad.push(`${f.slice(GODOT.length + 1)}:${i + 1}: ${c}`); });
    }
    expect(testClasses.length).toBeGreaterThan(0);
    expect(bad).toEqual([]);
  });
});
