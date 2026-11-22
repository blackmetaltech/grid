// LOOK2: every texture under a 3D folder of the Godot project is imported with mipmaps and VRAM compression (normal maps as RGTC).
// Without mip levels a terrain texture seen from kilometres away aliases into grain (the owner saw it, 2026-11-22).
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', 'godot');
const DIRS = ['world3d'];
function imports(dir: string): string[] {
  const out: string[] = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...imports(p));
    else if (n.endsWith('.import') && /\.(png|jpg|jpeg|webp|exr|hdr)\.import$/.test(n)) out.push(p);
  }
  return out;
}

describe('3D textures are imported for distance', () => {
  const files = DIRS.flatMap((d) => imports(join(ROOT, d)));
  it('finds the 3D textures', () => { expect(files.length).toBeGreaterThan(0); });
  for (const f of files) {
    it(`${f.slice(ROOT.length + 1)}: mipmaps on, VRAM compressed`, () => {
      const t = readFileSync(f, 'utf8');
      expect(t).toMatch(/^mipmaps\/generate=true$/m);
      expect(t).toMatch(/^compress\/mode=2$/m);
      if (/_normal\./.test(f)) expect(t).toMatch(/^compress\/normal_map=1$/m);
    });
  }
});
