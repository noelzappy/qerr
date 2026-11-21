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

export interface SetupStep { key: string; title: string; detail: string; to: string; done: boolean }

export interface HomeOverview {
  today: string;
  counts: { thisWeek: number; awaitingApproval: number; upcoming: number; deliveryProblems: number };
  upNext: OverviewPost[];
  setup: SetupStep[];
  spend: { spentUsd: number; monthlyBudgetUsd: number | null } | null;
}

// Where a post stands, in a word, from its approval and what Buffer said.
export function postState(p: OverviewPost): { label: string; tone: 'quiet' | 'warn' | 'good' | 'info' | 'bad' } {
  if (p.deliveries.some((d) => d.status === 'failed' || d.status === 'unknown' || d.bufferStatus === 'failed')) return { label: 'Needs a look', tone: 'bad' };
  if (p.deliveries.some((d) => d.bufferStatus === 'sent')) return { label: 'Sent', tone: 'good' };
  if (p.deliveries.some((d) => d.mode === 'live' && d.status === 'created')) return { label: 'Scheduled', tone: 'info' };
  if (p.deliveries.some((d) => d.mode === 'draft' && d.status === 'created')) return { label: 'Draft in Buffer', tone: 'quiet' };
  if (p.status === 'approved') return { label: 'Approved', tone: 'good' };
  return { label: 'Needs approval', tone: 'warn' };
}
