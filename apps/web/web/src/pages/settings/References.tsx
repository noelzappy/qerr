// Settings, Design references: pictures the team likes (posts, posters, adverts, pages). The AI looks at each one and writes
// a style brief; drafts are given the briefs of the references that are switched on, so the images lean that way. People
// can read and rewrite a brief, switch a reference off, or ask the AI to look again. The AI also proposes concrete style settings
// (colours, type, surfaces, decoration, photo treatment); "Apply this look" shows them beside the brand as it is and saves them
// only when an admin accepts.
import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, Palette } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../api';
import { useDocumentTitle, useLoad } from '../../hooks';
import { errorMessage } from '../../lib/errors';
import { BusyButton, ConfirmAction, ErrorBlock, Hint, MoreMenu, Notice, SwitchField, TextField, ToneBadge, type MoreMenuItem } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { ApplyLook } from './ApplyLook';
import { ReferenceLayout } from './ReferenceLayout';
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
  const [error, setError] = useState('');
  const [applying, setApplying] = useState(false);
  const [composing, setComposing] = useState(false);
  useEffect(() => setBrief(r.brief ?? ''), [r.brief]);
  const working = r.status === 'pending' || r.status === 'analysing';
  async function patch(body: Record<string, unknown>, what: string) {
    setBusy(what); setError('');
    try { onChange((await api.patch<{ reference: DesignReference }>(`/api/settings/brand/references/${r.id}`, body)).reference); }
    catch (err) { setError(errorMessage(err)); }
    finally { setBusy(''); }
  }
  async function again() {
    setBusy('again'); setError('');
    try { onChange((await api.post<{ reference: DesignReference }>(`/api/settings/brand/references/${r.id}/analyse`)).reference); }
    catch (err) { setError(errorMessage(err)); }
    finally { setBusy(''); }
  }
  const menu: MoreMenuItem[] = [
    ...(r.status === 'ready' && r.analysis?.composition ? [{ label: 'Use this layout', onSelect: () => setComposing(true) }] : []),
    { label: busy === 'again' ? 'Describing...' : 'Describe again', disabled: working || busy === 'again', onSelect: () => void again() },
    { label: 'Remove', tone: 'danger' as const, onSelect: onRemove },
  ];
  const proposal = r.status === 'ready' && r.analysis?.proposal;
  const hasBrief = !!(r.brief || r.status === 'ready');
  return (
    <li className="flex min-w-0 flex-col gap-2.5 rounded-lg border bg-card p-3">
      {r.imageUrl ? <img src={r.imageUrl} alt={`Design reference ${r.fileName}`} className="aspect-[4/3] w-full rounded-md object-cover" loading="lazy" /> : <div className="aspect-[4/3] w-full rounded-md bg-muted" />}
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <ToneBadge tone={STATUS[r.status].tone} dot>{STATUS[r.status].label}</ToneBadge>
          <p className="truncate text-[12.5px] text-muted-foreground" title={r.note ? `${r.fileName} · "${r.note}"` : r.fileName}>{r.fileName}{r.note ? ` · "${r.note}"` : ''}</p>
        </div>
        <MoreMenu items={menu} />
      </div>
      {r.analysis && (
        <div className="flex items-center gap-2">
          <span className="flex shrink-0 -space-x-1" aria-label="Colours the AI saw">
            {r.analysis.palette.slice(0, 6).map((p) => <span key={p.hex + p.role} className="size-4 rounded-full border-2 border-card" style={{ background: p.hex }} title={`${p.hex} ${p.role}`} />)}
          </span>
          <p className="min-w-0 truncate text-[13px]" title={r.analysis.summary}>{r.analysis.summary || `Mood: ${r.analysis.mood}`}</p>
        </div>
      )}
      {error && <Notice tone="bad">{error}</Notice>}
      {working && <p className="flex items-center gap-2 text-[13px] text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden="true" /> The AI is describing the style. This takes a few seconds.</p>}
      {r.status === 'failed' && <Notice tone="bad">{r.error ?? 'The AI could not describe this picture.'} Check that an AI provider is set up for drafting and that its model can read images.</Notice>}
      {hasBrief && (
        <details className="group text-[13px]">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Brief</summary>
          <div className="mt-2 flex flex-col gap-2">
            <Textarea aria-label="Style brief the AI is given" rows={5} maxLength={2000} value={brief} onChange={(e) => setBrief(e.target.value)} className="text-[13px]" />
            {brief.trim() && brief !== (r.brief ?? '') && <div><BusyButton size="sm" variant="outline" loading={busy === 'brief'} onClick={() => void patch({ brief: brief.trim() }, 'brief')}>Save the brief</BusyButton></div>}
          </div>
        </details>
      )}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
        <SwitchField label="Drafts use it" hint="Turn off to stop drafts leaning towards this style" checked={r.enabled} disabled={busy === 'enabled'} onCheckedChange={(v) => void patch({ enabled: v }, 'enabled')} />
        {proposal
          ? <Button size="sm" onClick={() => setApplying(true)}><Palette aria-hidden="true" /> Apply this look</Button>
          : r.status === 'ready' && r.analysis && <Hint about="Apply this look">Describe it again to get style settings you can apply to your brand.</Hint>}
      </div>
      {r.analysis?.proposal && <ApplyLook reference={r} open={applying} onClose={() => setApplying(false)} />}
      {r.analysis?.composition && <ReferenceLayout reference={r} open={composing} onClose={() => setComposing(false)} />}
    </li>
  );
}

export function ReferencesPage() {
  useDocumentTitle('Design references');
  const list = useLoad(() => api.get<{ references: DesignReference[]; max: number }>('/api/settings/brand/references'), []);
  const [items, setItems] = useState<DesignReference[]>([]);
  const [note, setNote] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
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
    setUploading(true); setUploadError('');
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
      setUploadError(errorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  const max = list.data?.max ?? 24;
  const on = items.filter((r) => r.enabled && r.status === 'ready').length;
  return (
    <SettingsPage title="Design references" description="Pictures whose style you like. Drafts lean towards the ones switched on.">
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
        <TextField className="min-w-60 flex-1" label="What you like about it" optional value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="The calm layout and the big numbers"
          hint="JPEG, PNG, WebP or GIF. Large pictures are scaled down first. The AI describes each picture, and drafts are told to lean towards these styles alongside the visual direction in Brand and look." />
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => { if (e.target.files?.length) void upload(e.target.files); e.target.value = ''; }} />
        <BusyButton variant="outline" loading={uploading} disabled={items.length >= max} onClick={() => input.current?.click()}><ImagePlus aria-hidden="true" /> Upload pictures</BusyButton>
      </div>
      <p className="-mt-3 text-[12.5px] text-muted-foreground">{items.length} of {max} uploaded, {on} in use. Use pictures you may share with your AI provider.</p>
      {uploadError && <Notice tone="bad">{uploadError}</Notice>}
      {list.error ? <ErrorBlock message={list.error} onRetry={() => void list.reload()} />
        : list.loading && !list.data ? <Skeleton className="h-48 rounded-lg" />
        : items.length === 0 ? <p className="py-6 text-center text-[13.5px] text-muted-foreground">No design references yet.</p>
        : <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{items.map((r) => <ReferenceCard key={r.id} r={r} onChange={(n) => setItems((cur) => cur.map((x) => (x.id === n.id ? n : x)))} onRemove={() => setRemoving(r)} />)}</ul>}
      <ConfirmAction
        open={!!removing}
        title="Remove this design reference?"
        message="Drafts stop using its style brief. The picture is deleted."
        confirmLabel="Remove"
        danger
        onConfirm={async () => {
          if (!removing) return;
          // A failure is shown inside the dialog, which stays open.
          await api.delete(`/api/settings/brand/references/${removing.id}`);
          setItems((cur) => cur.filter((x) => x.id !== removing.id));
          setRemoving(null);
        }}
        onCancel={() => setRemoving(null)}
      />
    </SettingsPage>
  );
}
