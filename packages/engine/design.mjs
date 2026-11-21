#!/usr/bin/env node
// Makes the post images (photo, card, stats, screen, carousel) for the batches. See docs/design.md.
import { BatchError } from './lib/batch.mjs';
import { runDesign } from './lib/design/cli.mjs';

runDesign(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (e) => {
  console.error(e instanceof BatchError ? e.message : `Error: ${e.message}`);
  process.exitCode = 1;
});
