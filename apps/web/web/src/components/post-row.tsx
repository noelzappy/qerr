// One post in a list (Home's "Up next", Publish's list view), on one line where there is room: when it goes out, its title,
// where it stands (the step, and the problem only when there is one), the networks and the picture.
import { Link } from 'react-router-dom';
import { ToneBadge } from '@/components/kit';
import { cn } from '@/lib/utils';
import { networkLabel } from '../lib/labels';
import { flowOfPost, type OverviewPost } from '../lib/overview';
import { STEP_LABEL, STEP_TONE } from '../pages/batches/flow/status';
import { postProblem } from '../pages/batches/post-parts';
import { NetworkIcon } from './network-icon';

const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
export const dayLabel = (iso: string) => dayFmt.format(new Date(`${iso}T00:00:00Z`));

export function PostRow({ post, className, showDate = true }: { post: OverviewPost; className?: string; showDate?: boolean }) {
  const flow = flowOfPost(post);
  const problem = postProblem(flow);
  return (
    <Link
      to={`/batches/${post.batch.id}?post=${encodeURIComponent(post.id)}`}
      className={cn('group flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-card px-3 py-2 outline-none transition-colors hover:border-foreground/20 focus-visible:ring-[3px] focus-visible:ring-ring/50', className)}
    >
      <span className="shrink-0 text-[12.5px] tabular-nums text-muted-foreground">{showDate ? `${dayLabel(post.date)}, ` : ''}{post.time}</span>
      <span className="flex min-w-0 flex-1 basis-40 items-baseline gap-2">
        <span className="truncate text-[13.5px] font-medium">{post.title || post.caption}</span>
        <span className="hidden min-w-0 shrink-[2] truncate text-[12.5px] text-muted-foreground lg:inline">{post.batch.title}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2.5">
        <ToneBadge tone={STEP_TONE[flow.step]} dot>
          <span className="sr-only">Step {flow.stepIndex + 1} of 5: </span>{STEP_LABEL[flow.step]}
        </ToneBadge>
        {problem && <ToneBadge tone={problem.tone} className="whitespace-nowrap">{problem.label}</ToneBadge>}
      </span>
      <span className="flex shrink-0 -space-x-1" aria-label={post.networks.map(networkLabel).join(', ')}>
        {post.networks.map((n) => <NetworkIcon key={n} network={n} className="size-[18px] rounded-[4px] ring-2 ring-card" />)}
      </span>
      {post.thumbnailUrl
        ? <img src={post.thumbnailUrl} alt="" className="size-9 shrink-0 rounded-md border object-cover" loading="lazy" />
        : post.hasDesign ? <div className="size-9 shrink-0 rounded-md border bg-muted" aria-hidden="true" /> : <div className="size-9 shrink-0 max-sm:hidden" aria-hidden="true" />}
    </Link>
  );
}
