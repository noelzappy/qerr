import path from 'node:path';
import { defineConfig } from 'vitest/config';

// One file at a time: the tests share one Postgres database and the machine is small.
export default defineConfig({
  // the panel's own modules import from '@/…' (tsconfig.web.json paths)
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'web/src') } },
  test: {
    include: ['src/**/*.spec.ts', 'src/**/*.spec.tsx'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
