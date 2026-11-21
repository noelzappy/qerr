// Plain-words labels for batch, post, render and delivery states, and the fixed facts about each network.
import type { Tone } from '@/components/kit';
import { BATCH_STATUS_LABEL, deliveryStep, FLAG_LABEL, FLAG_TONE, IMAGE_LABEL, STEP_HELP, STEP_LABEL, STEP_TONE } from './flow/status';
import type { BatchStatus, DeliveryRow, PostStatus, RenderStatus } from './types';

export const NETWORKS = ['instagram', 'linkedin', 'facebook', 'x'] as const;
export type Network = (typeof NETWORKS)[number];

// Caption limits the networks themselves enforce.
export const CAPTION_LIMIT: Record<Network, number> = { instagram: 2200, linkedin: 3000, facebook: 63206, x: 280 };

// All of these read from the one status vocabulary in flow/status.ts.
export const BATCH_STATUS: Record<BatchStatus, { tone: Tone; label: string }> = BATCH_STATUS_LABEL;

export const POST_STATUS: Record<PostStatus, { tone: Tone; label: string }> = {
  draft: { tone: STEP_TONE.writing, label: STEP_LABEL.writing },
  approved: { tone: STEP_TONE.approved, label: STEP_LABEL.approved },
  removed: { tone: FLAG_TONE.removed, label: FLAG_LABEL.removed },
};

export const RENDER_STATUS: Record<RenderStatus, { tone: Tone; label: string }> = IMAGE_LABEL as Record<RenderStatus, { tone: Tone; label: string }>;

export const POST_FILTERS = [
  { value: '', label: 'All posts' },
  { value: 'draft', label: STEP_LABEL.writing },
  { value: 'approved', label: STEP_LABEL.approved },
  { value: 'render-failed', label: FLAG_LABEL.render_failed },
  { value: 'warnings', label: 'Has warnings' },
];

// Every layout a post's design may use, as the design engine names them (packages/engine/lib/design/builtin-layouts.mjs, plus
// the carousel). The page cover is not here: it is made for a profile, never inside a batch.
export const TEMPLATES: Array<{ value: string; label: string }> = [
  { value: 'object', label: 'Photo under a headline: A styled photograph under a big headline, with one phrase in the brand colour.' },
  { value: 'number', label: 'One big figure: One large figure with a line under it, and an optional photo.' },
  { value: 'product', label: 'Framed phone screen: A headline beside a phone screenshot that already has its phone frame.' },
  { value: 'myth-fact', label: 'Myth and fact: A myth on a dark colour panel and the fact on a pale one.' },
  { value: 'closing', label: 'Closing page: The last page: the tagline, large, on the dark page.' },
  { value: 'cover', label: 'Cover: The opening page: a photo, a headline and a sub line.' },
  { value: 'text', label: 'Text: A big headline on its own, or with a table or card under it.' },
  { value: 'ledger', label: 'Ledger table: A headline over a ruled table of up to 10 rows, with cells you can circle.' },
  { value: 'passbook', label: 'Passbook page: A ruled page of days with ticks, and an optional member card beside it.' },
  { value: 'stats', label: 'Figures: One big figure and up to three smaller figures side by side.' },
  { value: 'screen', label: 'App screen: A headline with a screenshot of the app, on a phone or in a window.' },
  { value: 'photo-story', label: 'Photo story: A photograph with a headline and sub line telling its story.' },
  { value: 'photo', label: 'Photo post: A full-page photograph with the headline over a dark fade.' },
  { value: 'carousel', label: 'Carousel of pages: Two to ten pages that are swiped through, with a PDF made from them.' },
];

export interface DeliveryState { tone: Tone; label: string; help: string; unknown: boolean }

// What a delivery means for a person, in words. An uncertain answer is never presented as success or failure.
export function deliveryState(d: Pick<DeliveryRow, 'status' | 'bufferStatus' | 'mode'>): DeliveryState {
  const { step, flag } = deliveryStep(d);
  if (flag === 'needs_look') {
    return {
      tone: FLAG_TONE.needs_look, label: FLAG_LABEL.needs_look, unknown: true,
      help: 'We could not tell whether this reached Buffer, so it is not counted as sent or as failed. Look for it in Buffer, then tell us what you found.',
    };
  }
  if (flag === 'failed') return { tone: FLAG_TONE.failed, label: FLAG_LABEL.failed, unknown: false, help: 'Buffer did not take this post. It can be sent again.' };
  if (flag === 'deleted') return { tone: FLAG_TONE.deleted, label: FLAG_LABEL.deleted, unknown: false, help: 'It is no longer in Buffer.' };
  const known = d.bufferStatus === 'sent' || d.bufferStatus === 'scheduled' || d.bufferStatus === 'draft';
  const s = step ?? 'draft_in_buffer';
  return { tone: STEP_TONE[s], label: STEP_LABEL[s], unknown: false, help: known ? STEP_HELP[s] : 'Buffer has it. The next status check will say more.' };
}
