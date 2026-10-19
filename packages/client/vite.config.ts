import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  server: { host: true, port: 5173 },
  build: {
    target: 'es2022',
    rollupOptions: { input: { main: resolve(__dirname, 'index.html'), qa: resolve(__dirname, 'qa.html') } },
  },
});
