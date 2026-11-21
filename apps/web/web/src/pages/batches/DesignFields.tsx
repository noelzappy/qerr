// The design of a post: a form for the layout and its fields (and for each page of a carousel), and an Advanced box with the
// whole design as JSON. Both edit the same object, so a field the form does not show is kept exactly as it was.
import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { CheckField, Notice, TextAreaField } from '@/components/kit';
import { api } from '../../api';
import { useAppInfo } from '../../app-info';
import { useLoad } from '../../hooks';
import { PageFields } from './editor/PageFields';
import { PagesEditor } from './editor/PagesEditor';
import type { Json, LayoutBrief } from './editor/types';
import type { DesignBlock } from './types';

interface Props {
  design: DesignBlock | null;
  onChange: (design: DesignBlock | null, jsonError: string) => void;
  jsonError: string;
}

const pretty = (d: DesignBlock | null) => JSON.stringify(d ?? {}, null, 2);

export function DesignFields({ design, onChange, jsonError }: Props) {
  const { series } = useAppInfo().brand;
  const own = useLoad(() => api.get<{ layouts: LayoutBrief[] }>('/api/layouts').catch(() => ({ layouts: [] as LayoutBrief[] })), []);
  const brandLayouts = own.data?.layouts ?? [];
  const [rawText, setRawText] = useState(() => pretty(design));
  const [advanced, setAdvanced] = useState(false);
  const enabled = design !== null;
  const d: Json = design ?? {};
  const isCarousel = d.template === 'carousel' || Array.isArray(d.pages);
  const locked = !!jsonError;

  // Keep the JSON box in step with the form while the form is the one being used.
  useEffect(() => { if (!jsonError) setRawText(pretty(design)); }, [design, jsonError]);
  // A mistake in the JSON must be seen.
  useEffect(() => { if (jsonError) setAdvanced(true); }, [jsonError]);

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

  const form = (next: Json) => onChange(next, '');

  return (
    <div className="flex flex-col gap-4">
      <CheckField
        label="This post has a designed image"
        hint="Turn this off for a post that uses only pictures you upload."
        checked={enabled}
        onCheckedChange={(c) => { onChange(c ? { template: 'cover' } : null, ''); }}
      />
      {enabled && (
        <>
          {locked && <Notice tone="warn">The advanced JSON below is not valid yet, so the fields above are paused. Fix it to carry on.</Notice>}
          <PageFields design={d} onChange={form} brandLayouts={brandLayouts} series={series} disabled={locked} frameOnly={isCarousel} />
          {isCarousel && <PagesEditor pages={d.pages} onChange={(pages) => form({ ...d, pages })} brandLayouts={brandLayouts} series={series} disabled={locked} />}
          <div>
            <button
              type="button"
              aria-expanded={advanced}
              aria-controls="design-advanced"
              onClick={() => setAdvanced(!advanced)}
              className="-ml-1 inline-flex min-h-8 items-center gap-1.5 rounded-md px-1 text-sm font-medium outline-none hover:text-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:min-h-11"
            >
              {advanced ? <ChevronDown className="size-4" aria-hidden="true" /> : <ChevronRight className="size-4" aria-hidden="true" />}
              Advanced
            </button>
            {advanced && (
              <div id="design-advanced" className="mt-2">
                <TextAreaField
                  label="Design as JSON" mono value={rawText} spellCheck={false} rows={14}
                  error={jsonError || undefined}
                  hint="The full design. Checked again by the server when you save."
                  onChange={(e) => onRaw(e.target.value)}
                />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
