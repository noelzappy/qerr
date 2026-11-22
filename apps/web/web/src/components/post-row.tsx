// One post in a list (Home's "Up next", Publish's list view), on one line where there is room: the picture, its title, when it
// goes out, where it stands (the step, and the problem only when there is one) and the networks. Rows sit in a PostRows box.
import type React from 'react';
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
      title={post.batch.title}
      className={cn('group flex items-center gap-3 px-3 py-2 outline-none transition-colors hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50', className)}
    >
      {post.thumbnailUrl
        ? <img src={post.thumbnailUrl} alt="" className="size-9 shrink-0 rounded-md object-cover" loading="lazy" />
        : <div className="size-9 shrink-0 rounded-md bg-muted" aria-hidden="true" />}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{post.title || post.caption}</span>
        <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 sm:shrink-0 sm:flex-nowrap">
          <span className="whitespace-nowrap text-[12.5px] tabular-nums text-muted-foreground">{showDate ? `${dayLabel(post.date)}, ` : ''}{post.time}</span>
          <ToneBadge tone={STEP_TONE[flow.step]} dot>
            <span className="sr-only">Step {flow.stepIndex + 1} of 5: </span>{STEP_LABEL[flow.step]}
          </ToneBadge>
          {problem && <ToneBadge tone={problem.tone} className="whitespace-nowrap">{problem.label}</ToneBadge>}
        </span>
      </span>
      <span className="flex shrink-0 -space-x-1 max-sm:hidden" aria-label={post.networks.map(networkLabel).join(', ')}>
        {post.networks.map((n) => <NetworkIcon key={n} network={n} className="size-4 rounded-[4px] ring-2 ring-card" />)}
      </span>
    </Link>
  );
}

// The box a list of rows sits in: one border, hairlines between the rows.
export function PostRows({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('flex flex-col divide-y overflow-hidden rounded-lg border bg-card', className)}>{children}</div>;
}
