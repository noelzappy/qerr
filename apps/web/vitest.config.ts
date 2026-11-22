import { createRequire } from 'node:module';
import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { workspaceLinkProblems } from './src/server/engine/root.js';

// The tests must run against this checkout's engine and AI library, never another checkout's found further up the folders.
const linkProblems = workspaceLinkProblems(path.resolve(import.meta.dirname, '..', '..'), createRequire(import.meta.url).resolve);
if (linkProblems.length) throw new Error(linkProblems.join('\n'));

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
