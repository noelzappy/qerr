// The editor's two routes: /settings/layouts/new (a blank layout, or one made from ?from=<starter id>, ?duplicate=<layout id> or
// ?copy=<built-in id>) and /settings/layouts/:id (a saved layout). It loads the list the editor needs (the catalogue, the starters and
// the layouts' ids), so a refresh restores the same layout, and shows a way back when the layout is not there.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../../api';
import { useLoad } from '../../../hooks';
import { errorMessage } from '../../../lib/errors';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { withoutGuard } from '@/hooks/use-unsaved-guard';
import { LayoutEditor } from '../LayoutEditor';
import { freeId, idFromName } from '../layout-model';
import { blankLayout, type Layout, type LayoutsResponse, type StoredLayout } from '../layout-types';

const Back = () => <Button asChild variant="outline"><Link to="/settings/layouts">Back to Classic layouts</Link></Button>;

// A built-in layout copied into one of the brand's own (made on the server, off until switched on), then opened to edit.
function CopyBuiltin({ id }: { id: string }) {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    api.post<{ layout: StoredLayout }>('/api/settings/layouts', { builtin: id })
      .then((r) => navigate(`/settings/layouts/${r.layout.id}`, { replace: true }))
      .catch((e) => setError(errorMessage(e)));
  }, [id, navigate]);
  if (error) return <ErrorBlock title="The layout could not be copied" message={error} onRetry={() => navigate('/settings/layouts')} />;
  return <LoadingBlock label="Making a copy to edit" />;
}

export function LayoutEditorRoute({ mode }: { mode: 'new' | 'edit' }) {
  const { id } = useParams();
  const [query] = useSearchParams();
  const navigate = useNavigate();
  const saved = useRef(false);
  const list = useLoad(() => api.get<LayoutsResponse>('/api/settings/layouts'), []);
  const data = list.data;
  const copy = query.get('copy'), from = query.get('from'), duplicate = query.get('duplicate');

  const start = useMemo((): { layout: Layout } | null => {
    if (!data || mode !== 'new') return null;
    const taken = data.layouts.map((l) => l.slug), max = data.catalogue.layout.id.max;
    const source = duplicate ? data.layouts.find((l) => l.id === duplicate || l.slug === duplicate) : null;
    if (duplicate && !source) return null;
    const starter = from ? data.starters.find((s) => s.id === from) : null;
    const base = source ? structuredClone(source.definition) : starter ? structuredClone(starter) : blankLayout();
    if (source) base.name = `${source.name} (copy)`.slice(0, data.catalogue.layout.name.max);
    return { layout: { ...base, id: freeId(source ? idFromName(base.name, max) : base.id, taken, max) } };
  }, [data, mode, from, duplicate]);

  const merge = (l: StoredLayout) => list.setData((d) => (d ? { ...d, layouts: d.layouts.some((x) => x.id === l.id) ? d.layouts.map((x) => (x.id === l.id ? l : x)) : [...d.layouts, l] } : d));

  if (mode === 'new' && copy) return <CopyBuiltin id={copy} />;
  if (list.error) return <ErrorBlock message={list.error} onRetry={() => void list.reload()} />;
  if (!data) return <LoadingBlock label="Loading the layout" />;

  if (mode === 'edit') {
    const stored = data.layouts.find((l) => l.id === id);
    if (!stored) return <EmptyBlock title="This layout was not found" action={<Back />}>It may have been removed, or the address is wrong.</EmptyBlock>;
    return (
      <LayoutEditor key={stored.id} initial={structuredClone(stored.definition)} stored={stored} catalogue={data.catalogue} takenIds={data.layouts.filter((l) => l.id !== stored.id).map((l) => l.slug)}
        onSaved={merge} />
    );
  }
  if (!start) return <EmptyBlock title="The layout to copy was not found" action={<Back />}>It may have been removed.</EmptyBlock>;
  if (!saved.current && data.layouts.length >= data.max) return <EmptyBlock title="No room for another layout" action={<Back />}>This brand already has {data.max} layouts. Remove one to add another.</EmptyBlock>;
  return (
    <LayoutEditor key={`new:${from ?? ''}:${duplicate ?? ''}`} initial={start.layout} stored={null} catalogue={data.catalogue} takenIds={data.layouts.map((l) => l.slug)}
      onSaved={(l) => { saved.current = true; merge(l); withoutGuard(() => navigate(`/settings/layouts/${l.id}`, { replace: true })); }} />
  );
}
