import { defineConfig } from 'vitest/config';

// the client's logic that does not need a browser (src/view): plain Node, no DOM
export default defineConfig({ test: { environment: 'node', include: ['tests/**/*.test.ts'] } });
