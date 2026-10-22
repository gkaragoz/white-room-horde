import { defineConfig } from 'vitest/config';

// the client's logic that does not need a browser (src/view, the pure QA tests): plain Node, no DOM
export default defineConfig({ test: { environment: 'node', include: ['tests/**/*.test.ts'], setupFiles: ['tests/setup.ts'], testTimeout: 30_000 } });
