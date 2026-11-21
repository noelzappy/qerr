// stats: one big figure (168 px, its accent set by the series), a line under it, up to three supporting figures, and optionally a
// photo as a full-bleed panel across the bottom. Without a photo the supporting figures stack as ruled rows.
import { fmtE, fmtSub, hs, px } from './common.mjs';
import { footer, head, page, photoWindow } from './editorial.mjs';

export function stats(spec, ctx) {
  const list = spec.stats ?? [];
  const big = `<div class="abs h big" data-role="stat" style="left:70px;top:140px;width:960px;font-size:${hs(168)};line-height:${hs(168)}">${fmtE(spec.big)}</div>`;
  const line = spec.line ? `<div class="abs sub" data-role="sub" data-min="30" style="left:70px;top:336px;width:700px">${fmtSub(spec.line)}</div>` : '';
  const rule = '<div class="rule" style="left:70px;top:420px;width:940px"></div>';
  let rest = '';
  if (spec.image) {
    const n = list.length, step = (940 + 50) / Math.max(1, n);
    rest = list.map((s, i) => `<div class="abs sub" data-role="statlabel" data-min="30" style="left:${px(70 + i * step)}px;top:448px;width:${px(step - 50)}px"><b>${fmtSub(s[0])}</b><br>${fmtSub(s[1])}</div>`).join('')
      + photoWindow(ctx, spec, { x: 0, y: 616, w: 1080, h: 588, avoid: true });
  } else {
    rest = list.map((s, i) => `<div class="abs" style="left:70px;top:${448 + i * 150}px;width:940px;${i ? 'border-top:1px solid var(--hair);padding-top:24px' : ''}"><div class="h s70" data-role="stat" style="font-size:${hs(70)}">${fmtSub(s[0])}</div><div class="sub" data-role="statlabel" data-min="30" style="margin-top:8px">${fmtSub(s[1])}</div></div>`).join('');
  }
  return page(ctx, spec, { body: head(ctx, spec) + big + line + (list.length ? rule : '') + rest + footer(ctx) });
}
