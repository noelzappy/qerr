// The routes of one look: /settings/looks/:slug (the look page) and /settings/looks/:slug/designs/:id (the design editor). Both load the
// list (catalogue, fonts, limits) and the look; an unknown address shows a way back.
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useDocumentTitle, useLoad } from '../../../hooks';
import { errorMessage } from '../../../lib/errors';
import { BusyButton, EmptyBlock, ErrorBlock, LoadingBlock } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { DesignEditor } from './DesignEditor';
import { LookPage } from './LookPage';
import { isOwn } from './look-types';
import { lookApi } from './looks-api';

const Back = () => <Button asChild variant="outline"><Link to="/settings/looks">Back to Looks</Link></Button>;

function useOwnLook(slug: string | undefined) {
  const list = useLoad(() => lookApi.list(), []);
  const detail = useLoad(() => lookApi.get(`own:${slug}`), [slug]);
  return { list, detail };
}

// A look we ship has no page of its own to change: it is read only, so the way in is a copy.
function ShippedNotice({ slug, name }: { slug: string; name: string }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <EmptyBlock title={`${name} ships with the app`} action={<div className="flex gap-2"><BusyButton loading={busy} onClick={async () => { setBusy(true); try { navigate(`/settings/looks/${(await lookApi.duplicate(`shipped:${slug}`)).slug}`); } catch (e) { setError(errorMessage(e)); setBusy(false); } }}>Customise</BusyButton><Back /></div>}>
      It is read only. Customise it to make a copy you can change.{error && <span className="mt-2 block text-destructive" role="alert">{error}</span>}
    </EmptyBlock>
  );
}

export function LookRoute() {
  const { slug } = useParams();
  const { list, detail } = useOwnLook(slug);
  const [active, setActive] = useState<string | null | undefined>(undefined);
  useDocumentTitle(detail.data?.name ?? 'Look');
  if (list.error) return <ErrorBlock message={list.error} onRetry={() => void list.reload()} />;
  if (!list.data) return <LoadingBlock label="Loading the look" />;
  const shipped = list.data.shipped.find((l) => l.id === slug);
  if (detail.error) {
    if (shipped) return <ShippedNotice slug={shipped.id} name={shipped.name} />;
    return <ErrorBlock title={/not found/i.test(detail.error) ? 'This look could not be found' : 'This look could not be loaded'} message={detail.error} onRetry={() => void detail.reload()} />;
  }
  if (!detail.data) return <LoadingBlock label="Loading the look" />;
  if (!isOwn(detail.data)) return <ShippedNotice slug={detail.data.id} name={detail.data.name} />;
  return <LookPage key={detail.data.slug} initial={detail.data} list={list.data} activeRef={active === undefined ? list.data.activeRef : active} onActive={setActive} />;
}

export function DesignRoute() {
  const { slug, id } = useParams();
  const { list, detail } = useOwnLook(slug);
  useDocumentTitle('Design');
  if (list.error || detail.error) return <ErrorBlock title="This design could not be loaded" message={list.error || detail.error} onRetry={() => { void list.reload(); void detail.reload(); }} />;
  if (!list.data || !detail.data) return <LoadingBlock label="Loading the design" />;
  const look = detail.data;
  const design = isOwn(look) ? look.compositions.find((c) => c.id === id) : undefined;
  if (!isOwn(look) || !design) return <EmptyBlock title="This design could not be found" action={<Button asChild variant="outline"><Link to={`/settings/looks/${slug}?tab=designs`}>Back to the look</Link></Button>} />;
  return <DesignEditor key={`${look.slug}/${design.id}`} initialLook={look} designId={design.id} list={list.data} />;
}
