// The design block of a post: a form for the common fields and a raw JSON editor for everything else. Both edit the same
// object, so fields the form does not know (a ledger's rows, an artefact) are kept exactly as they were. A carousel's pages are
// listed one by one: each made with a built-in page template or one of the brand's own layouts, whose fields the form fills in.
import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { BusyButton, CheckField, Notice, SelectField, TextAreaField, TextField } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { api } from '../../api';
import { useAppInfo } from '../../app-info';
import { useLoad } from '../../hooks';
import { addPage, chooseLayout, chosenOf, isCarousel as carouselOf, layoutChoices, MAX_PAGES, MIN_PAGES, movePage, ownLayoutOf, pagesOf, removePage, withField, withPage, type LayoutBrief } from './design-model';
import type { DesignBlock } from './types';

interface Props {
  design: DesignBlock | null;
  onChange: (design: DesignBlock | null, jsonError: string) => void;
  jsonError: string;
}

const text = (v: unknown) => (typeof v === 'string' ? v : '');
const FIELD_LABEL: Record<string, string> = { headline: 'Headline', sub: 'Sub line', line: 'Line', quote: 'Quotation', myth: 'Myth', factLead: 'Fact (headline)', fact: 'Fact explained', big: 'Big figure', label: 'Label', eyebrow: 'Eyebrow', note: 'Note', title: 'Window title', stats: 'Figures', items: 'Points' };
const lines = (v: unknown) => (Array.isArray(v) ? v.map((x) => (Array.isArray(x) ? x.join('|') : String(x))).join('\n') : '');
const pretty = (d: DesignBlock | null) => JSON.stringify(d ?? {}, null, 2);
const grid = 'grid grid-cols-1 gap-3.5 sm:grid-cols-2';

// The fields one of the brand's layouts takes, for a post or a carousel page made with it.
function LayoutFieldInputs({ layout, node, set, locked }: { layout: LayoutBrief; node: DesignBlock; set: (key: string, value: unknown) => void; locked: boolean }) {
  return (
    <>
      {layout.description && <p className="text-[13px] text-muted-foreground">{layout.description}</p>}
      {layout.fields.filter((f) => f.kind !== 'image' && f.kind !== 'artefact').map((f) => {
        const label = FIELD_LABEL[f.name] ?? f.name;
        const list = f.kind === 'stats' || f.kind === 'items';
        const hint = `${f.word}${f.max ? `, up to ${f.max}${list ? ' entries, one per line' : ' characters'}` : ''}`;
        if (list) return <TextAreaField key={f.name} label={label} optional={!f.required} rows={3} disabled={locked} hint={hint} value={lines(node[f.name])} onChange={(e) => set(f.name, e.target.value.split('\n').map((l) => l.trim()).filter(Boolean))} />;
        return f.kind === 'text'
          ? <TextAreaField key={f.name} label={label} optional={!f.required} rows={2} maxLength={f.max ?? undefined} disabled={locked} hint={hint} value={text(node[f.name])} onChange={(e) => set(f.name, e.target.value)} />
          : <TextField key={f.name} label={label} optional={!f.required} maxLength={f.max ?? undefined} disabled={locked} hint={hint} value={text(node[f.name])} onChange={(e) => set(f.name, e.target.value)} />;
      })}
      {layout.fields.some((f) => f.kind === 'image') && (
        <div className={grid}>
          <TextField label="Image file" optional mono value={text(node.image)} disabled={locked} hint="A file under design/assets/." onChange={(e) => set('image', e.target.value)} />
          <TextField label="Vault photo id" optional mono value={text(node.vaultItemId)} disabled={locked} hint="Use a vault photo instead of the file." onChange={(e) => set('vaultItemId', e.target.value)} />
        </div>
      )}
      {layout.fields.some((f) => f.kind === 'artefact') && <Notice tone="info">This layout shows a ledger, passbook or card: write it as "artefact" in the raw JSON below.</Notice>}
    </>
  );
}

// A carousel's pages: each page's layout (a built-in page template or one of the brand's layouts drawn at the feed size) and, for
// a brand's layout, its fields. A brand layout's page knows its place: its "first page" blocks show on page 1 only.
function CarouselPages({ design, brand, locked, onChange }: { design: DesignBlock; brand: LayoutBrief[]; locked: boolean; onChange: (d: DesignBlock) => void }) {
  const pages = pagesOf(design);
  return (
    <div className="flex flex-col gap-3" role="group" aria-label="Carousel pages">
      <p className="text-sm font-medium">Pages</p>
      {pages.map((p, i) => {
        const own = ownLayoutOf(p, brand);
        const set = (key: string, value: unknown) => onChange(withPage(design, i, withField(p, key, value)));
        return (
          <div key={i} className="flex flex-col gap-3 rounded-md border p-3" role="group" aria-label={`Page ${i + 1}`}>
            <div className="flex items-center gap-1">
              <p className="flex-1 text-[13px] font-medium">Page {i + 1} of {pages.length}</p>
              <Button size="icon" variant="ghost" className="size-8" disabled={locked || i === 0} aria-label={`Move page ${i + 1} up`} onClick={() => onChange(movePage(design, i, -1))}><ArrowUp /></Button>
              <Button size="icon" variant="ghost" className="size-8" disabled={locked || i === pages.length - 1} aria-label={`Move page ${i + 1} down`} onClick={() => onChange(movePage(design, i, 1))}><ArrowDown /></Button>
              <Button size="icon" variant="ghost" className="size-8" disabled={locked || pages.length <= MIN_PAGES} aria-label={`Remove page ${i + 1}`} onClick={() => onChange(removePage(design, i))}><X /></Button>
            </div>
            <SelectField label="Layout of this page" value={chosenOf(p)} disabled={locked} options={layoutChoices(brand, chosenOf(p), { page: true })}
              onValueChange={(v) => onChange(withPage(design, i, chooseLayout(p, v, brand, { page: true })))} />
            {own
              ? <LayoutFieldInputs layout={own} node={p} set={set} locked={locked} />
              : <p className="text-[12.5px] text-muted-foreground">This page's words and pictures are edited in the raw JSON below.</p>}
          </div>
        );
      })}
      <div>
        <Button type="button" variant="outline" size="sm" disabled={locked || pages.length >= MAX_PAGES} onClick={() => onChange(addPage(design))}><Plus aria-hidden="true" /> Add a page</Button>
      </div>
    </div>
  );
}

export function DesignFields({ design, onChange, jsonError }: Props) {
  const { series } = useAppInfo().brand;
  const [raw, setRaw] = useState(false);
  const own = useLoad(() => api.get<{ layouts: LayoutBrief[] }>('/api/layouts').catch(() => ({ layouts: [] as LayoutBrief[] })), []);
  const brandLayouts = own.data?.layouts ?? [];
  const [rawText, setRawText] = useState(() => pretty(design));
  const enabled = design !== null;
  const d = design ?? {};
  const isCarousel = carouselOf(d);

  // Keep the raw box in step with the form while the form is the one being used.
  useEffect(() => { if (!jsonError) setRawText(pretty(design)); }, [design, jsonError]);

  const setField = (key: string, value: unknown) => onChange(withField(d, key, value), '');

  function onRaw(v: string) {
    setRawText(v);
    try {
      const parsed: unknown = JSON.parse(v);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('The design must be a JSON object, written with { }');
      onChange(parsed as DesignBlock, '');
    } catch (e) {
      onChange(design, e instanceof Error ? e.message : 'This is not valid JSON');
    }
  }

  const locked = !!jsonError;
  // A brand layout is chosen as "layout:<id>": the design block gets template "layout" and the layout's id.
  const chosen = chosenOf(d);
  const ownLayout = ownLayoutOf(d, brandLayouts);
  return (
    <div className="flex flex-col gap-4">
      <CheckField
        label="This post has a designed image"
        hint="Turn this off for a post that uses only photos you upload."
        checked={enabled}
        onCheckedChange={(c) => { onChange(c ? { template: 'cover' } : null, ''); }}
      />
      {enabled && (
        <>
          {locked && <Notice tone="warn">The raw JSON below is not valid yet, so these fields are paused. Fix the JSON to carry on.</Notice>}
          <div className={grid}>
            <SelectField label="Layout" value={chosen} disabled={locked} onValueChange={(v) => onChange(chooseLayout(d, v, brandLayouts), '')} options={layoutChoices(brandLayouts, chosen)} />
            <SelectField label="Series" optional value={text(d.series)} disabled={locked} onValueChange={(v) => setField('series', v)} options={[{ value: '', label: 'No series' }, ...series.map((s) => ({ value: s.key, label: s.name }))]} />
          </div>
          {isCarousel && <CarouselPages design={d} brand={brandLayouts} locked={locked} onChange={(next) => onChange(next, '')} />}
          {ownLayout && <LayoutFieldInputs layout={ownLayout} node={d} set={setField} locked={locked} />}
          {!isCarousel && !ownLayout && (
            <>
              <TextAreaField label="Headline" optional rows={2} value={text(d.headline)} disabled={locked} hint="Put *asterisks* around the words to highlight." onChange={(e) => setField('headline', e.target.value)} />
              <TextAreaField label="Sub line" optional rows={2} value={text(d.sub)} disabled={locked} onChange={(e) => setField('sub', e.target.value)} />
              {d.template === 'stats' && (
                <>
                  <TextField label="Big figure" optional value={text(d.big)} disabled={locked} onChange={(e) => setField('big', e.target.value)} />
                  <TextField label="Line under the figure" optional value={text(d.line)} disabled={locked} onChange={(e) => setField('line', e.target.value)} />
                  <TextAreaField
                    label="Supporting figures" optional rows={3} disabled={locked}
                    hint="One per line, as number|label. Up to three."
                    value={Array.isArray(d.stats) ? d.stats.filter((s): s is string => typeof s === 'string').join('\n') : ''}
                    onChange={(e) => setField('stats', e.target.value.split('\n').map((l) => l.trim()).filter(Boolean))}
                  />
                </>
              )}
              <div className={grid}>
                <TextField label="Image file" optional mono value={text(d.image)} disabled={locked} hint="A file under design/assets/." onChange={(e) => setField('image', e.target.value)} />
                <TextField label="Vault photo id" optional mono value={text(d.vaultItemId)} disabled={locked} hint="Use a vault photo instead of the file." onChange={(e) => setField('vaultItemId', e.target.value)} />
              </div>
            </>
          )}
          <TextField label="Label" optional maxLength={40} value={text(d.label)} disabled={locked} hint={isCarousel ? 'Small text in the running head of every page, up to 40 characters (a page may set its own).' : 'Small text in the running head, up to 40 characters.'} onChange={(e) => setField('label', e.target.value)} />
          <div><BusyButton type="button" variant="outline" size="sm" aria-pressed={raw} onClick={() => setRaw(!raw)}>{raw ? 'Hide raw design JSON' : 'Show raw design JSON'}</BusyButton></div>
          {raw && (
            <TextAreaField
              label="Raw design JSON" mono value={rawText} spellCheck={false} rows={14}
              error={jsonError || undefined}
              hint="The full design block. Checked again by the server when you save."
              onChange={(e) => onRaw(e.target.value)}
            />
          )}
        </>
      )}
    </div>
  );
}
