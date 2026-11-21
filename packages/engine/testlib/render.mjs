// Renders one design spec through the engine's library entry point (lib/design-render.mjs), the way the web app's render
// job does, and returns the result with the text a person would read: the error, the warnings (each "WARN ...") and the notes.
import path from 'node:path';
import { renderDesignBlock } from '../lib/design-render.mjs';

// `out` names the files: <dir>/<stem>.jpg asks for <dir>/<stem>-<size>.jpg (and <stem>-<n>.jpg pages for a carousel).
export async function renderSpec(spec, out) {
  const outDir = path.dirname(out);
  const stem = path.basename(out, path.extname(out));
  const r = await renderDesignBlock({ design: spec, postId: stem, outDir, stem });
  const text = [r.error, ...r.warnings.map((w) => `WARN ${w}`), ...r.notes].filter(Boolean).join('\n');
  const first = r.files[0]?.abs ?? path.join(outDir, `${stem}-${spec.sizes?.[0] ?? 'feed'}.jpg`);
  return { ...r, code: r.ok ? 0 : 1, text, out: first };
}
