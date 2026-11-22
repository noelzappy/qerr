// The pieces a post shows in more than one place (its card in the batch, its own page, a row on Home): one status chip, at
// most one problem chip, the network icons, and the actions on a post with their confirms. Everything shown is untrusted text and
// is only ever rendered as text.
import { useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { api } from '../../api';
import { errorMessage, failureLine, tidyBlocker } from '../../lib/errors';
import { networkLabel } from '../../lib/labels';
import { ConfirmAction, ToneBadge, type Tone } from '@/components/kit';
import { NetworkIcon } from '@/components/network-icon';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { FLAG_LABEL, FLAG_TONE, STEP_LABEL, STEP_TONE, type PostFlag, type PostFlow } from './flow/status';
import { NETWORKS } from './labels';
import type { MediaView, PostDetail, PostView } from './types';
import { detailLines, MAX_UPLOAD } from './util';

export const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime';

export function mediaLabel(m: MediaView, all: MediaView[]): string {
  const sameSize = all.filter((x) => x.source === m.source && x.renderSize === m.renderSize);
  if (m.source === 'upload') return `Uploaded: ${m.rel}`;
  const where = m.renderSize ? `${m.renderSize}` : 'image';
  return sameSize.length > 1 && typeof m.slide === 'number' ? `${where}, page ${m.slide + 1} of ${sameSize.length}` : where;
}

// ---- the one problem a post shows ----

export interface PostProblem {
  label: string;
  tone: Tone;
  // What stops approval, then what is worth a look (the render failure first).
  blockers: string[];
  notes: string[];
}

// Worst first. A post shows one problem chip, and its popover lists everything.
const FLAG_ORDER: PostFlag[] = ['render_failed', 'failed', 'needs_look', 'deleted', 'warnings'];
export const NO_SOURCES = 'No sources linked. Every claim should link to a fact.';

// The approval check's words for a render that has not finished yet (services/approval.ts).
export const onlyWaitingForImage = (blockers: string[]) => blockers.length > 0 && blockers.every((b) => b.startsWith('The images are not ready yet'));

export function postProblem(flow: PostFlow, d?: { blockers?: string[]; warnings?: string[]; renderError?: string | null; noSources?: boolean }): PostProblem | null {
  const blockers = (d?.blockers ?? []).map(tidyBlocker);
  // The approval check already says the image failed; do not say it twice.
  const imageInBlockers = blockers.some((b) => b.startsWith('The image could not be made'));
  const notes = [
    ...(flow.flags.includes('render_failed') && !imageInBlockers ? [`The image could not be made: ${failureLine(d?.renderError)}`] : []),
    ...(d?.warnings ?? []),
    ...(d?.noSources ? [NO_SOURCES] : []),
  ];
  const flag = FLAG_ORDER.find((f) => flow.flags.includes(f));
  if (flag) return { label: FLAG_LABEL[flag], tone: FLAG_TONE[flag], blockers, notes };
  // A post whose only hold-up is an image still being made is waiting, not broken.
  if (onlyWaitingForImage(blockers)) return { label: 'Image on its way', tone: 'info', blockers, notes };
  if (blockers.length) return { label: 'Needs fixing', tone: 'bad', blockers, notes };
  if (notes.length) return { label: FLAG_LABEL.warnings, tone: 'warn', blockers, notes };
  return null;
}

// The status chip (one of the five steps) and, only when there is one, the problem chip with its list in a popover.
export function PostChips({ flow, problem, className }: { flow: PostFlow; problem: PostProblem | null; className?: string }) {
  const lines = problem ? [...problem.blockers, ...problem.notes] : [];
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1', className)}>
      <ToneBadge tone={STEP_TONE[flow.step]} dot>
        <span className="sr-only">Step {flow.stepIndex + 1} of 5: </span>{STEP_LABEL[flow.step]}
      </ToneBadge>
      {problem && (lines.length > 0 ? (
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" aria-label={`${problem.label}: show details`} className="rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:min-h-8">
              <ToneBadge tone={problem.tone} className="cursor-pointer whitespace-nowrap">{problem.label}</ToneBadge>
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] text-[13px]">
            {problem.blockers.length > 0 && (
              <div>
                <p className="mb-1 font-semibold">Fix this before the post can be approved</p>
                <ul className="list-disc space-y-1 pl-[18px]">{problem.blockers.map((b) => <li key={b} className="[overflow-wrap:anywhere]">{b}</li>)}</ul>
              </div>
            )}
            {problem.notes.length > 0 && (
              <div className={problem.blockers.length ? 'mt-3' : undefined}>
                <p className="mb-1 font-semibold">Worth a look</p>
                <ul className="list-disc space-y-1 pl-[18px]">{problem.notes.map((n, i) => <li key={i} className="[overflow-wrap:anywhere]">{n}</li>)}</ul>
              </div>
            )}
          </PopoverContent>
        </Popover>
      ) : <ToneBadge tone={problem.tone} className="whitespace-nowrap">{problem.label}</ToneBadge>)}
    </div>
  );
}

// Small network icons in a row; a network the post does not go to is greyed, or left out when `only` lists the ones to show.
export function NetworkRow({ on, only, className }: { on: (n: string) => boolean; only?: readonly string[]; className?: string }) {
  const shown = only ?? NETWORKS;
  if (only && only.length === 0) return <span className="text-[12px] text-muted-foreground">No networks</span>;
  return (
    <ul className={cn('flex items-center', only ? 'gap-1' : 'gap-1.5', className)} aria-label="Networks">
      {shown.map((n) => {
        const yes = on(n);
        return (
          <li key={n} role="img" aria-label={yes ? networkLabel(n) : `${networkLabel(n)}, not sent here`} className={cn('flex', !yes && 'opacity-30 grayscale')}>
            <NetworkIcon network={n} className={cn('rounded-[4px]', only ? 'size-4' : 'size-[18px]')} />
          </li>
        );
      })}
    </ul>
  );
}

// ---- the actions on a post ----

interface ActionsOptions {
  post: PostView | undefined;
  reload: () => Promise<unknown>;
  apply: (next: PostDetail) => void;
  // The batch changed (an image was started, a post was removed): lists fetch again.
  onChanged: () => void;
  // After a post is removed; the card just lets the list refresh, the page goes back to the batch.
  onRemoved?: () => void;
}

export function usePostActions({ post, reload, apply, onChanged, onRemoved }: ActionsOptions) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [errorLines, setErrorLines] = useState<string[]>([]);
  const [removing, setRemoving] = useState(false);
  const [dropping, setDropping] = useState<MediaView | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function run<T>(name: string, work: () => Promise<T>): Promise<T | undefined> {
    setBusy(name);
    setError('');
    setErrorLines([]);
    try {
      return await work();
    } catch (err) {
      setError(errorMessage(err));
      setErrorLines(detailLines(err));
      // A refused approval carries its reasons in the post; read them again so they show.
      void reload();
      return undefined;
    } finally {
      setBusy('');
    }
  }
  const fail = (message: string) => { setError(message); setErrorLines([]); };

  async function approve() {
    if (!post) return;
    const r = await run('approve', () => api.post<PostDetail>(`/api/posts/${post.id}/approve`));
    if (r) { apply(r); toast.success('Post approved'); }
  }
  async function unapprove() {
    if (!post) return;
    const r = await run('approve', () => api.post<PostDetail>(`/api/posts/${post.id}/unapprove`));
    if (r) { apply(r); toast.success('Approval taken off'); }
  }
  async function rerender() {
    if (!post) return;
    const r = await run('render', () => api.post<{ post: PostDetail['post'] }>(`/api/posts/${post.id}/render`));
    if (r) { toast.success('Making the image'); await reload(); onChanged(); }
  }
  async function upload(file: File | undefined) {
    if (!post || !file) return;
    if (fileRef.current) fileRef.current.value = '';
    if (file.size > MAX_UPLOAD) { fail('That file is larger than 25 MB.'); return; }
    const form = new FormData();
    form.append('file', file);
    const r = await run('upload', () => api.upload<PostDetail>(`/api/posts/${post.id}/media`, form));
    if (r) { apply(r); toast.success('File uploaded'); }
  }
  async function confirmRemove() {
    if (!post) return;
    const r = await api.delete<{ inBuffer?: boolean }>(`/api/posts/${post.id}`);
    setRemoving(false);
    if (r.inBuffer) toast.error('Removed here, but this post is already in Buffer. Delete it there from step 3 or 4 of the batch');
    else toast.success('Post removed. You can restore it from the list of removed posts');
    (onRemoved ?? onChanged)();
  }
  async function confirmDropMedia() {
    if (!post || !dropping) return;
    const next = await api.delete<PostDetail>(`/api/posts/${post.id}/media/${encodeURIComponent(dropping.rel)}`);
    setDropping(null);
    apply(next);
    toast.success('File removed');
  }

  return { busy, error, errorLines, fail, approve, unapprove, rerender, upload, fileRef, removing, setRemoving, dropping, setDropping, confirmRemove, confirmDropMedia };
}

export type PostActions = ReturnType<typeof usePostActions>;

// The hidden file input the "Upload a file" action clicks.
export function UploadInput({ a, title }: { a: PostActions; title: string }) {
  return <input ref={a.fileRef} type="file" accept={ACCEPT} tabIndex={-1} aria-label={`Upload a picture or video for ${title}`} className="sr-only" onChange={(e) => void a.upload(e.target.files?.[0])} />;
}

// The two confirms: removing the post, and removing one uploaded file.
export function PostConfirms({ a, title }: { a: PostActions; title: string }): ReactNode {
  return (
    <>
      <ConfirmAction
        open={a.removing}
        title="Remove this post?"
        message={<>"{title}" leaves the batch's review list and is not sent. It stays in the batch under removed posts, and you can restore it.</>}
        confirmLabel="Remove post"
        danger
        onConfirm={a.confirmRemove}
        onCancel={() => a.setRemoving(false)}
      />
      <ConfirmAction
        open={!!a.dropping}
        title="Remove this file?"
        message={<>{a.dropping?.rel} will no longer go out with "{title}". The post goes back to Writing if it was approved.</>}
        confirmLabel="Remove file"
        danger
        onConfirm={a.confirmDropMedia}
        onCancel={() => a.setDropping(null)}
      />
    </>
  );
}
