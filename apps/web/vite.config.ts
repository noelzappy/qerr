import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The fonts (Inter, IBM Plex Mono and their licence) are the engine's, in packages/engine/design/fonts; the web app has
// no copy of its own. index.css loads them from /fonts/<file>: this serves them there in development and writes them to
// dist/web/fonts in a build, where the server's static handler serves them like any other file.
const ENGINE_FONTS = fileURLToPath(new URL('../../packages/engine/design/fonts', import.meta.url));
const FONT_TYPES: Record<string, string> = { '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };

function engineFonts(): Plugin {
  const files = () => fs.readdirSync(ENGINE_FONTS).filter((f) => FONT_TYPES[path.extname(f)]);
  return {
    name: 'vesk-engine-fonts',
    configureServer(server) {
      server.middlewares.use('/fonts', (req, res, next) => {
        // Only a file that is in the folder, by its exact name: nothing outside it can be reached.
        const name = decodeURIComponent((req.url ?? '').split('?')[0]!.replace(/^\//, ''));
        if (!files().includes(name)) return next();
        res.setHeader('content-type', FONT_TYPES[path.extname(name)]!);
        res.end(fs.readFileSync(path.join(ENGINE_FONTS, name)));
      });
    },
    generateBundle() {
      for (const name of files()) this.emitFile({ type: 'asset', fileName: `fonts/${name}`, source: fs.readFileSync(path.join(ENGINE_FONTS, name)) });
    },
  };
}

// The server serves the built files from dist/web. In development the API runs on :3000 and Vite proxies /api to it.
// `@/` points at web/src (the same alias is in tsconfig.web.json and components.json).
export default defineConfig({
  root: 'web',
  plugins: [react(), tailwindcss(), engineFonts()],
  resolve: { alias: { '@': fileURLToPath(new URL('./web/src', import.meta.url)) } },
  // /fonts/* are served beside the bundle (see engineFonts), not bundled: marked external, Vite leaves the URLs as they are.
  build: { outDir: '../dist/web', emptyOutDir: true, sourcemap: false, rolldownOptions: { external: [/^\/fonts\//] } },
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000', '/healthz': 'http://localhost:3000' } },
});
