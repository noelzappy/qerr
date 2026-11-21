import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The server serves the built files from dist/web. In development the API runs on :3000 and Vite proxies /api to it.
// `@/` points at web/src (the same alias is in tsconfig.web.json and components.json).
export default defineConfig({
  root: 'web',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./web/src', import.meta.url)) } },
  build: { outDir: '../dist/web', emptyOutDir: true, sourcemap: false },
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000', '/healthz': 'http://localhost:3000' } },
});
