// The design of a post: a form for the kind of post, its design and its fields (and for each page of a carousel), and an Advanced box with
// the whole design as JSON. Both edit the same object, so a field the form does not show is kept exactly as it was. The brand's named series
// are offered as kinds of post (a single image only); a brand on classic layouts chooses a layout (shown as Design) and a post type (shown
// as Kind of post) instead.
import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Notice, SwitchField, TextAreaField } from '@/components/kit';
import { AutoTag } from '@/components/auto-tag';
import { Button } from '@/components/ui/button';
import { api } from '../../api';
import { useAppInfo } from '../../app-info';
import { useLoad } from '../../hooks';
import { convertToPost, isPostDesign } from './design-model';
import { postKindName } from './editor/catalogue';
import type { SeriesSlot } from './editor/KindChooser';
import { leaveSeries, pickSeries, renumberSeries, type SeriesChange } from './editor/series-kind';
import type { SeriesInfo, SeriesRef } from './editor/series-model';
import { PageFields } from './editor/PageFields';
import { PagesEditor } from './editor/PagesEditor';
import { PostFields } from './editor/PostFields';
import { PostPagesEditor } from './editor/PostPagesEditor';
import { ChoiceRow } from './editor/ChoiceRow';
import { isPostCarousel, toPostCarousel, toSinglePost } from './editor/post-carousel';
import { usePostKinds } from './editor/use-post-kinds';
import type { Json, LayoutBrief } from './editor/types';
import type { DesignBlock } from './types';

interface Props {
  design: DesignBlock | null;
  onChange: (design: DesignBlock | null, jsonError: string) => void;
  jsonError: string;
  // where the post goes, so a carousel can say when a network takes fewer images
  networks?: readonly string[];
  // The designed image was switched on for the person (a new post, and the brand has a look): marked "Auto" until they switch it.
  autoOn?: boolean;
  // The post's place in one of the brand's named series (post.series), offered as a kind of post. Left out: no series are offered.
  series?: SeriesRef | null;
  onSeries?: (next: SeriesRef | null) => void;
}

const pretty = (d: DesignBlock | null) => JSON.stringify(d ?? {}, null, 2);

export function DesignFields({ design, onChange, jsonError, networks, autoOn = false, series = null, onSeries }: Props) {
  // the classic post types (brand.json series), offered to a classic layout as its kind of post
  const { series: postTypes } = useAppInfo().brand;
  const own = useLoad(() => api.get<{ layouts: LayoutBrief[] }>('/api/layouts').catch(() => ({ layouts: [] as LayoutBrief[] })), []);
  const brandLayouts = own.data?.layouts ?? [];
  const postKinds = usePostKinds();
  // A direction is known and set: new designs are posts, and an old-layout design may be converted.
  const directed = !postKinds.loading && postKinds.direction !== null;
  const [rawText, setRawText] = useState(() => pretty(design));
  const [advanced, setAdvanced] = useState(false);
  const enabled = design !== null;
  const d: Json = design ?? {};
  const isCarousel = d.template === 'carousel' || Array.isArray(d.pages);
  const postCarousel = isPostCarousel(design);
  const isPost = isPostDesign(design) || postCarousel;
  const locked = !!jsonError;
  const conversion = directed && enabled && !isPost && !isCarousel ? convertToPost(d) : null;

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

  // The brand's named series, as kinds of post (only with a look: a series is drawn by one).
  const seriesList = useLoad(() => (onSeries && directed ? api.get<{ series: SeriesInfo[] }>('/api/series').catch(() => ({ series: [] as SeriesInfo[] })) : Promise.resolve({ series: [] as SeriesInfo[] })), [!!onSeries, directed]);
  const allSeries = seriesList.data?.series ?? [];
  const take = (c: SeriesChange | null) => { if (!c || !onSeries) return; onSeries(c.series); onChange(c.design as DesignBlock | null, ''); };
  const seriesSlot: SeriesSlot | null = onSeries && directed && !postCarousel && (allSeries.length > 0 || series) ? {
    list: allSeries, value: series,
    pick: (id) => take(pickSeries(allSeries, series, design, id, postKinds.kinds)),
    leave: (kind) => take(leaveSeries(allSeries, series, design, kind, postKinds.kinds)),
    renumber: (n) => take(renumberSeries(allSeries, series, design, n, postKinds.kinds)),
  } : null;
  // A post in a series that is not a single designed image (a carousel, a classic layout, or no designed image): named, and can leave it.
  const current = series ? allSeries.find((s) => s.id === series.id) : undefined;
  const seriesLine = series && onSeries && !(isPost && !postCarousel && enabled) ? (
    <p className="text-[13px] text-muted-foreground">
      In the series {current?.name ?? 'that was removed'}, number {series.number}. A series post is a single designed image.{' '}
      <button type="button" className="font-medium text-foreground underline underline-offset-2" onClick={() => take(leaveSeries(allSeries, series, design, null, postKinds.kinds))}>Take it out of the series</button>
    </p>
  ) : null;

  return (
    <div className="flex flex-col gap-4">
      {seriesLine}
      <SwitchField
        label={<>This post has a designed image{autoOn && enabled && <AutoTag />}</>}
        hint={autoOn && enabled ? 'On for a new post because the brand has a look. Turn this off for a post that uses only pictures you upload.' : 'Turn this off for a post that uses only pictures you upload.'}
        checked={enabled}
        // Starts on a layout that needs only a headline, so a brand with no pictures yet can make its first image.
        onCheckedChange={(c) => { onChange(c ? (directed ? { template: 'post', kind: 'statement' } : { template: 'text' }) : null, ''); }}
      />
      {enabled && (
        <>
          {locked && <Notice tone="warn">The advanced JSON below is not valid yet, so the fields above are paused. Fix it to carry on.</Notice>}
          {isPost ? (
            <>
              <ChoiceRow
                legend="Images" disabled={locked} value={postCarousel ? 'carousel' : 'single'}
                hint={postCarousel ? 'One image per page, in order: a cover, the body pages and a closing page.' : 'One image. A carousel adds pages people swipe through.'}
                choices={[{ value: 'single', label: 'Single image' }, { value: 'carousel', label: 'Carousel' }]}
                onChange={(v) => { if ((v === 'carousel') !== postCarousel) form(v === 'carousel' ? toPostCarousel(d) : toSinglePost(d)); }}
              />
              {postCarousel
                ? <PostPagesEditor design={d} onChange={form} direction={postKinds.loading ? undefined : postKinds.direction} kinds={postKinds.kinds} limits={postKinds.limits} offered={postKinds.offered} networks={networks} disabled={locked} />
                : <PostFields design={d} onChange={form} direction={postKinds.loading ? undefined : postKinds.direction} kinds={postKinds.kinds} limits={postKinds.limits} offered={postKinds.offered} disabled={locked} series={seriesSlot} />}
            </>
          ) : (
            <>
              {directed && !isCarousel && (
                <Notice
                  tone="info"
                  actions={conversion && (
                    <Button type="button" variant="outline" size="sm" className="max-sm:min-h-11" disabled={locked} onClick={() => onChange(conversion.design, '')}>
                      Convert to a {postKindName(conversion.kind).toLowerCase()} post
                    </Button>
                  )}
                >
                  This post uses a classic design.
                </Notice>
              )}
              <PageFields design={d} onChange={form} brandLayouts={brandLayouts} series={postTypes} disabled={locked} frameOnly={isCarousel} />
              {isCarousel && <PagesEditor pages={d.pages} onChange={(pages) => form({ ...d, pages })} brandLayouts={brandLayouts} series={postTypes} disabled={locked} />}
            </>
          )}
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
