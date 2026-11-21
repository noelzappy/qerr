import { defineConfig } from 'vitest/config';

// One file at a time: the tests share one Postgres database and the machine is small.
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
