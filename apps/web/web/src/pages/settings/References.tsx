// Settings, Design references: pictures the team likes (posts, posters, adverts, pages). The AI looks at each one and writes
// a style brief; drafts are given the briefs of the references that are switched on, so the images lean that way. People
// can read and rewrite a brief, switch a reference off, or ask the AI to look again.
import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../api';
import { useDocumentTitle, useLoad } from '../../hooks';
import { errorMessage } from '../../lib/errors';
import { Notice } from '@/components/notice';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { BusyButton, ConfirmAction, ToneBadge } from '../batches/parts';
import { ErrorBlock } from '../kit/states';
import type { DesignReference } from './brand-types';
import { shrinkImage } from './logo-tools';
import { SettingsPage } from './section';

const STATUS: Record<DesignReference['status'], { tone: 'quiet' | 'info' | 'good' | 'bad'; label: string }> = {
  pending: { tone: 'info', label: 'Waiting for the AI' },
  analysing: { tone: 'info', label: 'The AI is looking' },
  ready: { tone: 'good', label: 'Brief ready' },
  failed: { tone: 'bad', label: 'Could not be described' },
};

function ReferenceCard({ r, onChange, onRemove }: { r: DesignReference; onChange: (r: DesignReference) => void; onRemove: () => void }) {
  const [brief, setBrief] = useState(r.brief ?? '');
  const [busy, setBusy] = useState('');
  useEffect(() => setBrief(r.brief ?? ''), [r.brief]);
  const working = r.status === 'pending' || r.status === 'analysing';
  async function patch(body: Record<string, unknown>, what: string) {
    setBusy(what);
    try { onChange((await api.patch<{ reference: DesignReference }>(`/api/settings/brand/references/${r.id}`, body)).reference); }
    catch (err) { toast.error(errorMessage(err)); }
    finally { setBusy(''); }
  }
  async function again() {
    setBusy('again');
    try { onChange((await api.post<{ reference: DesignReference }>(`/api/settings/brand/references/${r.id}/analyse`)).reference); }
    catch (err) { toast.error(errorMessage(err)); }
    finally { setBusy(''); }
  }
  return (
    <li className="grid gap-4 rounded-lg border bg-card p-3 sm:grid-cols-[11rem_minmax(0,1fr)]">
      <div className="flex flex-col gap-2">
        {r.imageUrl ? <img src={r.imageUrl} alt={`Design reference ${r.fileName}`} className="aspect-square w-full rounded-md border object-cover" loading="lazy" /> : <div className="aspect-square w-full rounded-md border bg-muted" />}
        <ToneBadge tone={STATUS[r.status].tone} dot>{STATUS[r.status].label}</ToneBadge>
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="truncate text-[13px] text-muted-foreground">{r.fileName}{r.note ? ` · "${r.note}"` : ''}</span>
          <label className="flex items-center gap-2 text-[13px]">
            <Switch checked={r.enabled} disabled={busy === 'enabled'} onCheckedChange={(v) => void patch({ enabled: v }, 'enabled')} aria-label="Drafts use this reference" />
            Drafts use it
          </label>
        </div>
        {working && <p className="flex items-center gap-2 text-[13px] text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden="true" /> The AI is describing the style. This takes a few seconds.</p>}
        {r.status === 'failed' && <Notice tone="bad">{r.error ?? 'The AI could not describe this picture.'} Check that an AI provider is set up for drafting and that its model can read images.</Notice>}
        {r.analysis && (
          <div className="flex flex-wrap items-center gap-1.5" aria-label="Colours the AI saw">
            {r.analysis.palette.map((p) => (
              <span key={p.hex + p.role} className="flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11.5px]">
                <span className="size-3 rounded-full border" style={{ background: p.hex }} aria-hidden="true" />
                <span className="font-mono">{p.hex}</span> <span className="text-muted-foreground">{p.role}</span>
              </span>
            ))}
            <span className="text-[12px] text-muted-foreground">Mood: {r.analysis.mood}</span>
          </div>
        )}
        {(r.brief || r.status === 'ready') && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`brief-${r.id}`} className="text-[13px] font-medium">Style brief the AI is given</label>
            <Textarea id={`brief-${r.id}`} rows={4} maxLength={2000} value={brief} onChange={(e) => setBrief(e.target.value)} className="text-[13px]" />
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {brief.trim() && brief !== (r.brief ?? '') && <BusyButton size="sm" loading={busy === 'brief'} onClick={() => void patch({ brief: brief.trim() }, 'brief')}>Save the brief</BusyButton>}
          <BusyButton size="sm" variant="outline" loading={busy === 'again'} disabled={working} onClick={() => void again()}><RefreshCw aria-hidden="true" /> Describe again</BusyButton>
          <Button size="sm" variant="ghost" onClick={onRemove}><Trash2 aria-hidden="true" /> Remove</Button>
        </div>
      </div>
    </li>
  );
}

export function ReferencesPage() {
  useDocumentTitle('Design references');
  const list = useLoad(() => api.get<{ references: DesignReference[]; max: number }>('/api/settings/brand/references'), []);
  const [items, setItems] = useState<DesignReference[]>([]);
  const [note, setNote] = useState('');
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState<DesignReference | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (list.data) setItems(list.data.references); }, [list.data]);

  // While the AI works on any of them, look again every few seconds.
  const working = items.some((r) => r.status === 'pending' || r.status === 'analysing');
  useEffect(() => {
    if (!working) return;
    const t = setInterval(() => { void api.get<{ references: DesignReference[] }>('/api/settings/brand/references').then((r) => setItems(r.references)).catch(() => undefined); }, 3000);
    return () => clearInterval(t);
  }, [working]);

  async function upload(files: FileList) {
    setUploading(true);
    try {
      for (const f of [...files].slice(0, 10)) {
        const form = new FormData();
        form.set('file', await shrinkImage(f));
        form.set('note', note.trim());
        const { reference } = await api.upload<{ reference: DesignReference }>('/api/settings/brand/references', form);
        setItems((cur) => [...cur, reference]);
      }
      setNote('');
      toast.success('Uploaded. The AI is describing the style.');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  const max = list.data?.max ?? 24;
  const on = items.filter((r) => r.enabled && r.status === 'ready').length;
  return (
    <SettingsPage
      title="Design references"
      description="Upload posts, posters, adverts or pages whose style you like. The AI describes each one, and every draft is told to lean towards these styles, alongside the visual direction in Brand and look."
    >
      <div className="flex flex-col gap-3 rounded-lg border border-dashed p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-60 flex-1 flex-col gap-1.5">
            <label htmlFor="ref-note" className="text-[13px] font-medium">What you like about it <span className="font-normal text-muted-foreground">(optional)</span></label>
            <input id="ref-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="The calm layout and the big numbers" className="h-9 rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50" />
          </div>
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => { if (e.target.files?.length) void upload(e.target.files); e.target.value = ''; }} />
          <BusyButton loading={uploading} disabled={items.length >= max} onClick={() => input.current?.click()}><ImagePlus aria-hidden="true" /> Upload pictures</BusyButton>
        </div>
        <p className="text-[12.5px] text-muted-foreground">JPEG, PNG, WebP or GIF. Large pictures are scaled down first. Up to {max} references; {on} {on === 1 ? 'is' : 'are'} in use now. Use pictures you may share with your AI provider.</p>
      </div>
      {list.error ? <ErrorBlock message={list.error} onRetry={() => void list.reload()} />
        : list.loading && !list.data ? <Skeleton className="h-48 rounded-lg" />
        : items.length === 0 ? <p className="py-6 text-center text-[13.5px] text-muted-foreground">No design references yet.</p>
        : <ul className="flex flex-col gap-3">{items.map((r) => <ReferenceCard key={r.id} r={r} onChange={(n) => setItems((cur) => cur.map((x) => (x.id === n.id ? n : x)))} onRemove={() => setRemoving(r)} />)}</ul>}
      <ConfirmAction
        open={!!removing}
        title="Remove this design reference?"
        message="Drafts stop using its style brief. The picture is deleted."
        confirmLabel="Remove"
        danger
        onConfirm={async () => {
          if (!removing) return;
          try { await api.delete(`/api/settings/brand/references/${removing.id}`); setItems((cur) => cur.filter((x) => x.id !== removing.id)); }
          catch (err) { toast.error(errorMessage(err)); }
          finally { setRemoving(null); }
        }}
        onCancel={() => setRemoving(null)}
      />
    </SettingsPage>
  );
}
