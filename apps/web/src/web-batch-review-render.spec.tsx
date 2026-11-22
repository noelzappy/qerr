// Parts of the batch page drawn as static markup (no browser): the selection box of a post card sits with the card's actions,
// never over its picture, and the AI-draft note is one line with one "Details" toggle, closed at first. How they behave under the
// pointer was not run here.
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AiDraftCard } from '../web/src/pages/BatchReview';
import { PostCard } from '../web/src/pages/batches/PostCard';
import type { BatchView, PostSummary } from '../web/src/pages/batches/types';

const batch: BatchView = {
  id: 'b1', name: 'b', title: 'December', timezone: 'Europe/Dublin', defaultTime: '09:00', defaultNetworks: ['instagram'], periodStart: null, periodEnd: null,
  status: 'draft' as BatchView['status'], ownerId: 'u', owner: null, counts: {}, createdAt: '', updatedAt: '',
};
const summary: PostSummary = {
  id: 'p1', postKey: 'k', position: 0, title: 'The shared pot', date: '2026-12-16', time: '09:00', caption: 'Every member sees the pot.',
  status: 'draft' as PostSummary['status'], renderStatus: 'ok' as PostSummary['renderStatus'], warningCount: 0, hasDesign: true, mediaCount: 1, thumbnailUrl: null,
};
const draw = (node: React.ReactNode) => renderToString(<MemoryRouter><TooltipProvider>{node}</TooltipProvider></MemoryRouter>);

describe('a post card', () => {
  it('keeps the selection box in the title row, out of the picture', () => {
    const html = draw(<PostCard summary={summary} batch={batch} version={0} onChanged={() => {}} select={{ selected: false, onToggle: () => {} }} />);
    const box = html.indexOf('aria-label="Select The shared pot"');
    expect(box).toBeGreaterThan(-1);
    expect(box).toBeGreaterThan(html.indexOf('<h3'));
    // the thumbnail holds no checkbox
    const thumb = html.slice(html.indexOf('bg-muted sm:w-28'), html.indexOf('<h3'));
    expect(thumb).not.toContain('role="checkbox"');
  });
});

describe('the AI-draft note', () => {
  const notes = { requested: 7, delivered: 7, model: 'm', promptVersion: 'v7', rejected: [{ id: '03', reasons: ['too long'] }], messages: ['One picture was chosen from the vault.'] };
  it('is one line with one closed Details toggle, and no bare "Why"', () => {
    const html = draw(<AiDraftCard notes={notes} />);
    expect(html).toContain('Written by AI.');
    expect(html).toContain('7 of 7 posts drafted.');
    expect(html.match(/aria-expanded="false"/g)?.length).toBe(1);
    expect(html).toContain('Details');
    expect(html).not.toMatch(/>Why</);
    expect(html).not.toContain('too long');
    expect(html).not.toContain('<summary');
  });
  it('has no toggle when there is nothing more to say', () => {
    const html = draw(<AiDraftCard notes={{ requested: 2, delivered: 2 }} />);
    expect(html).not.toContain('aria-expanded');
  });
});
