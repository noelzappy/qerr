import { defineConfig } from 'prisma/config';

// DATABASE_URL is read at migrate time; `prisma generate` does not need a live database.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL ?? 'postgresql://invalid:invalid@127.0.0.1:5432/invalid' },
});
