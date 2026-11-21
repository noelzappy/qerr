// The side sheet for one post: words, per-network captions, date and time, networks and the design. Also used to add a post.
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api } from '../../api';
import { errorMessage, fieldErrors } from '../../lib/errors';
import { networkLabel } from '../../lib/labels';
import { toast } from 'sonner';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { BusyButton, CheckField, FieldSet, FormProblem, Notice, TextField } from '@/components/kit';
import { DesignFields } from './DesignFields';
import { CaptionFields } from './editor/CaptionFields';
import { EditorPanel } from './editor/EditorPanel';
import { PreviewPane } from './editor/PreviewPane';
import { usePreview } from './editor/usePreview';
import { confirmDiscard, useUnsavedGuard } from '@/hooks/use-unsaved-guard';
import { NETWORKS } from './labels';
import { buildNetworks, currentCaptions, currentFlags, readNetworks } from './networks';
import type { DesignBlock, PostDetail } from './types';
import { detailLines } from './util';

interface BatchBits { id: string; timezone: string; defaultTime: string; defaultNetworks: string[] }

interface Props {
  open: boolean;
  onClose: () => void;
  batch: BatchBits;
  // Present when editing; absent when adding a post.
  detail?: PostDetail | null;
  onSaved: (detail: PostDetail | null) => void;
}

export function PostEditSheet(props: Props) {
  const { open, onClose, detail } = props;
  // The save button is in the panel's pinned footer, so the form tells the panel when it is busy.
  const [busy, setBusy] = useState(false);
  // The form tells us whether it holds edits that are not saved; every way of closing asks first when it does.
  const [dirty, setDirty] = useState(false);
  useUnsavedGuard(open && dirty);
  const askClose = () => confirmDiscard(dirty, onClose);
  return (
    <EditorPanel
      open={open}
      onClose={askClose}
      busy={busy}
      title={detail ? 'Edit this post' : 'Add a post'}
      description={detail ? `${detail.post.postKey}. Times are in ${props.batch.timezone}.` : `The new post starts as Writing. Times are in ${props.batch.timezone}.`}
      footer={(
        <>
          <BusyButton variant="outline" onClick={askClose} disabled={busy}>Cancel</BusyButton>
          <BusyButton type="submit" form="post-edit-form" loading={busy}>{detail ? 'Save changes' : 'Add post'}</BusyButton>
        </>
      )}
    >
      <EditForm {...props} onBusy={setBusy} onDirty={setDirty} />
    </EditorPanel>
  );
}

function EditForm({ onClose, batch, detail, onSaved, onBusy, onDirty }: Props & { onBusy: (busy: boolean) => void; onDirty: (dirty: boolean) => void }) {
  const post = detail?.post ?? null;
  const base = useMemo(() => readNetworks(post?.networks), [post]);
  const initial = useMemo(() => ({
    title: post?.title ?? '', caption: post?.caption ?? '', date: post?.date ?? '', time: post?.time ?? batch.defaultTime,
    on: post ? currentFlags(base, batch.defaultNetworks) : Object.fromEntries(NETWORKS.map((n) => [n, batch.defaultNetworks.includes(n)])) as Record<string, boolean>,
    caps: currentCaptions(base),
    design: post?.design ?? null,
  }), [post, base, batch]);

  const [title, setTitle] = useState(initial.title);
  const [caption, setCaption] = useState(initial.caption);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [on, setOn] = useState(initial.on);
  const [caps, setCaps] = useState(initial.caps);
  const [design, setDesign] = useState<DesignBlock | null>(initial.design);
  const [jsonError, setJsonError] = useState('');
  const [showPreview, setShowPreview] = useState(true);
  const preview = usePreview(design, !!jsonError);
  const [busy, setBusy] = useState(false);
  useEffect(() => { onBusy(busy); }, [busy, onBusy]);
  useEffect(() => () => onBusy(false), [onBusy]);
  // Edits not saved yet: any field that differs from what the form opened with. Cleared once a save has gone through.
  const [saved, setSaved] = useState(false);
  const dirty = !saved && (
    title !== initial.title || caption !== initial.caption || date !== initial.date || time !== initial.time
    || JSON.stringify(on) !== JSON.stringify(initial.on) || JSON.stringify(caps) !== JSON.stringify(initial.caps)
    || JSON.stringify(design) !== JSON.stringify(initial.design)
  );
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  useEffect(() => () => onDirty(false), [onDirty]);
  const [error, setError] = useState('');
  const [lines, setLines] = useState<string[]>([]);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problems: Record<string, string> = {};
    if (!title.trim()) problems.title = 'Give the post a title';
    if (!caption.trim()) problems.caption = 'Write the main caption';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) problems.date = 'Choose a date';
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) problems.time = 'Choose a time';
    if (!NETWORKS.some((n) => on[n])) problems.networks = 'Choose at least one network';
    if (jsonError) problems.design = 'Fix the advanced design JSON first';
    setFields(problems);
    setLines([]);
    if (Object.keys(problems).length) { setError('Check the highlighted fields and try again.'); return; }
    setBusy(true);
    setError('');
    const networks = buildNetworks(base, on, caps, batch.defaultNetworks);
    try {
      if (post) {
        const body: Record<string, unknown> = {};
        if (title.trim() !== initial.title) body.title = title.trim();
        if (caption !== initial.caption) body.caption = caption;
        if (date !== initial.date) body.date = date;
        if (time !== initial.time) body.time = time;
        if (JSON.stringify(networks) !== JSON.stringify(buildNetworks(base, initial.on, initial.caps, batch.defaultNetworks))) body.networks = networks;
        if (JSON.stringify(design) !== JSON.stringify(initial.design)) body.design = design;
        if (!Object.keys(body).length) { toast.success('Nothing was changed'); onClose(); return; }
        const next = await api.patch<PostDetail>(`/api/posts/${post.id}`, body);
        const reset = post.status === 'approved' && next.post.status !== 'approved';
        toast.success(reset ? 'Post saved. Its approval was taken back: approve it again when you are happy' : 'Post saved');
        setSaved(true);
        onSaved(next);
      } else {
        await api.post(`/api/batches/${batch.id}/posts`, {
          posts: [{ title: title.trim(), caption, date, time, networks, ...(design ? { design } : {}) }],
        });
        toast.success('Post added. It starts as Writing');
        setSaved(true);
        onSaved(null);
      }
      onClose();
    } catch (err) {
      setFields(fieldErrors(err));
      setLines(detailLines(err));
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form id="post-edit-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)} noValidate>
      {post?.status === 'approved' && (
        <Notice tone="warn" title="This post is approved.">
          Changing its words, date, time, networks or design takes the approval back, so it goes back to Writing and needs approving again. Changing only the title does not.
        </Notice>
      )}
      <FormProblem error={error} lines={lines} />
      <div className="grid grid-cols-1 gap-x-8 gap-y-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <div className="flex min-w-0 flex-col gap-4 lg:col-start-1 lg:row-start-1">
          <TextField label="Title" hint="A label for the team. It is not published." value={title} maxLength={200} error={fields.title} onChange={(e) => setTitle(e.target.value)} />
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <TextField label="Date" type="date" value={date} error={fields.date} onChange={(e) => setDate(e.target.value)} />
            <TextField label="Time" type="time" value={time} error={fields.time} hint={`In ${batch.timezone}.`} onChange={(e) => setTime(e.target.value)} />
          </div>
          <FieldSet legend="Networks" error={fields.networks}>
            {NETWORKS.map((n) => <CheckField key={n} label={networkLabel(n)} checked={!!on[n]} onCheckedChange={(c) => setOn({ ...on, [n]: c })} />)}
          </FieldSet>
          <CaptionFields caption={caption} onCaption={setCaption} caps={caps} onCaps={setCaps} on={on} error={fields.caption} />
        </div>
        <aside className="min-w-0 border-t pt-4 lg:sticky lg:top-0 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start lg:border-t-0 lg:pt-0" aria-label="Preview of the designed image">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-base font-semibold">Preview</h3>
            <button
              type="button"
              aria-expanded={showPreview}
              aria-controls="post-preview"
              onClick={() => setShowPreview(!showPreview)}
              className="inline-flex min-h-8 items-center gap-1 rounded-md px-1 text-sm font-medium outline-none hover:text-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:min-h-11 lg:hidden"
            >
              {showPreview ? <ChevronDown className="size-4" aria-hidden="true" /> : <ChevronRight className="size-4" aria-hidden="true" />}
              {showPreview ? 'Hide preview' : 'Show preview'}
            </button>
          </div>
          <div id="post-preview" className={showPreview ? undefined : 'max-lg:hidden'}>
            <PreviewPane design={design} preview={preview} />
          </div>
        </aside>
        <section className="min-w-0 border-t pt-4 lg:col-start-1 lg:row-start-2" aria-labelledby="design-heading">
          <h3 id="design-heading" className="mb-3 text-base font-semibold">Design</h3>
          <DesignFields design={design} jsonError={jsonError} onChange={(d, err) => { setDesign(d); setJsonError(err); }} />
          {fields.design && <p className="mt-2 text-[13px] font-medium text-destructive" role="alert">{fields.design}</p>}
        </section>
      </div>
    </form>
  );
}
