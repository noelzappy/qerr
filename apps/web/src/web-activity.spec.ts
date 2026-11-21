// The batch page's list of failed jobs (web/src/lib/activity.ts), a plain function of the runs.
import { describe, expect, it } from 'vitest';
import { recentFailures, runTitle, type ActivityRun } from '../web/src/lib/activity';

const NOW = Date.parse('2027-06-01T10:00:00Z');
const run = (id: string, kind: string, status: string, minutesAgo: number, postId: string | null = 'p1') => ({
  id, kind, status, postId, createdAt: new Date(NOW - minutesAgo * 60_000).toISOString(), finishedAt: new Date(NOW - minutesAgo * 60_000 + 1000).toISOString(),
}) as unknown as ActivityRun;

describe('recentFailures', () => {
  it('lists a recent failed render until the same post is rendered again', () => {
    const failed = run('a', 'render-post', 'failed', 5);
    expect(recentFailures([failed], NOW).map((r) => r.id)).toEqual(['a']);
    expect(recentFailures([failed, run('b', 'render-post', 'done', 2)], NOW)).toEqual([]);
    // Another post's render does not hide it.
    expect(recentFailures([failed, run('c', 'render-post', 'done', 2, 'p2')], NOW).map((r) => r.id)).toEqual(['a']);
  });

  it('drops failures older than ten minutes and a failed send once the batch is sent again', () => {
    expect(recentFailures([run('a', 'render-post', 'failed', 30)], NOW)).toEqual([]);
    expect(recentFailures([run('s1', 'send-batch', 'failed', 5, null), run('s2', 'send-batch', 'running', 1, null)], NOW)).toEqual([]);
    expect(recentFailures([run('x', 'draft-batch', 'failed', 1, null)], NOW)).toEqual([]);
  });
});

describe('runTitle', () => {
  it('shows an image run as "Image: ..." and leaves other titles alone', () => {
    expect(runTitle('Render: Layout billboard')).toBe('Image: Layout billboard');
    expect(runTitle('Send: June batch')).toBe('Send: June batch');
    expect(runTitle('A Render: in the middle')).toBe('A Render: in the middle');
  });
});
