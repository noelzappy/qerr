// The design block of a post: a form for the common fields and a raw JSON editor for everything else. Both edit the same
// object, so fields the form does not know (a carousel's pages, a ledger's rows) are kept exactly as they were.
import { useEffect, useState } from 'react';
import { BusyButton, CheckField, Notice, SelectField, TextAreaField, TextField } from '@/components/kit';
import { TEMPLATES } from './labels';
import { useAppInfo } from '../../app-info';
import type { DesignBlock } from './types';

interface Props {
  design: DesignBlock | null;
  onChange: (design: DesignBlock | null, jsonError: string) => void;
  jsonError: string;
}

const text = (v: unknown) => (typeof v === 'string' ? v : '');
const pretty = (d: DesignBlock | null) => JSON.stringify(d ?? {}, null, 2);

export function DesignFields({ design, onChange, jsonError }: Props) {
  const { series } = useAppInfo().brand;
  const [raw, setRaw] = useState(false);
  const [rawText, setRawText] = useState(() => pretty(design));
  const enabled = design !== null;
  const d = design ?? {};
  const isCarousel = d.template === 'carousel' || Array.isArray(d.pages);

  // Keep the raw box in step with the form while the form is the one being used.
  useEffect(() => { if (!jsonError) setRawText(pretty(design)); }, [design, jsonError]);

  function setField(key: string, value: unknown) {
    const next: DesignBlock = { ...d };
    if (value === '' || value === undefined || (Array.isArray(value) && value.length === 0)) delete next[key];
    else next[key] = value;
    onChange(next, '');
  }

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
  const layouts = [
    ...(TEMPLATES.some((t) => t.value === d.template) ? [] : [{ value: text(d.template), label: text(d.template) || 'Choose a layout' }]),
    ...TEMPLATES,
  ];
  const grid = 'grid grid-cols-1 gap-3.5 sm:grid-cols-2';
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
            <SelectField label="Layout" value={text(d.template)} disabled={locked} onValueChange={(v) => setField('template', v)} options={layouts} />
            <SelectField label="Series" optional value={text(d.series)} disabled={locked} onValueChange={(v) => setField('series', v)} options={[{ value: '', label: 'No series' }, ...series.map((s) => ({ value: s.key, label: s.name }))]} />
          </div>
          {isCarousel && <Notice tone="info">This design is a carousel. Its pages are edited in the raw JSON below; the series and label here apply to the whole carousel.</Notice>}
          {!isCarousel && (
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
          <TextField label="Label" optional maxLength={40} value={text(d.label)} disabled={locked} hint="Small text in the running head, up to 40 characters." onChange={(e) => setField('label', e.target.value)} />
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
