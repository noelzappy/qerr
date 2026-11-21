// The side sheet for one post: words, per-network captions, date and time, networks and the design. Also used to add a post.
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api } from '../../api';
import { errorMessage, fieldErrors } from '../../lib/errors';
import { networkLabel } from '../../lib/labels';
import { toast } from 'sonner';
import { FormPanel } from '@/components/form-panel';
import { Notice } from '@/components/notice';
import { TextField } from '@/components/text-field';
import { cn } from '@/lib/utils';
import { DesignFields } from './DesignFields';
import { BusyButton, CheckField, FieldSet, FormProblem, TextAreaField } from './parts';
import { CAPTION_LIMIT, NETWORKS, type Network } from './labels';
import { buildNetworks, currentCaptions, currentFlags, readNetworks } from './networks';
import type { DesignBlock, PostDetail } from './types';
import { charCount, detailLines } from './util';

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
  return (
    <FormPanel
      open={open}
      onClose={onClose}
      busy={busy}
      size="lg"
      title={detail ? 'Edit this post' : 'Add a post'}
      description={detail ? `${detail.post.postKey}. Times are in ${props.batch.timezone}.` : `The new post is a draft. Times are in ${props.batch.timezone}.`}
      footer={(
        <>
          <BusyButton variant="outline" onClick={onClose} disabled={busy}>Cancel</BusyButton>
          <BusyButton type="submit" form="post-edit-form" loading={busy}>{detail ? 'Save changes' : 'Add post'}</BusyButton>
        </>
      )}
    >
      <EditForm {...props} onBusy={setBusy} />
    </FormPanel>
  );
}

function Counter({ value, limit }: { value: string; limit: number }) {
  const n = charCount(value);
  const over = n > limit;
  return <span className={cn('whitespace-nowrap font-mono text-xs text-muted-foreground', over && 'font-semibold text-destructive', !over && n > limit * 0.9 && 'text-warning-foreground')}>{n} / {limit}{over ? `, ${n - limit} over` : ''}</span>;
}

function EditForm({ onClose, batch, detail, onSaved, onBusy }: Props & { onBusy: (busy: boolean) => void }) {
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
  const [busy, setBusy] = useState(false);
  useEffect(() => { onBusy(busy); }, [busy, onBusy]);
  useEffect(() => () => onBusy(false), [onBusy]);
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
    if (jsonError) problems.design = 'Fix the design JSON first';
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
        onSaved(next);
      } else {
        await api.post(`/api/batches/${batch.id}/posts`, {
          posts: [{ title: title.trim(), caption, date, time, networks, ...(design ? { design } : {}) }],
        });
        toast.success('Post added as a draft');
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
          Changing its words, date, time, networks or design takes the approval back, so it goes to draft and needs approving again. Changing only the title does not.
        </Notice>
      )}
      <FormProblem error={error} lines={lines} />
      <TextField label="Title" hint="A label for the team. It is not published." value={title} maxLength={200} error={fields.title} onChange={(e) => setTitle(e.target.value)} />
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <TextField label="Date" type="date" value={date} error={fields.date} onChange={(e) => setDate(e.target.value)} />
        <TextField label="Time" type="time" value={time} error={fields.time} hint={`In ${batch.timezone}.`} onChange={(e) => setTime(e.target.value)} />
      </div>
      <FieldSet legend="Networks" error={fields.networks}>
        {NETWORKS.map((n) => <CheckField key={n} label={networkLabel(n)} checked={!!on[n]} onCheckedChange={(c) => setOn({ ...on, [n]: c })} />)}
      </FieldSet>
      <div className="flex flex-col gap-2">
        <TextAreaField label="Main caption" rows={6} value={caption} error={fields.caption} onChange={(e) => setCaption(e.target.value)} hint="Used on every network that has no caption of its own below." />
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {NETWORKS.filter((n) => on[n]).map((n) => (
            <span key={n} className="text-sm">{networkLabel(n)} <Counter value={caps[n]?.trim() ? caps[n]! : caption} limit={CAPTION_LIMIT[n as Network]} /></span>
          ))}
        </div>
      </div>
      <section className="border-t pt-4" aria-labelledby="single-captions">
        <h3 id="single-captions" className="mb-1 text-base font-semibold">Captions for single networks</h3>
        <p className="mb-3 text-sm text-muted-foreground">Leave a box empty to use the main caption.</p>
        <div className="flex flex-col gap-4">
          {NETWORKS.map((n) => (
            <div key={n} className="flex flex-col gap-1.5">
              <TextAreaField
                label={<>{networkLabel(n)}{!on[n] && <span className="font-normal text-muted-foreground"> (not sent here)</span>}</>} optional rows={3} value={caps[n] ?? ''}
                onChange={(e) => setCaps({ ...caps, [n]: e.target.value })}
              />
              {(caps[n] ?? '').trim() !== '' && <Counter value={caps[n]!} limit={CAPTION_LIMIT[n]} />}
            </div>
          ))}
        </div>
      </section>
      <section className="border-t pt-4" aria-labelledby="design-heading">
        <h3 id="design-heading" className="mb-3 text-base font-semibold">Design</h3>
        <DesignFields design={design} jsonError={jsonError} onChange={(d, err) => { setDesign(d); setJsonError(err); }} />
        {fields.design && <p className="mt-2 text-[13px] font-medium text-destructive" role="alert">{fields.design}</p>}
      </section>
    </form>
  );
}
