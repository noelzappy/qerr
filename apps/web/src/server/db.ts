import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

export type Prisma = PrismaClient;

export function createPrisma(databaseUrl: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
}

// Fails with a plain message when the database has not been migrated, instead of a Prisma error on first use.
export async function assertMigrated(prisma: PrismaClient): Promise<void> {
  let rows: Array<{ pending: bigint }>;
  try {
    rows = await prisma.$queryRaw<Array<{ pending: bigint }>>`SELECT count(*) AS pending FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL`;
  } catch {
    throw new Error('The database has no migrations applied. Run "npm run migrate" first.');
  }
  if (Number(rows[0]?.pending ?? 0) > 0) throw new Error('A database migration did not finish. Run "npm run migrate" and check its output.');
}
