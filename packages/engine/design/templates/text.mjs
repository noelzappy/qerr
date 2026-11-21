// text: a headline and a sub line. With an artefact (a ledger, a passbook page or a register card) it sits on the panel below;
// without one it is the typographic pause page: a big headline and the sub line on an empty panel band. Unused: the pause page is
// drawn from its layout (lib/design/builtin/editorial.mjs), a text page with an artefact from one layout per type of artefact
// (lib/design/builtin/artefacts.mjs); the function stays until every template is converted (testlib/CONVERTING.md).
import { artefactPage } from './artefactPage.mjs';
import { footer, head, page, panel, textBlock } from './editorial.mjs';
import { fmtSub } from './common.mjs';

export function text(spec, ctx) {
  if (spec.artefact) return artefactPage(spec, ctx, spec.artefact);
  const size = spec.size ?? 112, top = 990;
  const sub = spec.sub ? `<div class="abs sub" data-role="sub" data-min="30" data-onpanel style="left:70px;top:1036px;width:620px">${fmtSub(spec.sub)}</div>` : '';
  const body = panel(top) + head(ctx, spec) + textBlock({ headline: spec.headline, size, w: 940 }) + sub + footer(ctx, { spec, onPanel: true });
  return page(ctx, spec, { body });
}
