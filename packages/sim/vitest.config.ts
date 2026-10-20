import { defineConfig } from 'vitest/config';

// the simulation tests play whole games: on a busy machine (or CI) five seconds is too tight a default
export default defineConfig({ test: { testTimeout: 60_000, hookTimeout: 60_000 } });
