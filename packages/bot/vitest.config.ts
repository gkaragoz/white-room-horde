import { defineConfig } from 'vitest/config';

// the bot tests play stretches of real games: on a busy machine (or CI) five seconds is too tight a default
export default defineConfig({ test: { testTimeout: 60_000, hookTimeout: 60_000 } });
