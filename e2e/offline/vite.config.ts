import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  esbuild: { jsx: 'automatic' },
  server: { port: 5199, strictPort: true, fs: { allow: ['../..'] } },
  // Keep the spike's dependencies pre-bundled once, so a page load never waits on a re-optimise.
  optimizeDeps: { include: ['react', 'react-dom/client', '@tanstack/react-query', '@tanstack/react-query-persist-client', '@tanstack/query-async-storage-persister', 'idb-keyval'] },
});
