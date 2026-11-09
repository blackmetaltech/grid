// Builds the engine sidecar: src/bridge.ts (+ core) → godot/sidecar/bridge.mjs, one self-contained ES module for Node 18
// (desktop: spawned by Godot; Android: run in-process by nodejs-mobile). Rebuild after every engine change: `pnpm bridge`.
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@core': fileURLToPath(new URL('./core/ts', import.meta.url)) } },
  build: {
    ssr: 'src/bridge.ts', outDir: 'godot/sidecar', emptyOutDir: true, target: 'node18', minify: false,
    rollupOptions: { output: { entryFileNames: 'bridge.mjs', format: 'es' } },
  },
  ssr: { noExternal: true },
});
