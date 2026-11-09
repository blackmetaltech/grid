import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// The game's tests. Core has its own suite (run it inside core/); here only src/ is tested.
export default defineConfig({
  resolve: { alias: { '@core': fileURLToPath(new URL('./core/ts', import.meta.url)) } },
  test: { include: ['src/**/*.test.ts'] },
});
