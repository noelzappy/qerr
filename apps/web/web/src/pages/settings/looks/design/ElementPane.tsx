// The right pane of the design editor with an element selected, as choices first: a header (the element's plain name and one-line summary), then
// only the groups that apply to the element's type, each a row of visual choices with its exact catalogue-driven inputs behind "Fine-tune":
//   Content  (a field of the post / the brand name / the post number as chips; part and format chips when relevant)
//   Size     (Small to Huge for text; the rest is Fine-tune)
//   Position (a 3 x 3 anchor pad for grid placement, the grid readout, the look's named angles)
//   Colour   (fill, ink and colour as brand swatches, only the roles that read)
//   Style    (emphasis, alignment, case; shadow, ring, border and radius as toggle chips)
// then "Shown only when" as a sentence, and "More settings" for anything in the catalogue that no group claims. Nothing is clamped; a change goes
// through the model, which says why it will not take it.
import { useState, type ReactNode } from 'react';
import { AlignCenter, AlignLeft, AlignRight } from 'lucide-react';
import { ConfirmAction } from '@/components/kit';
import { cn } from '@/lib/utils';
import {
  bindField, declaredFields, elementName, fieldLabel, gridOf, inkChoices, placeForm, placeReadout, PLACE_FORM_WORDS, namedAngles, propsOf, turnOptions, pruneFields, readWhen, setPlace,
  setPlaceForm, setProp, setRotation, setSource, summary, whenText, type DesignProblem, type Edit, type Json,
} from '../design-model';
import { AngleControl, BindingEditor, PlaceEditor, Segmented, ValueControl, word, type Ctx } from '../design-controls';
import type { Swatches } from '../design-colours';
import { blankFor } from '../look-model';
import type { Desc, LookCatalogue } from '../look-types';
import { SizeChips, StickerSize, TextSize } from './size';
import { Chips, Group, Disclosure, Label, spanOf, ToggleChip } from './ui';

const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);

export type GroupId = 'content' | 'size' | 'position' | 'colour' | 'style' | 'more';

// ---- which group owns which property of the catalogue ----
const SKIP = new Set(['type', 'children', 'sticker', 'when']);
const CONTENT = ['field', 'source', 'part', 'split', 'format', 'each', 'number', 'mode', 'glyph', 'tone', 'unit', 'keys'];
const SIZE = ['style', 'size', 'ladder', 'textSize', 'cap', 'floor', 'min', 'sizes', 'maxLines', 'fit', 'minW', 'maxW', 'rmin', 'rmax', 'rowMinH', 'numberSize', 'numberSpan', 'sizeByCount', 'skew', 'stretch', 't', 'w', 'h', 'padBelowEm', 'y', 'leftY', 'rightY', 'edge', 'vertical'];
const POSITION = ['place', 'rot', 'origin', 'originPct', 'bleed', 'z', 'altRot'];
const COLOUR = ['fill', 'ink', 'colour', 'tint', 'altFill', 'edgeFill', 'lower', 'keylineColour'];
const STYLE = ['emphasis', 'emphasisOwnLine', 'align', 'upper', 'weight', 'font', 'family', 'valign', 'track', 'lead', 'nowrap', 'dropWhenTight', 'numberStyle', 'textStyle', 'gapEm', 'baselineAt',
  'shape', 'shadow', 'textShadow', 'ring', 'border', 'radius', 'pad', 'treat', 'keyline', 'rule', 'firstAccent', 'need', 'fade', 'fadeFrom', 'altItalic', 'outline', 'numberTile'];

export function ownerOf(name: string, desc: Desc & { group?: string }): GroupId {
  if (desc.group === 'flow' || POSITION.includes(name)) return 'position';
  if (COLOUR.includes(name)) return 'colour';
  if (CONTENT.includes(name)) return 'content';
  if (SIZE.includes(name)) return 'size';
  if (STYLE.includes(name)) return 'style';
  return 'more';
}

const EMPHASIS_WORDS: Record<string, string> = { none: 'None', italic: 'Italic', accent: 'Accent', bar: 'Bar', 'tilt-bar': 'Tilted bar', 'own-line-bar': 'Own line' };
const EFFECT_CHIPS: Array<[string, string]> = [['shadow', 'Shadow'], ['textShadow', 'Shadow'], ['ring', 'Ring'], ['border', 'Border'], ['radius', 'Round corners']];
const CONTENT_CHIPS = ['part', 'format', 'each', 'mode', 'tone', 'glyph'];

export interface PropertiesProps {
  comp: Json; look: Json; cat: LookCatalogue; path: string; swatches: Swatches; advanced: boolean; readOnly: boolean; problems: DesignProblem[];
  // applies an edit (the editor keeps history and the draft); returns '' or why it was refused
  apply: (fn: (c: Json) => Edit, key?: string) => string;
  onSelect: (path: string | null) => void;
}

export const elementAtPath = (comp: Json, path: string): Json | null => {
  let list = Array.isArray(comp.elements) ? (comp.elements as Json[]) : [];
  let cur: Json | null = null;
  for (const i of path.split('.').map(Number)) {
    if (i < list.length) cur = list[i]!;
    else if (cur && i === list.length && isObj(cur.sticker)) cur = cur.sticker as Json;
    else return null;
    list = Array.isArray(cur.children) ? (cur.children as Json[]) : [];
  }
  return cur;
};

export function ElementProperties(p: PropertiesProps) {
  const { comp, look, cat, path } = p;
  const el = elementAtPath(comp, path);
  const [orphans, setOrphans] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const err = (k: string, m: string) => { setErrors((e) => (e[k] === m || (!e[k] && !m) ? e : { ...e, [k]: m })); return m; };
  if (!el) return <p className="text-[13px] text-muted-foreground">That element is not there any more.</p>;
  const type = String(el.type);
  const info = cat.elements[type]!;
  const ctx: Ctx = {
    comp, look, cat, path, el, swatches: p.swatches, advanced: p.advanced, disabled: p.readOnly, inks: inkChoices(comp, path, look, cat, p.advanced),
    set: (name, value) => p.apply((c) => setProp(c, path, name, value, cat, look), `${path}.${name}`),
    rotate: (v) => p.apply((c) => setRotation(c, path, v, look, cat), `${path}.rot`),
    setPlace: (pl) => p.apply((c) => setPlace(c, path, pl, cat), `${path}.place`),
    setForm: (f) => p.apply((c) => setPlaceForm(c, path, f, look, cat)),
  };
  const onBind = (field: string | null): string => {
    let found: string[] = [];
    const why = p.apply((c) => { const e = bindField(c, path, field, look, cat); found = e.orphans; return e; });
    if (!why && found.length) setOrphans(found);
    return why;
  };
  const onSource = (source: string | null): string => {
    let found: string[] = [];
    const why = p.apply((c) => { const e = setSource(c, path, source, look, cat); found = e.orphans; return e; });
    if (!why && found.length) setOrphans(found);
    return why;
  };

  // the catalogue's properties of this element, by the group that owns them
  const flowing = !isObj(el.place) && path.includes('.');
  const props = propsOf(type, cat).filter(([name, d]) => !SKIP.has(name) && (d.group !== 'flow' || flowing || name in el));
  const by: Record<GroupId, Array<[string, Desc & { group?: string }]>> = { content: [], size: [], position: [], colour: [], style: [], more: [] };
  for (const pr of props) by[ownerOf(pr[0], pr[1])].push(pr);
  const required = new Set(info.required ?? []);
  const has = (name: string) => name in info.properties;

  // a server problem on a value hidden behind a Fine-tune opens it and marks the value
  const mine = p.problems.filter((x) => x.path === path);
  const heads = new Set(mine.map((m) => String(m.prop ?? '').split(/[.[]/)[0]!).filter(Boolean));
  const forced = (g: GroupId) => by[g].some(([n]) => heads.has(n)) || (g === 'position' && heads.has('place')) || (g === 'content' && (heads.has('field') || heads.has('source')));

  const render = ([name, desc]: [string, Desc]) => {
    if (type === 'text' && ['size', 'ladder', 'textSize', 'style'].includes(name)) return null;
    if (type === 'sticker' && ['ladder', 'textSize'].includes(name)) return null;
    return (
      <div key={name} className={cn(spanOf(desc), heads.has(name) && 'rounded-md ring-1 ring-destructive/60 ring-offset-2 ring-offset-background')}>
        <ValueControl name={name} desc={desc} value={el[name]} ctx={ctx} optional={!required.has(name)} onChange={(v) => ctx.set(name, v)} />
      </div>
    );
  };

  // ---- Content ----
  const fieldDesc = info.properties.field as (Desc & { of?: string[] }) | undefined;
  const sourceDesc = info.properties.source;
  const kind = cat.kinds[String(comp.kind)];
  const allowed = (fieldDesc?.of ?? []).filter((f) => kind?.fields.includes(f));
  const declared = declaredFields(comp);
  const bound = typeof el.source === 'string' ? `source:${el.source}` : typeof el.field === 'string' ? `field:${el.field}` : null;
  const bindOptions = [
    ...allowed.map((f) => ({ value: `field:${f}`, label: <>{!declared.includes(f) && <span aria-hidden="true" className="mr-1 text-muted-foreground">+</span>}{fieldLabel(f, cat)}</>, title: declared.includes(f) ? undefined : 'Adds it to the design' })),
    ...((sourceDesc?.values ?? []) as string[]).map((v) => ({ value: `source:${v}`, label: word(v), title: undefined as string | undefined })),
  ];
  const chooseBinding = (id: string) => {
    const [kindOf, v] = [id.slice(0, id.indexOf(':')), id.slice(id.indexOf(':') + 1)];
    err('bind', kindOf === 'source' ? onSource(v) : el.source !== undefined ? (onSource(null) || onBind(v)) : onBind(v));
  };
  const contentChips = CONTENT_CHIPS.filter((n) => info.properties[n]?.kind === 'enum' && (el[n] !== undefined || (n === 'part' ? !!cat.fields[String(el.field)]?.emphasis : n === 'format' ? type === 'numeral' : true)));
  const showContent = !!fieldDesc || !!sourceDesc || by.content.length > 0;

  // ---- Size ----
  const textual = type === 'text';
  const showSize = textual || by.size.length > 0;

  // ---- Position ----
  const form = placeForm(el, cat);
  const turn = info.properties.rot && el.vertical === undefined;

  // ---- Colour ----
  const mainColour = ['fill', 'ink', 'colour'].filter((n) => has(n));
  const fineColour = by.colour.filter(([n]) => !mainColour.includes(n));

  // ---- Style ----
  const emph = info.properties.emphasis;
  const align = info.properties.align;
  const alignOk = align?.kind === 'enum' && ['left', 'center', 'right'].every((v) => (align.values ?? []).includes(v));
  const upper = info.properties.upper?.kind === 'bool';
  const effects = EFFECT_CHIPS.filter(([n]) => info.properties[n]);
  const toggleEffect = (name: string) => {
    const d = info.properties[name]!;
    const on = el[name] !== undefined && el[name] !== false;
    const forms = (d as unknown as { forms?: Array<{ is: string; desc: Desc }> }).forms;
    const blank = on ? undefined : d.kind === 'oneOf' && Array.isArray(forms) && forms[0] ? blankFor(forms[0].desc) : blankFor(d);
    if (!on && blank === undefined) return;
    err('style', ctx.set(name, blank));
  };
  const showStyle = by.style.length > 0;

  return (
    <div className="flex flex-col gap-2.5">
      <div>
        <h2 className="text-[15px] font-semibold">{elementName(el, cat)}</h2>
        <p className="text-[12.5px] text-muted-foreground">{summary(el, cat, look)}</p>
      </div>
      {mine.length > 0 && <ul className="list-disc space-y-0.5 pl-[18px] text-[12.5px] font-medium text-destructive" role="alert">{mine.map((m, i) => <li key={i}>{m.message}</li>)}</ul>}

      {showContent && (
        <Group title="Content" force={forced('content')}
          fine={<>{(fieldDesc || sourceDesc) && <div className="col-span-2"><BindingEditor ctx={ctx} onBind={onBind} onSource={onSource} /></div>}{by.content.filter(([n]) => n !== 'field' && n !== 'source').map(render)}</>}>
          {bindOptions.length > 0 && <Chips label="What it shows" value={bound} options={bindOptions} disabled={p.readOnly} onChange={chooseBinding} />}
          {errors.bind && <p className="text-[12.5px] font-medium text-destructive" role="alert">{errors.bind}</p>}
          {contentChips.map((n) => {
            const d = info.properties[n]!;
            return (
              <div key={n} className="flex flex-col gap-1">
                <Label>{d.label ?? word(n)}</Label>
                <Chips label={d.label ?? n} value={typeof el[n] === 'string' ? (el[n] as string) : null} disabled={p.readOnly} options={(d.values ?? []).map((v) => ({ value: String(v), label: word(v) }))}
                  onChange={(v) => err(`c-${n}`, ctx.set(n, v))} />
                {errors[`c-${n}`] && <p className="text-[12.5px] font-medium text-destructive" role="alert">{errors[`c-${n}`]}</p>}
              </div>
            );
          })}
        </Group>
      )}

      {showSize && (
        <Group title="Size" force={forced('size')} summary={textual ? undefined : valuesLine(by.size, el)}
          fine={<>{textual && <TextSize ctx={ctx} />}{type === 'sticker' && <StickerSize ctx={ctx} />}{by.size.map(render)}</>}>
          {textual && <SizeChips ctx={ctx} />}
        </Group>
      )}

      <Group title="Position" hint="Drag the piece on the canvas to move or resize it; the grid readout follows." force={forced('position')}
        fine={<>
          <div className="col-span-2"><PlaceEditor ctx={ctx} /></div>
          {info.properties.rot && el.vertical === undefined && <div className="col-span-2"><AngleControl label="Turn" value={el.rot} ctx={ctx} disabled={p.readOnly} onChange={(v) => ctx.rotate(v)} /></div>}
          {by.position.filter(([n]) => n !== 'place' && n !== 'rot').map(render)}
        </>}>
        {form === 'none' ? <p className="text-[12.5px] text-muted-foreground">It sits where the look puts it.</p> : (
          <div className="flex items-start gap-3">
            <AnchorPad ctx={ctx} onError={(m) => err('pad', m)} />
            <div className="min-w-0 flex-1 text-[12.5px] text-muted-foreground" aria-live="polite">
              {form === 'flow' ? 'In its box' : `${form === 'grid' ? 'On the grid' : PLACE_FORM_WORDS[form] ?? form}: ${placeReadout(el)}`}
              {errors.pad && <p className="mt-1 font-medium text-destructive" role="alert">{errors.pad}</p>}
            </div>
          </div>
        )}
        {turn && <TurnChips ctx={ctx} onError={(m) => err('turn', m)} error={errors.turn} />}
      </Group>

      {mainColour.length > 0 && (
        <Group title="Colour" force={forced('colour')} fine={fineColour.length > 0 ? fineColour.map(render) : undefined}>
          {mainColour.map((n) => {
            const d = info.properties[n]!;
            return <ValueControl key={n} name={n} desc={d} value={el[n]} ctx={ctx} optional={!required.has(n)} onChange={(v) => ctx.set(n, v)} />;
          })}
        </Group>
      )}
      {mainColour.length === 0 && fineColour.length > 0 && <Group title="Colour" force={forced('colour')} fine={fineColour.map(render)} summary={valuesLine(fineColour, el)} />}

      {showStyle && (
        <Group title="Style" force={forced('style')} fine={by.style.map(render)}>
          {emph?.kind === 'enum' && (
            <Chips label="Emphasis" value={typeof el.emphasis === 'string' ? el.emphasis : ''} disabled={p.readOnly}
              options={[{ value: '', label: 'Look’s own' }, ...((emph.values ?? []) as string[]).map((v) => ({ value: v, label: EMPHASIS_WORDS[v] ?? word(v) }))]}
              onChange={(v) => err('style', ctx.set('emphasis', v === '' ? undefined : v))} />
          )}
          {(alignOk || upper) && (
            <div className="flex flex-wrap items-center gap-2">
              {alignOk && <Segmented label="Alignment" value={String(el.align ?? '')} disabled={p.readOnly} onChange={(v) => err('style', ctx.set('align', v))}
                options={[{ value: 'left', label: <AlignLeft className="size-4" aria-label="Left" />, title: 'Left' }, { value: 'center', label: <AlignCenter className="size-4" aria-label="Centre" />, title: 'Centre' }, { value: 'right', label: <AlignRight className="size-4" aria-label="Right" />, title: 'Right' }]} />}
              {upper && <Segmented label="Case" value={el.upper === true ? 'upper' : el.upper === false ? 'typed' : ''} disabled={p.readOnly} onChange={(v) => err('style', ctx.set('upper', v === 'upper'))}
                options={[{ value: 'typed', label: 'Aa', title: 'As typed' }, { value: 'upper', label: 'AA', title: 'Capitals' }]} />}
            </div>
          )}
          {effects.length > 0 && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Effects">
              {effects.map(([n, label]) => <ToggleChip key={n} on={el[n] !== undefined && el[n] !== false} disabled={p.readOnly} onClick={() => toggleEffect(n)}>{label}</ToggleChip>)}
            </div>
          )}
          {errors.style && <p className="text-[12.5px] font-medium text-destructive" role="alert">{errors.style}</p>}
        </Group>
      )}

      {info.properties.when && <WhenSentence ctx={ctx} />}

      {by.more.length > 0 && (
        <Disclosure title="More settings" force={forced('more')} summary={by.more.map(([n, d]) => d.label ?? n).join(', ').toLowerCase()}>
          <div className="grid grid-cols-2 gap-x-2 gap-y-2.5">{by.more.map(render)}</div>
        </Disclosure>
      )}

      <ConfirmAction open={orphans.length > 0} title="Leave a field out of this design?" confirmLabel="Leave it out"
        message={<>Nothing shows {orphans.map((f) => fieldLabel(f, cat).toLowerCase()).join(' or ')} any more. Leave {orphans.length > 1 ? 'them' : 'it'} out of this design, so posts need no text for {orphans.length > 1 ? 'them' : 'it'}? You can add {orphans.length > 1 ? 'them' : 'it'} back under the design’s fields.</>}
        onConfirm={() => { const why = p.apply((c) => ({ comp: pruneFields(c, orphans) })); setOrphans([]); return why; }} onCancel={() => setOrphans([])} />
    </div>
  );
}

// "120 · 40": the values set under a group that has no choice of its own.
function valuesLine(list: Array<[string, Desc]>, el: Json): string | undefined {
  const bits = list.filter(([n]) => ['number', 'string'].includes(typeof el[n])).map(([n, d]) => `${(d.label ?? n).toLowerCase()} ${el[n]}`);
  return bits.length ? bits.join(' · ') : undefined;
}

// ---- Position: a 3 x 3 pad for an element on the grid. A cell writes only the grid's column (and row), keeping the width and height. ----
function AnchorPad({ ctx, onError }: { ctx: Ctx; onError: (m: string) => void }) {
  const g = gridOf(ctx.look);
  const place = isObj(ctx.el.place) ? ctx.el.place : {};
  const grid = isObj(place.grid) ? place.grid : null;
  if (!g || !grid || typeof grid.col !== 'number' || typeof grid.span !== 'number') return <PadFrame>{null}</PadFrame>;
  const rowsOn = g.rows > 0;
  const span = grid.span, rowSpan = typeof grid.rowSpan === 'number' ? grid.rowSpan : 1;
  const colAt = [1, Math.floor((g.cols - span) / 2) + 1, g.cols - span + 1];
  const rowAt = rowsOn ? [1, Math.floor((g.rows - rowSpan) / 2) + 1, g.rows - rowSpan + 1] : [1];
  const ci = colAt.indexOf(grid.col);
  const ri = rowsOn ? (typeof grid.row === 'number' ? rowAt.indexOf(grid.row) : -1) : 0;
  const names = [['Top left', 'Top', 'Top right'], ['Left', 'Middle', 'Right'], ['Bottom left', 'Bottom', 'Bottom right']];
  const go = (c: number, r: number) => onError(ctx.setPlace({ ...place, grid: { ...grid, col: colAt[c]!, ...(rowsOn ? { row: rowAt[r]! } : {}) } }));
  return (
    <PadFrame rows={rowsOn ? 3 : 1}>
      {Array.from({ length: rowsOn ? 3 : 1 }, (_, r) => [0, 1, 2].map((c) => {
        const on = ci === c && ri === r;
        return (
          <button key={`${r}${c}`} type="button" role="radio" aria-checked={on} aria-label={rowsOn ? names[r]![c]! : ['Left', 'Centre', 'Right'][c]!} title={rowsOn ? names[r]![c] : ['Left', 'Centre', 'Right'][c]} disabled={ctx.disabled} onClick={() => go(c, r)}
            className="grid place-items-center outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60">
            <span className={cn('size-2 rounded-full border border-foreground/30 transition-colors', on ? 'size-3 border-primary bg-primary' : 'bg-background')} />
          </button>
        );
      }))}
    </PadFrame>
  );
}
function PadFrame({ children, rows = 3 }: { children: ReactNode; rows?: number }) {
  if (!children) return null;
  return <div role="radiogroup" aria-label="Where on the page" className={cn('grid w-[72px] shrink-0 grid-cols-3 rounded-md border bg-muted/40 p-0.5 max-sm:w-24', rows === 3 ? 'h-[72px] grid-rows-3 max-sm:h-24' : 'h-7 grid-rows-1 max-sm:h-10')}>{children}</div>;
}

// ---- Position: turn, by the look's named angles ----
function TurnChips({ ctx, onError, error }: { ctx: Ctx; onError: (m: string) => void; error?: string }) {
  const named = namedAngles(ctx.look, ctx.cat).filter((a) => a.deg !== 0);
  const v = ctx.el.rot;
  const cur = v === undefined || v === 0 ? 'none' : typeof v === 'string' && named.some((a) => a.name === v) ? v : null;
  return (
    <div className="flex flex-col gap-1">
      <Label hint="The look’s own angles, so the design turns the way the look does.">Turn</Label>
      <Chips label="Turn" value={cur} custom disabled={ctx.disabled} onChange={(id) => onError(ctx.rotate(id === 'none' ? undefined : id))}
        options={[{ value: 'none', label: 'Straight' }, ...turnOptions(named, ctx.look)]} />
      {error && <p className="text-[12.5px] font-medium text-destructive" role="alert">{error}</p>}
    </div>
  );
}

// ---- "Shown only when [..] is filled in and [..] is empty" ----
function WhenSentence({ ctx }: { ctx: Ctx }) {
  const w = readWhen(ctx.el);
  const declared = declaredFields(ctx.comp);
  const [error, setError] = useState('');
  const set = (next: Json) => setError(ctx.set('when', Object.keys(next).length ? next : undefined));
  const sel = 'h-7 max-w-[8.5rem] rounded-md border bg-background px-1.5 text-[12.5px] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60 max-sm:h-10 max-sm:text-base';
  const opts = (other?: string) => [<option key="" value="">any</option>, ...declared.filter((f) => f !== other).map((f) => <option key={f} value={f}>{fieldLabel(f, ctx.cat)}</option>)];
  return (
    <section aria-label="Shown only when" className="border-t pt-2.5">
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px]">
        <span className="font-semibold">Shown only when</span>
        <select aria-label="Only when this is filled in" className={sel} value={w.present ?? ''} disabled={ctx.disabled} onChange={(e) => set({ ...(e.target.value ? { present: e.target.value } : {}), ...(w.absent ? { absent: w.absent } : {}) })}>{opts(w.absent)}</select>
        <span>is filled in and</span>
        <select aria-label="and only when this is empty" className={sel} value={w.absent ?? ''} disabled={ctx.disabled} onChange={(e) => set({ ...(w.present ? { present: w.present } : {}), ...(e.target.value ? { absent: e.target.value } : {}) })}>{opts(w.present)}</select>
        <span>is empty</span>
      </div>
      <p className="sr-only" role="status">{whenText(w, ctx.cat)}</p>
      {error && <p className="mt-1 text-[12.5px] font-medium text-destructive" role="alert">{error}</p>}
    </section>
  );
}
