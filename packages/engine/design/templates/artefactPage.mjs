// A headline and sub line over the tint panel with one artefact on it, drawn as a crisp white card: a ledger, a passbook page
// (with or without a register card beside it) or a register card. Used by the `ledger`, `passbook` and `text` templates.
// Unused: these pages are drawn from their layouts (lib/design/builtin/artefacts.mjs, the cards by artefacts.mjs artefactCards).
// It stays, with the functions that call it, until every template is converted (testlib/CONVERTING.md).
import { ledgerSvg, passbookSvg, registerSvg, svgBox } from './artefacts.mjs';
import { note, footer, head, obj, page, panel, panelTopFor, textBlock } from './editorial.mjs';

export function artefactPage(spec, ctx, art) {
  const hasSub = Boolean(spec.sub);
  const size = spec.size ?? (art.type === 'passbook' && !art.register && !hasSub ? 112 : 84);
  const top = panelTopFor(size, hasSub);
  let objects = '';
  if (art.type === 'ledger') {
    const f = ledgerSvg(art), pad = 40, w = f.w + 2 * pad, h = f.h + 2 * pad, y = top + 44;
    objects = obj(70, y, w, h, 'card', svgBox(pad, pad, f.w, f.h, f.svg))
      + (art.notes ?? []).map((t, i) => note(70, y + h + 44 + i * 42, t)).join('');
  } else if (art.type === 'register') {
    const f = registerSvg(art), pad = 32, w = f.w + 2 * pad, h = f.h + 2 * pad;
    objects = obj(70, top + 48, w, h, 'card', svgBox(pad, pad, f.w, f.h, f.svg));
  } else {
    const pass = { days: art.days ?? 31, ticked: art.ticked ?? 0, today: art.today ?? 0, tick: art.tick ?? 'ink' };
    if (art.register) {
      const pw = 410, ph = 540, pad = 30, f = registerSvg(art.register), cw = f.w + 64, ch = f.h + 64;
      objects = obj(70, top + 48, pw, ph, 'card', svgBox(pad, pad, pw - 2 * pad, ph - 2 * pad, passbookSvg(pw - 2 * pad, ph - 2 * pad, pass)))
        + obj(1010 - cw, top + 48, cw, ch, 'card', svgBox(32, 32, f.w, f.h, f.svg));
    } else {
      const pad = 34, y = top + 46, sh = Math.min(724, Math.max(420, 1190 - y)), w = 940 - 2 * pad, h = sh - 2 * pad;
      objects = obj(70, y, 940, sh, 'card', svgBox(pad, pad, w, h, passbookSvg(w, h, pass)));
    }
  }
  const w = size === 112 ? 940 : 900;
  const body = panel(top) + head(ctx, spec) + textBlock({ headline: spec.headline, sub: spec.sub, size, w, subW: Math.min(820, w) }) + objects + footer(ctx, { spec, onPanel: true });
  return page(ctx, spec, { body });
}
