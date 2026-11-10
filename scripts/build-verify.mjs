// Builds the server verifier: src/leaderboard/entry.ts (+ engine, catalogues, levels) → dist/verify.mjs, one ES2022 module with no
// Node built-ins, <= 1.5 MB minified. Usage: node scripts/build-verify.mjs [--entry src/x.ts] [--out dist/x.mjs]
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { statSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
// esbuild is vite's dependency; resolve it through vite so no extra install is needed.
const esbuild = createRequire(createRequire(resolve(root, 'package.json')).resolve('vite/package.json'))('esbuild');
const out = resolve(root, arg('--out', 'dist/verify.mjs'));
mkdirSync(dirname(out), { recursive: true });
const MAX = 1.5 * 1024 * 1024;
const res = await esbuild.build({
  entryPoints: [resolve(root, arg('--entry', 'src/leaderboard/entry.ts'))], outfile: out, bundle: true, format: 'esm', target: 'es2022',
  platform: 'neutral', minify: true, legalComments: 'none', metafile: true, logLevel: 'warning',
  alias: { '@core': resolve(root, 'core/ts') },
});
const bad = Object.values(res.metafile.outputs).flatMap((o) => o.imports).filter((i) => i.external);
if (bad.length) { console.error('verify bundle has external imports:', bad.map((b) => b.path).join(', ')); process.exit(1); }
const size = statSync(out).size;
console.log(`${out}: ${(size / 1024).toFixed(0)} KB`);
if (size > MAX) { console.error('verify bundle exceeds 1.5 MB'); process.exit(1); }
