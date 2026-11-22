// Start-up: config, database, migration check, storage, jobs, then listen.
import { serve } from '@hono/node-server';
import { createAppAndDeps } from './app.js';
import { syncBrand } from './services/brand-settings.js';
import { connectLookRenderer } from './services/look-render.js';
import { bootstrapAdmin } from './bootstrap.js';
import { loadConfig } from './config.js';
import { reconcileActivity } from './services/activity.js';
import { assertMigrated, createPrisma } from './db.js';
import { createBossJobs } from './jobs/index.js';
import { describeError, logger } from './log.js';
import { createMailer } from './mail.js';
import { setRenderLimits } from './services/render-limit.js';
import { runSeed } from './seed.js';
import { createStorage } from './storage/index.js';

async function main() {
  const config = loadConfig();
  const prisma = createPrisma(config.databaseUrl);
  await assertMigrated(prisma);
  // How many images are drawn at once, and how many previews may wait (RENDER_CONCURRENCY, RENDER_QUEUE_MAX). The engine reads the same
  // RENDER_CONCURRENCY from the environment for its machine-wide Chrome slots.
  setRenderLimits({ concurrency: config.renderConcurrency, queueMax: config.renderQueueMax });
  logger.info('render.limits', { concurrency: config.renderConcurrency, queueMax: config.renderQueueMax });
  const jobs = createBossJobs({ databaseUrl: config.databaseUrl, renderConcurrency: config.renderConcurrency });
  const now = () => new Date();
  const { app, deps } = createAppAndDeps({
    prisma, config, fetchImpl: fetch, storage: await createStorage(config, fetch, now), jobs, mailer: createMailer(config, fetch), now,
  });
  await bootstrapAdmin(deps, logger.info);
  await runSeed(deps, process.env, logger.info);
  // Before the workers start: anything still marked as running belongs to the process that just stopped.
  const orphaned = await reconcileActivity(deps).catch(() => ({ failed: 0 }));
  if (orphaned.failed) logger.info('activity.reconciled', orphaned);
  // The brand saved in Settings becomes the pack folder the engine and the AI read.
  await syncBrand(deps);
  // The Looks pages' previews and render checks draw with the engine (RENDER_CONCURRENCY at a time, through the render queue).
  connectLookRenderer(deps);
  await jobs.start(deps);
  const server = serve({ fetch: app.fetch, port: config.port }, (info) => logger.info('server.listening', { port: info.port }));

  const stop = async () => {
    logger.info('server.stopping');
    server.close();
    await jobs.stop().catch(() => {});
    await prisma.$disconnect().catch(() => {});
    process.exit(0);
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

main().catch((err) => {
  logger.error('server.start_failed', describeError(err));
  process.exit(1);
});
