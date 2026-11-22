import type { Tone } from '@/components/kit';
import { postFlow, STEP_LABEL, STEP_TONE, type PostFlag, type PostFlow } from '../pages/batches/flow/status';
// The shapes of /api/overview (home, calendar, channels).
export interface ChannelSummary { network: string; connected: boolean; channelName: string | null; upcoming: number }
export interface ChannelsOverview { upcoming: number; channels: ChannelSummary[] }

export interface OverviewPost {
  id: string;
  postKey: string;
  title: string;
  date: string;
  time: string;
  caption: string;
  status: 'draft' | 'approved' | 'removed';
  renderStatus: string;
  warningCount: number;
  hasDesign: boolean;
  mediaCount: number;
  thumbnailUrl: string | null;
  batch: { id: string; title: string; status: string; timezone: string };
  networks: string[];
  deliveries: Array<{ network: string; mode: string; status: string; bufferStatus: string | null }>;
}

export interface SetupStep { key: string; title: string; detail: string; to: string; done: boolean; missing?: 'provider' | 'budget' | 'account' | 'routes' | null }

export interface HomeOverview {
  today: string;
  counts: { thisWeek: number; awaitingApproval: number; upcoming: number; deliveryProblems: number };
  upNext: OverviewPost[];
  setup: SetupStep[];
  spend: { spentUsd: number; monthlyBudgetUsd: number | null } | null;
}

// The post as the status model reads it.
export const flowOfPost = (p: OverviewPost): PostFlow => postFlow({ status: p.status, renderStatus: p.renderStatus, warningCount: p.warningCount, deliveries: p.deliveries, networks: p.networks });

// Where a post stands, in a word: its step in the one vocabulary, with the problems as flags beside it.
export function postState(p: OverviewPost): { label: string; tone: Tone; flags: PostFlag[] } {
  const f = flowOfPost(p);
  return { label: STEP_LABEL[f.step], tone: STEP_TONE[f.step], flags: f.flags };
}
