// Primitive: an info block, the post's labelled rows (When / Where / Book on ...): each row a fixed label word and its value (kit box + run).
// The labels are the post's own fixed words (post-spec.mjs INFO_KEYS) and the values its words, both escaped by the kit (c.info()); a value
// sits in a cell as tall as its most lines, steps down to 82% of its size to fit, and is refused when it still runs out (the fit check's cell rule).
import { RULE_WEIGHTS, bool, en, int, role } from '../../look-desc.mjs';

export const VALUE_STYLES = ['body', 'item', 'label'];
export const SPEC = {
  label: 'Info block', group: 'Text', help: 'The post\'s labelled rows, such as When, Where and Book on: a small label and its words on each row.',
  placement: 'required', flow: true, container: null, text: true,
  own: {
    layout: en(['beside', 'stacked'], 'Layout', 'The label beside its words, or above them.', 'beside'),
    labelSpan: int(1, 6, 'Label columns', 'How many grid columns the labels take when they sit beside the words (the words start a gutter after them); 2 when left out.'),
    valueStyle: en(VALUE_STYLES, 'Words style', 'The type style of the words of each row.', 'body'),
    valueSize: int(20, 60, 'Words size', 'Pixels; leave out for the style\'s own.'),
    maxLines: int(1, 2, 'Most lines', 'Lines a row\'s words may take (they step down to 82% of their size first).', 1),
    labelInk: role('Label colour', 'The colour of the labels; leave out for the ink of the block (muted on the page).'),
    rule: en(['none', ...RULE_WEIGHTS], 'Rule', 'A rule between the rows.', 'none'),
    gap: int(0, 80, 'Space between rows', 'Pixels.', 16),
    upper: bool('Labels in capitals', 'Sets the labels in capitals (the look\'s label style decides when left out).'),
  },
  common: ['place', 'z', 'when', 'ink', 'w', 'before', 'nudgeX', 'alignSelf'],
  required: [],
};

// For the static checks (look-static.mjs): what it shows, the type sizes it sets, the inks it puts on its ground.
export const bindings = () => [{ field: 'info', sig: 'info|rows' }];
export function sizes(el, look) {
  const t = look.type ?? {}, own = el.valueStyle ?? 'body';
  const v = el.valueSize ?? (own === 'item' ? t.item?.size ?? t.body?.size : own === 'label' ? t.label?.size : t.body?.size);
  return [t.label?.size, v].filter(Number.isFinite);
}
// (the block's own ink is checked like every element's; a label colour only when one is given)
export const inks = (el) => (el.labelInk !== undefined ? [el.labelInk] : []);
export function fonts(el, look) {
  const T = look.type, labelRole = T.label.role === 'mono' ? 'mono' : 'label', s = el.valueStyle ?? 'body';
  return [[labelRole, T.label.weight], s === 'label' ? [labelRole, T.label.weight] : ['text', s === 'item' ? T.item.weight : T.body.weight]];
}
export function rules(el, bad) {
  if (el.labelSpan !== undefined && el.layout === 'stacked') bad('is for labels beside their words', 'labelSpan');
}

const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
export function render(c, p, env) {
  const rows = c.info();
  if (!rows.length) return '';
  const T = env.look.type, L = T.label, w = env.box.w ?? env.innerW;
  if (!Number.isFinite(w)) throw new Error('look: an info block needs a width (a place with a width, or a box that has one)');
  const style = p.valueStyle ?? 'body';
  const size = p.valueSize ?? (style === 'item' ? T.item.size : style === 'label' ? L.size : T.body.size);
  const lead = style === 'item' ? T.item.lead : style === 'label' ? 1.2 : T.body.lead;
  const weight = style === 'item' ? T.item.weight : style === 'label' ? L.weight : T.body.weight;
  const steps = [size, Math.round(size * 0.9), Math.round(size * 0.82)].filter((v, i, a) => i === 0 || v < a[i - 1]);
  const lines = p.maxLines ?? 1, cellH = Math.ceil(lines * size * lead) + 2;
  const beside = (p.layout ?? 'beside') === 'beside', labelW = beside ? c.span(0, (p.labelSpan ?? 2) - 1) : w, gutter = c.grid.gutter;
  const valueW = beside ? w - labelW - gutter : w;
  if (valueW < 60) throw new Error('look: the info block is too narrow for its words beside the labels');
  const labelOf = (key) => c.run(clean({ html: key, role: 'label', family: L.role === 'mono' ? 'mono' : 'label', size: L.size, lead: 1.2, weight: L.weight, track: L.track, upper: p.upper ?? L.upper, colour: p.labelInk ?? env.ink ?? 'muted', nowrap: true }));
  const valueOf = (value) => c.box({ flow: true, w: valueW, h: cellH, cell: true, flexNone: beside || undefined },
    c.run(clean({ html: value, role: 'meta', family: style === 'label' ? (L.role === 'mono' ? 'mono' : 'label') : 'text', size, steps: steps.length > 1 ? steps : undefined, maxLines: steps.length > 1 ? lines : undefined, lead, weight, colour: env.ink ?? 'ink', upper: style === 'label' ? L.upper : undefined, nowrap: lines === 1 || undefined })));
  const ruleW = p.rule && p.rule !== 'none' ? env.look.devices.rule[p.rule] : 0;
  const out = rows.map((r, i) => {
    const row = beside
      ? c.box({ flow: true, w, flex: 'row', align: 'start', gap: gutter }, c.box({ flow: true, w: labelW, flexNone: true, pad: [Math.max(0, Math.round((size * lead - L.size * 1.2) / 2)), 0, 0, 0] }, labelOf(r.key)) + valueOf(r.value))
      : c.box({ flow: true, w, flex: 'column', gap: 4 }, labelOf(r.key) + valueOf(r.value));
    return (i && ruleW ? c.flowBlock({ w: 'fill', h: ruleW, colour: 'rule' }) : '') + row;
  });
  return c.box(clean({ ...env.box, w, flex: 'column', align: 'stretch', gap: p.gap ?? 16, z: env.z, nudge: env.nudge }), out.join(''));
}
