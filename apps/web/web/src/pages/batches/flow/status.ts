// The one status vocabulary for a post and a batch. A post moves through five steps; problems are flags on top of the
// step, never a step of their own. Every page that shows where a post stands reads it from here.
import type { Tone } from '@/components/kit';

export const POST_STEPS = ['writing', 'approved', 'draft_in_buffer', 'scheduled', 'sent'] as const;
export type PostStep = (typeof POST_STEPS)[number];

export const STEP_LABEL: Record<PostStep, string> = {
  writing: 'Writing',
  approved: 'Approved',
  draft_in_buffer: 'Draft in Buffer',
  scheduled: 'Scheduled',
  sent: 'Sent',
};
export const STEP_TONE: Record<PostStep, Tone> = {
  writing: 'warn',
  approved: 'good',
  draft_in_buffer: 'info',
  scheduled: 'info',
  sent: 'good',
};
export const STEP_HELP: Record<PostStep, string> = {
  writing: 'Still being written and checked. It is not approved yet.',
  approved: 'Approved. It has not gone to Buffer yet.',
  draft_in_buffer: 'Waiting in Buffer as a draft. Nothing is published until it is scheduled live.',
  scheduled: 'Scheduled in Buffer. Buffer publishes it at the due time.',
  sent: 'Buffer has published it.',
};

export const POST_FLAGS = ['render_failed', 'warnings', 'needs_look', 'failed', 'deleted', 'removed'] as const;
export type PostFlag = (typeof POST_FLAGS)[number];

export const FLAG_LABEL: Record<PostFlag, string> = {
  render_failed: 'Image could not be made',
  warnings: 'Has warnings',
  needs_look: 'Needs a look',
  failed: 'Failed to send',
  deleted: 'Deleted from Buffer',
  removed: 'Removed',
};
export const FLAG_TONE: Record<PostFlag, Tone> = {
  render_failed: 'bad',
  warnings: 'warn',
  needs_look: 'warn',
  failed: 'bad',
  deleted: 'quiet',
  removed: 'quiet',
};

// The least that is known about a delivery to Buffer.
export interface DeliveryLike {
  network: string;
  mode: string;
  status: string;
  bufferStatus: string | null;
}

export interface PostFlowInput {
  status: 'draft' | 'approved' | 'removed';
  renderStatus?: string | null;
  warningCount?: number;
  deliveries?: readonly DeliveryLike[];
  // The networks the post goes to. Without it, the networks that have a delivery are all there is.
  networks?: readonly string[];
}

export interface NetworkStep { network: string; step: PostStep; flags: PostFlag[] }

export interface PostFlow {
  step: PostStep;
  stepIndex: number;
  flags: PostFlag[];
  // One entry for each network, in the order given.
  perNetwork: NetworkStep[];
  // True when the networks are not all at the same step.
  mixed: boolean;
}

// What one delivery says: the step it reached (null when it reached none), and the flag it raises.
export function deliveryStep(d: Omit<DeliveryLike, 'network'>): { step: PostStep | null; flag: PostFlag | null } {
  if (d.status === 'unknown' || d.bufferStatus === 'unknown') return { step: null, flag: 'needs_look' };
  if (d.status === 'failed' || d.bufferStatus === 'failed') return { step: null, flag: 'failed' };
  if (d.status === 'deleted') return { step: null, flag: 'deleted' };
  if (d.bufferStatus === 'sent') return { step: 'sent', flag: null };
  if (d.bufferStatus === 'scheduled') return { step: 'scheduled', flag: null };
  if (d.bufferStatus === 'draft') return { step: 'draft_in_buffer', flag: null };
  // Created, and the first status check has not said more yet.
  return { step: d.mode === 'live' ? 'scheduled' : 'draft_in_buffer', flag: null };
}

const rank = (s: PostStep) => POST_STEPS.indexOf(s);

export function postFlow(input: PostFlowInput): PostFlow {
  const base: PostStep = input.status === 'approved' ? 'approved' : 'writing';
  const rows = input.deliveries ?? [];
  const names = [...(input.networks ?? [])];
  for (const d of rows) if (!names.includes(d.network)) names.push(d.network);

  const perNetwork: NetworkStep[] = names.map((network) => {
    const mine = rows.filter((d) => d.network === network).map(deliveryStep);
    const reached = mine.map((m) => m.step).filter((s): s is PostStep => s !== null);
    if (reached.length) return { network, step: reached.reduce((a, b) => (rank(b) > rank(a) ? b : a)), flags: [] };
    // Nothing reached Buffer for this network: the post is where its approval left it, with the reasons as flags.
    const flags = [...new Set(mine.map((m) => m.flag).filter((f): f is PostFlag => f !== null))];
    return { network, step: base, flags };
  });

  let step: PostStep = base;
  if (perNetwork.length) step = perNetwork.reduce((a, b) => (rank(b.step) < rank(a) ? b.step : a), perNetwork[0]!.step);
  const flags = new Set<PostFlag>();
  for (const n of perNetwork) for (const f of n.flags) flags.add(f);
  if (input.renderStatus === 'failed') flags.add('render_failed');
  if ((input.warningCount ?? 0) > 0 && input.status !== 'removed') flags.add('warnings');
  if (input.status === 'removed') flags.add('removed');
  const ordered = POST_FLAGS.filter((f) => flags.has(f));
  const mixed = perNetwork.length > 1 && perNetwork.some((n) => n.step !== perNetwork[0]!.step);
  return { step, stepIndex: rank(step), flags: ordered, perNetwork, mixed };
}

// "Instagram: Draft in Buffer, LinkedIn: Approved", for a tooltip or a line under the stepper.
export function breakdownText(flow: PostFlow, nameOf: (network: string) => string): string {
  return flow.perNetwork.map((n) => `${nameOf(n.network)}: ${STEP_LABEL[n.step]}`).join(', ');
}

// ---- batches ----

export type BatchStatusKey = 'draft' | 'in_review' | 'scheduled' | 'done';
export const BATCH_STATUS_LABEL: Record<BatchStatusKey, { tone: Tone; label: string }> = {
  draft: { tone: 'quiet', label: 'Writing' },
  in_review: { tone: 'info', label: 'In review' },
  scheduled: { tone: 'good', label: 'Scheduled' },
  done: { tone: 'good', label: 'Done' },
};

// The counts the batch endpoints return, as the badges a batch shows. Each badge uses the post vocabulary.
export function batchCountBadges(counts: Record<string, number>): Array<{ key: string; tone: Tone; label: string }> {
  const out: Array<{ key: string; tone: Tone; label: string }> = [
    { key: 'writing', tone: 'warn', label: `${counts.draft ?? 0} ${STEP_LABEL.writing.toLowerCase()}` },
    { key: 'approved', tone: 'good', label: `${counts.approved ?? 0} ${STEP_LABEL.approved.toLowerCase()}` },
  ];
  if ((counts.removed ?? 0) > 0) out.push({ key: 'removed', tone: 'quiet', label: `${counts.removed} ${FLAG_LABEL.removed.toLowerCase()}` });
  if ((counts.renderFailed ?? 0) > 0) out.push({ key: 'render_failed', tone: 'bad', label: `${FLAG_LABEL.render_failed}: ${counts.renderFailed}` });
  return out;
}

// What the count under "In Buffer" means, keyed by the delivery state the server counts.
export const DELIVERY_COUNT_LABEL: Record<string, string> = {
  draft: STEP_LABEL.draft_in_buffer,
  scheduled: STEP_LABEL.scheduled,
  sent: STEP_LABEL.sent,
  failed: FLAG_LABEL.failed,
  unknown: FLAG_LABEL.needs_look,
  created: 'Created in Buffer',
  deleted: FLAG_LABEL.deleted,
};

// What the image of a post is doing, in words (not a step: the picture is part of writing the post).
export const IMAGE_LABEL: Record<string, { tone: Tone; label: string }> = {
  none: { tone: 'quiet', label: 'No design image' },
  queued: { tone: 'info', label: 'Waiting to make the image' },
  rendering: { tone: 'info', label: 'Making the image' },
  ok: { tone: 'good', label: 'Image ready' },
  failed: { tone: 'bad', label: FLAG_LABEL.render_failed },
};

// ---- the batch's own four steps ----

export const FLOW_STEPS = [
  { key: 'write', number: 1, label: 'Write' },
  { key: 'review', number: 2, label: 'Review' },
  { key: 'send', number: 3, label: 'Send drafts to Buffer' },
  { key: 'live', number: 4, label: 'Go live' },
] as const;
export type FlowKey = (typeof FLOW_STEPS)[number]['key'];

export interface FlowCounts {
  // Posts that are not removed.
  total: number;
  writing: number;
  // Approved and not yet in Buffer.
  approved: number;
  // In Buffer as a draft, not yet scheduled.
  drafts: number;
  scheduled: number;
  sent: number;
}

export function flowCounts(flows: readonly PostFlow[]): FlowCounts {
  const c: FlowCounts = { total: flows.length, writing: 0, approved: 0, drafts: 0, scheduled: 0, sent: 0 };
  for (const f of flows) {
    if (f.step === 'writing') c.writing++;
    else if (f.step === 'approved') c.approved++;
    else if (f.step === 'draft_in_buffer') c.drafts++;
    else if (f.step === 'scheduled') c.scheduled++;
    else c.sent++;
  }
  return c;
}

export interface FlowStepView { key: FlowKey; number: number; label: string; count: string; state: 'done' | 'current' | 'todo' }

// Where the batch is, and what each step says about itself.
export function flowSteps(c: FlowCounts): { current: FlowKey; steps: FlowStepView[] } {
  const inBuffer = c.drafts + c.scheduled + c.sent;
  const approvedOrMore = c.approved + inBuffer;
  const goneLive = c.scheduled + c.sent;
  let current: FlowKey;
  if (c.total === 0) current = 'write';
  else if (c.writing > 0) current = 'review';
  else if (c.approved > 0) current = 'send';
  else current = 'live';
  const allDone = c.total > 0 && goneLive === c.total;
  const count: Record<FlowKey, string> = {
    write: c.total === 0 ? 'No posts yet' : `${c.total} ${c.total === 1 ? 'post' : 'posts'}`,
    review: `${approvedOrMore} of ${c.total} approved`,
    send: `${inBuffer} of ${c.total} in Buffer`,
    live: `${goneLive} of ${c.total} scheduled`,
  };
  const doneNow: Record<FlowKey, boolean> = {
    write: c.total > 0,
    review: c.total > 0 && c.writing === 0,
    send: c.total > 0 && inBuffer === c.total,
    live: allDone,
  };
  const steps = FLOW_STEPS.map((s): FlowStepView => ({
    key: s.key,
    number: s.number,
    label: s.label,
    count: count[s.key],
    state: s.key === current && !allDone ? 'current' : doneNow[s.key] ? 'done' : 'todo',
  }));
  return { current, steps };
}

// A button at the top of a batch asks the open view to act; the view clears it once it has.
export type FlowCommand = 'add-post' | 'approve-all' | 'ask-draft' | 'ask-live';

export type FlowAction =
  | { kind: 'add-post'; label: string }
  | { kind: 'approve-all'; label: string }
  | { kind: 'send-drafts'; label: string; count: number }
  | { kind: 'go-live'; label: string; count: number }
  | { kind: 'none'; label: string };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// The one next sensible action for the batch.
export function nextAction(c: FlowCounts): FlowAction {
  if (c.total === 0) return { kind: 'add-post', label: 'Add the first post' };
  if (c.approved > 0) return { kind: 'send-drafts', count: c.approved, label: `Send ${plural(c.approved, 'approved post', 'approved posts')} to Buffer as drafts` };
  if (c.writing > 0) return { kind: 'approve-all', label: 'Approve all without warnings' };
  if (c.drafts > 0) return { kind: 'go-live', count: c.drafts, label: `Schedule ${plural(c.drafts, 'draft', 'drafts')} live` };
  return { kind: 'none', label: 'Every post is scheduled or sent' };
}
