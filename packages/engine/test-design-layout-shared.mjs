// node --test   (the shared extensions of the layout format that the built-in templates' conversion builds on: a headline with its
// sub line flowing under it, and conditions on the artefact's type and on the templates' own fixed options and flags. No Chrome.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBrand } from './lib/design/brand.mjs';
import { CHOICE_NAMES, FIELD_NAMES, SPEC_CHOICES, exclusive, validateLayout, whenHolds, whenProblems } from './lib/design/layout.mjs';
import { renderLayoutWith } from './lib/design/layout-render.mjs';
import { SIZES } from './lib/design/sizes.mjs';
import { forSize, normaliseDesign } from './lib/design/spec.mjs';
import { fmtE, fmtSub, hs, px } from './design/templates/common.mjs';

// The markup the templates' own helpers wrote for a headline and its sub line (editorial.mjs textBlock at y 154, poster.mjs
// words at the poster's 80, 170), kept here as the reference the layout drawings must match now that the templates are gone.
function textBlock({ w = 940, size = 84, headline, sub, subW = 820 }) {
  const h = `<div class="h s${size}" data-role="headline" style="font-size:${hs(size)};max-width:${w}px">${fmtE(headline)}</div>`;
  const s = sub ? `<div class="sub" data-role="sub" data-min="30" style="margin-top:28px;max-width:${subW}px">${fmtSub(sub)}</div>` : '';
  return `<div class="abs" id="txt" style="left:70px;top:154px;width:${w}px">${h}${s}</div>`;
}
function words({ headline, sub, size, subW = 820, align = 'left' }) {
  const center = align === 'center';
  const h = `<div class="ps-h" data-role="headline" style="font-size:${hs(size)}">${fmtE(headline)}</div>`;
  const s = sub ? `<div class="sub ps-sub" data-role="sub" data-min="30" style="margin-top:28px;max-width:${subW}px${center ? ';margin-left:auto;margin-right:auto' : ''}">${fmtSub(sub)}</div>` : '';
  return `<div class="abs" id="txt" style="left:${px(80)}px;top:${px(170)}px;width:${px(920)}px;text-align:${center ? 'center' : 'left'}">${h}${s}</div>`;
}

const brand = loadBrand();
const PIXEL = 'data:image/png;base64,iVBORw0KGgo=';
const has = (errs, frag) => errs.some((e) => e.includes(frag));
const HOSTILE = ['"><script>window.__pwn=1</script>', '</style><script>x</script>', '<img src=x onerror=alert(1)>', 'url(http://evil.example/x)', '__proto__', 'constructor', '1e3', NaN, -1, 1.5, null, {}, [], true];

const editorial = (head = {}) => ({
  id: 'e', name: 'Editorial', page: 'editorial',
  fields: { headline: { required: true }, sub: {} },
  canvas: { feed: { columns: 12, rows: 15, margin: 70, gutter: 20 } },
  blocks: [
    { type: 'decoration', kind: 'panel', px: { x: 0, y: 990, w: 1080, h: 360 } },
    { type: 'runhead' },
    { type: 'headline', size: 84, subField: 'sub', subWidth: 900, px: { x: 70, y: 896, w: 940, h: 80 }, ...head },
    { type: 'footer' },
  ],
});
const poster = (head = {}) => ({
  id: 'p', name: 'Poster', page: 'poster',
  fields: { headline: { required: true }, sub: {} },
  canvas: { feed: { columns: 12, rows: 15, margin: 80, gutter: 40 } },
  blocks: [{ type: 'bar' }, { type: 'headline', size: 104, subField: 'sub', px: { x: 80, y: 170, w: 920, h: 400 }, ...head }],
});
const modE = (f, head) => { const l = editorial(head); f(l); return validateLayout(l); };
const modP = (f, head) => { const l = poster(head); f(l); return validateLayout(l); };
const draw = (l, spec, counter) => renderLayoutWith(l, forSize(normaliseDesign(spec), 'feed'), { size: SIZES.feed, brand, counter, image: () => PIXEL, imageSize: () => ({ w: 660, h: 1354 }) }).body;
// The #txt box a page drew, as a string, to compare with the template helper's.
const txtOf = (body) => { const i = body.indexOf('<div class="abs" id="txt"'); let d = 0, k = i; for (; k < body.length; k++) { if (body.startsWith('<div', k)) d++; else if (body.startsWith('</div>', k) && --d === 0) break; } return body.slice(i, k + 6); };

test('a headline with its sub line flowing under it: valid on the built-in pages only, with a bounded width', () => {
  assert.deepEqual(validateLayout(editorial()), []);
  assert.deepEqual(validateLayout(poster()), []);
  assert.deepEqual(modP(() => {}, { align: 'center', subWidth: 440 }), []);
  assert.deepEqual(modE((l) => { delete l.fields.sub; }, { subField: undefined, subWidth: undefined }), [], 'a headline without one');
  assert.ok(has(modE(() => {}, { subField: 'quote' }), '"quote" is not in the layout\'s fields'));
  assert.ok(has(modE((l) => { l.fields.stats = {}; }, { subField: 'stats' }), 'a headline cannot show "stats"'));
  assert.ok(has(modE((l) => { l.blocks.push({ type: 'sub', px: { x: 70, y: 1036, w: 620, h: 200 } }); }), '"sub" is shown by more than one block'));
  assert.ok(has(modE(() => {}, { subField: undefined }), 'subWidth is only used with subField'));
  for (const w of [99, 1081, 820.5, '820', true]) assert.ok(has(modE(() => {}, { subWidth: w }), 'subWidth must be a whole number from 100 to 1080'), String(w));
  // a grid page gives its sub line its own block; the editor and the AI never see these settings
  const grid = { id: 'g', name: 'G', fields: { headline: {}, sub: {} }, canvas: { feed: { columns: 12, rows: 15, margin: 70 } }, blocks: [{ type: 'headline', slot: { col: 1, row: 1, width: 12, height: 4 }, subField: 'sub' }] };
  assert.ok(has(validateLayout(grid), 'subField is used on poster and editorial pages only'));
  grid.blocks[0] = { type: 'headline', slot: { col: 1, row: 1, width: 12, height: 4 }, subWidth: 500 };
  grid.fields = { headline: {} };
  assert.ok(has(validateLayout(grid), 'subWidth is used on poster and editorial pages only'));
});

test('the flowing sub line is drawn exactly as the templates\' textBlock and words drew it', () => {
  const H = '"><script>window.__pwn=1</script> *x*', S = 'A *bold* sub\\nline </style>';
  for (const [size, subW, head] of [[84, 900, 'Every saving, *on record.*'], [70, 820, H], [112, 940, 'Short']]) {
    const l = editorial({ size, subWidth: subW, px: { x: 70, y: 154, w: 940, h: 800 } });
    for (const sub of [S, undefined]) {
      assert.equal(txtOf(draw(l, { template: 'text', headline: head, sub })), textBlock({ size, headline: head, sub, subW, w: 940 }), `${size} ${sub}`);
    }
  }
  for (const [align, subW, size] of [['left', 820, 104], ['center', 820, 88], ['center', 440, 76]]) {
    const l = poster({ align, subWidth: subW, size });
    for (const sub of [S, undefined]) {
      assert.equal(txtOf(draw(l, { template: 'object', headline: H, sub })), words({ headline: H, sub, size, subW, align }), `${align} ${sub}`);
    }
  }
});

test('conditions on the artefact\'s type and on the templates\' fixed options: values from fixed lists only', () => {
  const w = (when, page) => whenProblems(when, ['headline', 'sub', 'artefact'], 'w', { page, builtin: true });
  for (const when of [{ field: 'artefact', is: 'ledger' }, { field: 'artefact', is: ['ledger', 'register'] }, { field: 'artefact', not: 'passbook' }, { field: 'artefact', is: 'passbook', present: 'sub' }]) assert.deepEqual(w(when, 'grid'), [], JSON.stringify(when));
  for (const when of [{ field: 'layout', is: 'side' }, { field: 'device', is: 'desktop' }, { field: 'glow', is: false }, { field: 'map', is: true }, { field: 'size', is: [70, 84] }, { field: 'align', not: 'center' }, { field: 'register', is: true }, { field: 'textAt', is: 'bottom', page: 'first' }]) {
    assert.deepEqual(w(when, 'editorial'), [], JSON.stringify(when));
    assert.deepEqual(whenProblems(when, FIELD_NAMES, 'registry'), [], JSON.stringify(when));
    assert.ok(has(w(when, 'grid'), 'field must be one of artefact on a grid page'), JSON.stringify(when));
    // a brand's own poster or editorial layout may test the artefact's type and its register card only (its design has no others)
    const brand = whenProblems(when, ['headline', 'sub', 'artefact'], 'w', { page: 'editorial' });
    if (SPEC_CHOICES[when.field].brand) assert.deepEqual(brand, [], JSON.stringify(when));
    else assert.ok(has(brand, 'field must be one of artefact, register on a brand\'s own layout'), JSON.stringify(when));
  }
  assert.ok(has(w({ field: 'colour', is: 'red' }, 'poster'), 'field must be one of artefact, register'));
  assert.ok(has(w({ field: 'artefact', is: 'poster' }, 'poster'), 'is must be one of ledger, passbook, register'));
  assert.ok(has(w({ field: 'size', is: 85 }, 'poster'), 'is must be one of 70, 76, 84, 88, 104, 112, 120'));
  assert.ok(has(w({ field: 'size', is: '84' }, 'poster'), 'is must be one of'));
  assert.ok(has(w({ field: 'glow', is: 'false' }, 'poster'), 'is must be one of true, false'));
  assert.ok(has(w({ field: 'layout', is: ['side', 'side'] }, 'poster'), 'is must be one of'));
  assert.ok(has(w({ field: 'layout', is: [] }, 'poster'), 'is must be one of'));
  assert.ok(has(w({ field: 'layout', is: 'side', not: 'center' }, 'poster'), 'give "is" or "not" (not both)'));
  assert.ok(has(w({ field: 'layout' }, 'poster'), 'give "is" or "not"'));
  assert.ok(has(w({ is: 'side' }, 'poster'), '"is" and "not" need a "field"'));
  assert.ok(has(whenProblems({ field: 'artefact', is: 'ledger' }, ['headline'], 'w', { page: 'editorial' }), '"artefact" is not in the layout\'s fields'));
  for (const h of HOSTILE) {
    assert.ok(w({ field: h, is: 'side' }, 'poster').length > 0, `field ${String(h)}`);
    assert.ok(w({ field: 'layout', is: h }, 'poster').length > 0, `is ${String(h)}`);
    assert.ok(w({ field: 'artefact', not: [h] }, 'grid').length > 0, `not ${String(h)}`);
    for (const e of w({ field: h, is: h }, 'poster')) assert.ok(!e.includes('<script>window'), e);
  }
  // the table itself: every choice a list of plain values
  for (const n of CHOICE_NAMES) assert.ok(SPEC_CHOICES[n].values.every((v) => ['string', 'number', 'boolean'].includes(typeof v)), n);
});

test('a condition reads the spec as the templates do, defaults filled in where every template shares them', () => {
  const holds = (when, spec, counter) => whenHolds(when, spec, counter);
  assert.ok(holds({ field: 'artefact', is: 'ledger' }, { artefact: { type: 'ledger' } }));
  assert.ok(!holds({ field: 'artefact', is: 'ledger' }, {}));
  assert.ok(holds({ field: 'artefact', not: 'ledger' }, {}), 'an unset artefact is not a ledger');
  assert.ok(holds({ field: 'register', is: true }, { register: { rows: [] } }) && holds({ field: 'register', is: true }, { artefact: { type: 'passbook', register: {} } }));
  assert.ok(holds({ field: 'register', is: false }, { artefact: { type: 'passbook' } }));
  assert.ok(holds({ field: 'device', is: 'phone' }, {}) && holds({ field: 'device', is: 'desktop' }, { device: 'desktop' }));
  assert.ok(holds({ field: 'glow', is: true }, {}) && holds({ field: 'glow', is: false }, { glow: false }));
  assert.ok(holds({ field: 'map', is: false }, {}) && holds({ field: 'map', is: true }, { map: true }));
  assert.ok(holds({ field: 'dots', is: true }, {}) && holds({ field: 'dots', is: false }, { dots: false }));
  assert.ok(holds({ field: 'textAt', is: 'top' }, {}) && holds({ field: 'textAt', is: 'bottom' }, forSize({ textAt: { feed: 'bottom' } }, 'feed')));
  assert.ok(holds({ field: 'scrim', is: 'black' }, {}) && holds({ field: 'pills', is: true }, { pills: ['a'] }) && holds({ field: 'beside', is: false }, {}));
  // where the templates' defaults differ, an unset value matches no "is", only a "not"
  assert.ok(!holds({ field: 'layout', is: 'center' }, {}) && holds({ field: 'layout', not: 'side' }, {}) && !holds({ field: 'layout', not: 'side' }, { layout: 'side' }));
  assert.ok(holds({ field: 'size', is: [70, 84] }, { size: 84 }) && !holds({ field: 'size', is: 112 }, {}));
  assert.ok(!holds({ field: 'nope', is: 1 }, {}), 'an unknown choice never holds');
  assert.ok(holds({ field: 'layout', is: 'side', present: 'sub', page: 'later' }, { layout: 'side', sub: 's' }, { n: 2, total: 3 }));
  assert.ok(!holds({ field: 'layout', is: 'side', present: 'sub', page: 'later' }, { layout: 'side', sub: 's' }, { n: 1, total: 3 }));
});

test('conditions on the same choice that let no value through together exclude each other', () => {
  assert.ok(exclusive({ field: 'layout', is: 'side' }, { field: 'layout', is: 'center' }));
  assert.ok(exclusive({ field: 'layout', is: 'side' }, { field: 'layout', not: 'side' }));
  assert.ok(!exclusive({ field: 'layout', is: 'center' }, { field: 'layout', not: 'side' }));
  assert.ok(!exclusive({ field: 'layout', not: 'center' }, { field: 'layout', not: 'side' }), 'both let an unset layout through');
  assert.ok(exclusive({ field: 'glow', is: true }, { field: 'glow', is: false }));
  assert.ok(exclusive({ field: 'size', is: [70, 84] }, { field: 'size', is: [112] }) && !exclusive({ field: 'size', is: [70, 84] }, { field: 'size', is: [84, 112] }));
  assert.ok(!exclusive({ field: 'layout', is: 'side' }, { field: 'device', is: 'phone' }));
  // in a layout: two headlines that are never drawn together may show the same field and the same space
  const l = poster({ when: { field: 'layout', is: 'side' } });
  l.blocks.push({ type: 'headline', size: 88, px: { x: 80, y: 170, w: 920, h: 400 }, subField: 'sub', when: { field: 'layout', not: 'side' } });
  assert.deepEqual(validateLayout(l, undefined, { builtin: true }), []);
  assert.ok(has(validateLayout(l), 'on a brand\'s own layout'), 'a brand\'s layout cannot test a template\'s own layout');
  l.blocks[2].when = { field: 'layout', not: 'center' };
  assert.ok(has(validateLayout(l, undefined, { builtin: true }), 'overlap'));
  const variants = draw(poster({ when: { field: 'layout', is: 'side' } }), { template: 'product', headline: 'H', layout: 'side' });
  assert.ok(variants.includes('>H</div>'));
  assert.ok(!draw(poster({ when: { field: 'layout', is: 'side' } }), { template: 'product', headline: 'H' }).includes('>H</div>'));
});
