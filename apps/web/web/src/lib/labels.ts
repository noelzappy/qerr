// Plain-words labels for the values the server uses. Pages never show a raw code.
const NETWORK_LABEL: Record<string, string> = { instagram: 'Instagram', linkedin: 'LinkedIn', facebook: 'Facebook', x: 'X' };
export const networkLabel = (n: string) => NETWORK_LABEL[n] ?? n;

export const ROLE_LABEL: Record<string, string> = { admin: 'Admin', editor: 'Editor' };

export const VAULT_KINDS = ['fact', 'figure', 'news', 'event', 'product_note', 'story', 'photo', 'screen'] as const;
export type VaultKind = (typeof VAULT_KINDS)[number];
export const KIND_LABEL: Record<VaultKind, string> = {
  fact: 'Fact', figure: 'Figure', news: 'News', event: 'Event', product_note: 'Product note', story: 'Story', photo: 'Photo', screen: 'Screen',
};
export const kindLabel = (k: string) => KIND_LABEL[k as VaultKind] ?? k;

export const LICENCE_LABEL: Record<string, string> = { own: 'Our own', licensed: 'Licensed, with credit', rights_to_confirm: 'Rights still to confirm' };

export const PROVIDER_KIND_LABEL: Record<string, string> = { anthropic: 'Anthropic', 'openai-compatible': 'OpenAI-compatible' };
export const TASK_LABEL: Record<string, string> = { draft: 'Drafting batches', research: 'Research', rewrite: 'Rewriting posts' };
export const SEARCH_KIND_LABEL: Record<string, string> = { brave: 'Brave Search', tavily: 'Tavily', exa: 'Exa' };

// Audit actions, written as what happened. Unknown ones fall back to the code with the dots and underscores softened.
const ACTIONS: Record<string, string> = {
  'invite.create': 'Invited someone',
  'invite.accept': 'Accepted an invitation',
  'invite.revoke': 'Withdrew an invitation',
  'bootstrap.admin_invite': 'First admin invitation made',
  'user.role_change': 'Changed a role',
  'user.disable': 'Disabled an account',
  'user.enable': 'Enabled an account',
  'user.reset_link': 'Made a password reset link',
  'user.password_reset': 'Password was reset',
  'buffer_account.create': 'Added a Buffer account',
  'buffer_account.update': 'Changed a Buffer account',
  'buffer_account.delete': 'Deleted a Buffer account',
  'buffer_account.check': 'Checked a Buffer key',
  'routing.set': 'Set a channel route',
  'routing.clear': 'Cleared a channel route',
  'ai_provider.create': 'Added an AI provider',
  'ai_provider.update': 'Changed an AI provider',
  'ai_provider.delete': 'Deleted an AI provider',
  'search_setting.update': 'Changed the search service',
  'brand.update': 'Changed the brand',
  'brand.advanced.update': 'Changed the Advanced brand settings',
  'brand.logo.upload': 'Uploaded a logo',
  'brand.font.upload': 'Uploaded a font',
  'brand.font.google': 'Downloaded a font from Google Fonts',
  'brand.font.remove': 'Went back to the built-in font',
  'brand.import': 'Imported a brand pack',
  'design_reference.create': 'Added a design reference',
  'design_reference.update': 'Changed a design reference',
  'design_reference.delete': 'Removed a design reference',
  'design_reference.analysed': 'The AI described a design reference',
  'ai_budget.update': 'Changed the monthly AI budget',
  'research_topics.update': 'Changed the research topics',
  'research.run_requested': 'Started a research run',
  'ai.research': 'Research run finished',
  'ai.draft_requested': 'Asked the AI to draft a batch',
  'ai.draft_batch': 'AI drafted a batch',
  'ai.draft_batch.failed': 'AI drafting failed',
  'ai.rewrite_post': 'AI rewrote a post',
  'ai.spend_not_saved': 'AI spend could not be recorded',
  'vault.create': 'Added a vault item',
  'vault.update': 'Changed a vault item',
  'vault.delete': 'Deleted a vault item',
  'vault.restore': 'Restored a vault item',
  'vault.confirm': 'Confirmed a vault item',
  'vault.unconfirm': 'Took confirmation off a vault item',
  'vault.file': 'Uploaded a vault file',
  'batch.create': 'Created a batch',
  'batch.import': 'Imported a batch',
  'batch.update': 'Changed a batch',
  'batch.delete': 'Deleted a batch',
  'post.update': 'Changed a post',
  'post.approve': 'Approved a post',
  'post.unapprove': 'Took approval off a post',
  'post.remove': 'Removed a post',
  'post.restore': 'Restored a post',
  'post.render': 'Rendered a post',
  'render.failed': 'A render failed',
  'schedule.send_draft': 'Sent a batch to Buffer as drafts',
  'schedule.send_live': 'Scheduled a batch on Buffer',
  'schedule.refresh': 'Refreshed delivery status',
  'schedule.resolve': 'Settled an uncertain delivery',
  'schedule.delete_from_buffer': 'Deleted posts from Buffer',
  'send.failed': 'Sending to Buffer failed',
  'jobs.error': 'A background job had an error',
  'jobs.failed': 'A background job failed',
};
export const actionLabel = (a: string) => ACTIONS[a] ?? a.replace(/[._]/g, ' ');

// Filter choices for the audit log: a prefix matches every action beneath it.
export const AUDIT_GROUPS: Array<{ value: string; label: string }> = [
  { value: 'invite', label: 'Invitations' },
  { value: 'user', label: 'People and roles' },
  { value: 'buffer_account', label: 'Buffer accounts' },
  { value: 'routing', label: 'Channel routing' },
  { value: 'ai.', label: 'AI work' },
  { value: 'ai_provider', label: 'AI providers' },
  { value: 'search_setting', label: 'Search service' },
  { value: 'research', label: 'Research' },
  { value: 'vault', label: 'Vault' },
  { value: 'batch', label: 'Batches' },
  { value: 'post', label: 'Posts' },
  { value: 'schedule', label: 'Scheduling' },
  { value: 'send', label: 'Sending' },
  { value: 'jobs', label: 'Background jobs' },
];

const ENTITY_LABEL: Record<string, string> = {
  invite: 'Invitation', user: 'Person', buffer_account: 'Buffer account', channel_route: 'Channel route', ai_provider: 'AI provider',
  search_setting: 'Search service', app_setting: 'Setting', research: 'Research', vault_item: 'Vault item', batch: 'Batch', post: 'Post',
};
export const entityLabel = (e: string | null) => (e ? ENTITY_LABEL[e] ?? e.replace(/_/g, ' ') : '');
