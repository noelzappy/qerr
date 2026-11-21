// One post in a list (Home's "Up next", Publish's list view): the channels, when it goes out, the caption and the picture.
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { networkLabel } from '../lib/labels';
import { flowOfPost, type OverviewPost } from '../lib/overview';
import { PostStepper } from '../pages/batches/flow/PostStepper';
import { NetworkIcon } from './network-icon';

const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
export const dayLabel = (iso: string) => dayFmt.format(new Date(`${iso}T00:00:00Z`));

export function PostRow({ post, className, showDate = true }: { post: OverviewPost; className?: string; showDate?: boolean }) {
  const flow = flowOfPost(post);
  return (
    <Link
      to={`/batches/${post.batch.id}?post=${encodeURIComponent(post.id)}`}
      className={cn('group flex gap-4 rounded-lg border bg-card p-3.5 outline-none transition-colors hover:border-foreground/20 focus-visible:ring-[3px] focus-visible:ring-ring/50', className)}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground">
          <span className="flex -space-x-1" aria-label={post.networks.map(networkLabel).join(', ')}>
            {post.networks.map((n) => <NetworkIcon key={n} network={n} className="ring-2 ring-card" />)}
          </span>
          <span className="tabular-nums">{showDate ? `${dayLabel(post.date)}, ` : ''}{post.time}</span>
          <span className="truncate">{post.batch.title}</span>
        </div>
        <PostStepper flow={flow} compact className="mt-1.5" />
        <p className="mt-1.5 line-clamp-3 text-[13.5px] leading-relaxed text-foreground [overflow-wrap:anywhere]">{post.caption || <span className="text-muted-foreground">{post.title}</span>}</p>
      </div>
      {post.thumbnailUrl
        ? <img src={post.thumbnailUrl} alt="" className="size-16 shrink-0 rounded-md border object-cover" loading="lazy" />
        : post.hasDesign ? <div className="size-16 shrink-0 rounded-md border bg-muted" aria-hidden="true" /> : null}
    </Link>
  );
}
