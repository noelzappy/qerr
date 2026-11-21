// "Use this layout": the composition the AI suggested from a design reference, as a layout of Settings, Layouts. The server
// checked it with the engine's layout validator when the reference was described; here an admin sees a sketch of it, renders a
// real preview with the brand (the engine checks it again and runs every image check), names it and adds it. Nothing is stored
// until they do, and the new layout is checked once more on the way in.
import { useEffect, useState } from 'react';
import { Eye, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../../api';
import { errorMessage } from '../../lib/errors';
import { BusyButton, Lines, Notice, TextField } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import type { DesignReference } from './brand-types';
import { LayoutSketch } from './LayoutSketch';
import type { Catalogue, Layout, LayoutsResponse, PreviewResult, StoredLayout } from './layout-types';

const slugOf = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'from-reference';

export function ReferenceLayout({ reference, open, onClose }: { reference: DesignReference; open: boolean; onClose: () => void }) {
  const suggested = reference.analysis?.composition ?? null;
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [taken, setTaken] = useState<string[]>([]);
  const [name, setName] = useState(suggested?.name ?? 'From a reference');
  const [id, setId] = useState(slugOf(suggested?.name ?? 'from-reference'));
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [added, setAdded] = useState<StoredLayout | null>(null);

  useEffect(() => {
    if (!open) return;
    setPreview(null); setError(''); setAdded(null);
    api.get<LayoutsResponse>('/api/settings/layouts')
      .then((r) => { setCatalogue(r.catalogue); setTaken(r.layouts.map((l) => l.slug)); })
      .catch((e) => setError(errorMessage(e)));
  }, [open]);
  useEffect(() => { let n = 2, next = id; while (taken.includes(next)) next = `${id}-${n++}`; if (next !== id) setId(next); }, [taken]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!suggested) return null;
  const layout: Layout = { ...suggested, id, name };
  async function runPreview() {
    setBusy('preview'); setPreview(null);
    try { setPreview(await api.post<PreviewResult>('/api/settings/layouts/preview', { definition: layout })); }
    catch (e) { setPreview({ ok: false, size: 'feed', error: errorMessage(e), warnings: [], notes: [] }); }
    finally { setBusy(''); }
  }
  async function add() {
    setBusy('add'); setError('');
    try {
      const r = await api.post<{ layout: StoredLayout }>('/api/settings/layouts', { definition: layout, origin: `reference:${reference.id}` });
      setAdded(r.layout);
      toast.success('Layout added');
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(''); }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !busy) onClose(); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Use this layout</DialogTitle>
          <DialogDescription>How this reference is arranged, as a layout for your posts. Preview it before you add it.</DialogDescription>
        </DialogHeader>
        {error && <Notice tone="bad">{error}</Notice>}
        {added
          ? <Notice tone="good" actions={<span className="flex gap-2"><Button asChild size="sm" variant="outline"><Link to={`/settings/layouts/${added.id}`}>Edit this layout</Link></Button><Button asChild size="sm" variant="ghost"><Link to="/settings/layouts">Open Layouts</Link></Button></span>}>Added as <strong>{added.name}</strong> ({added.slug}). Posts and the AI can use it now.</Notice>
          : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                {catalogue ? <LayoutSketch layout={layout} size="feed" catalogue={catalogue} /> : <Skeleton className="aspect-[4/5] w-full" />}
                {preview?.image && <img src={preview.image} alt="Preview of the suggested layout" className="w-full rounded-md border" />}
              </div>
              <div className="flex flex-col gap-3">
                                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField label="Name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} hint={[suggested.description, `Fields: ${Object.keys(suggested.fields ?? {}).join(', ')}`].filter(Boolean).join(' ')} />
                  <TextField label="Id" mono value={id} maxLength={40} hint="Used in links and by the AI; lowercase letters, digits and -" onChange={(e) => setId(e.target.value)} />
                </div>
                {preview?.error && <Notice tone="bad">{preview.error}</Notice>}
                {preview && preview.warnings.length > 0 && <Notice tone="warn" title="Checks:"><Lines items={preview.warnings} /></Notice>}
                {preview?.ok && preview.warnings.length === 0 && <Notice tone="good">The preview passed every check.</Notice>}
              </div>
            </div>
          )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={!!busy}>{added ? 'Close' : 'Cancel'}</Button>
          {!added && <BusyButton variant="outline" loading={busy === 'preview'} onClick={() => void runPreview()}><Eye aria-hidden="true" /> Preview</BusyButton>}
          {!added && <BusyButton loading={busy === 'add'} disabled={!preview?.ok} onClick={() => void add()}><Plus aria-hidden="true" /> Add the layout</BusyButton>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
