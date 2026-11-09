// Engine sidecar entry (built by vite into godot/sidecar/bridge.mjs). All logic lives in game.ts and core.
import { runBridge } from '@core/kit/bridge';
import { GAME } from './game';

runBridge(GAME);
