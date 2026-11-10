// Nightly property run: P1..P25 (DESIGN 9.2) at GRID_FUZZ_N cases each (default 50 000; `GRID_FUZZ_N=2000 pnpm fuzz` for a quick run).
// Runs every property file once, prints pass/fail and wall time, exits non-zero on any failure.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const n = process.env.GRID_FUZZ_N ?? '50000';
const files = [
  'src/sim/network/network.test.ts', 'src/sim/loadflow/properties.test.ts', 'src/sim/loadflow/properties2.test.ts',
  'src/sim/bench/props.test.ts', 'src/sim/dynamics/frequency.props.test.ts', 'src/sim/protection/faults.test.ts',
  'src/sim/protection/relays.test.ts', 'src/sim/dispatch/dispatch.props.test.ts', 'src/sim/weather/weather.test.ts', 'src/sim/pipeline.test.ts',
];
const t0 = Date.now();
console.log(`fuzz-nightly: GRID_FUZZ_N=${n}, ${files.length} files`);
const r = spawnSync(resolve(root, 'node_modules/.bin/vitest'), ['run', '--testTimeout=1800000', '--hookTimeout=1800000', ...files], {
  cwd: root, stdio: 'inherit', env: { ...process.env, GRID_FUZZ_N: n },
});
const s = ((Date.now() - t0) / 1000).toFixed(0);
console.log(`fuzz-nightly: ${r.status === 0 ? 'PASS' : 'FAIL'} (${n} cases per property) in ${s} s`);
process.exit(r.status ?? 1);
