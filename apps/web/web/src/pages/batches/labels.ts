// Plain-words labels for batch, post, render and delivery states, and the fixed facts about each network.
import type { Tone } from './parts';
import type { BatchStatus, DeliveryRow, PostStatus, RenderStatus } from './types';

export const NETWORKS = ['instagram', 'linkedin', 'facebook', 'x'] as const;
export type Network = (typeof NETWORKS)[number];

// Caption limits the networks themselves enforce.
export const CAPTION_LIMIT: Record<Network, number> = { instagram: 2200, linkedin: 3000, facebook: 63206, x: 280 };

export const BATCH_STATUS: Record<BatchStatus, { tone: Tone; label: string }> = {
  draft: { tone: 'quiet', label: 'Draft' },
  in_review: { tone: 'info', label: 'In review' },
  scheduled: { tone: 'good', label: 'Scheduled' },
  done: { tone: 'good', label: 'Done' },
};

export const POST_STATUS: Record<PostStatus, { tone: Tone; label: string }> = {
  draft: { tone: 'warn', label: 'Draft' },
  approved: { tone: 'good', label: 'Approved' },
  removed: { tone: 'quiet', label: 'Removed' },
};

export const RENDER_STATUS: Record<RenderStatus, { tone: Tone; label: string }> = {
  none: { tone: 'quiet', label: 'No design images' },
  queued: { tone: 'info', label: 'Waiting to render' },
  rendering: { tone: 'info', label: 'Rendering' },
  ok: { tone: 'good', label: 'Images ready' },
  failed: { tone: 'bad', label: 'Render failed' },
};

export const POST_FILTERS = [
  { value: '', label: 'All posts' },
  { value: 'draft', label: 'Draft' },
  { value: 'approved', label: 'Approved' },
  { value: 'render-failed', label: 'Render failed' },
  { value: 'warnings', label: 'Has warnings' },
];

export const TEMPLATES: Array<{ value: string; label: string }> = [
  { value: 'cover', label: 'Cover: photo, headline and sub line' },
  { value: 'text', label: 'Text: a headline, with or without an artefact' },
  { value: 'ledger', label: 'Ledger: a ruled table' },
  { value: 'passbook', label: 'Passbook: a ruled page of days' },
  { value: 'myth-fact', label: 'Myth and fact' },
  { value: 'stats', label: 'Stats: one big figure' },
  { value: 'screen', label: 'Screen: an app screenshot' },
  { value: 'photo-story', label: 'Photo story' },
  { value: 'closing', label: 'Closing page' },
  { value: 'carousel', label: 'Carousel of pages' },
  { value: 'photo', label: 'Photo post' },
  { value: 'page-cover', label: 'Page cover' },
];

export interface DeliveryState { tone: Tone; label: string; help: string; unknown: boolean }

// What a delivery means for a person, in words. An uncertain answer is never presented as success or failure.
export function deliveryState(d: Pick<DeliveryRow, 'status' | 'bufferStatus' | 'mode'>): DeliveryState {
  if (d.status === 'unknown' || d.bufferStatus === 'unknown') {
    return {
      tone: 'warn', label: 'Unknown, check Buffer', unknown: true,
      help: 'We could not tell whether this reached Buffer, so it is not counted as sent or as failed. Look for it in Buffer, then tell us what you found.',
    };
  }
  if (d.status === 'failed' || d.bufferStatus === 'failed') return { tone: 'bad', label: 'Failed', unknown: false, help: 'Buffer did not take this post. It can be sent again.' };
  if (d.status === 'deleted') return { tone: 'quiet', label: 'Deleted from Buffer', unknown: false, help: 'It is no longer in Buffer.' };
  if (d.bufferStatus === 'sent') return { tone: 'good', label: 'Sent', unknown: false, help: 'Buffer has published it.' };
  if (d.bufferStatus === 'scheduled') return { tone: 'good', label: 'Scheduled in Buffer', unknown: false, help: 'Buffer will publish it at the due time.' };
  if (d.bufferStatus === 'draft') return { tone: 'info', label: 'Draft in Buffer', unknown: false, help: 'It waits in Buffer as a draft. Nothing is published until it is scheduled live.' };
  return { tone: 'info', label: d.mode === 'live' ? 'Created in Buffer' : 'Created as a draft', unknown: false, help: 'Buffer has it. The next status check will say more.' };
}
