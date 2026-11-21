// When a vault item that approved posts rely on is edited, unconfirmed, replaced or deleted, those approvals no longer
// stand: the people who approved were looking at something else. Posts go back to draft and the audit log says why.
import type { AuditActor } from '../audit.js';
import { audit } from '../audit.js';
import type { Deps } from '../deps.js';
import { designNodes } from './design-images.js';

export async function revokeApprovalsFor(deps: Pick<Deps, 'prisma'>, actor: AuditActor | null, vaultItemId: string, reason: string): Promise<string[]> {
  const approved = await deps.prisma.post.findMany({ where: { status: 'approved' }, select: { id: true, postKey: true, sources: true, design: true } });
  const cited = approved.filter((p) => p.sources.includes(vaultItemId) || designNodes(p.design).some((n) => n.vaultItemId === vaultItemId));
  for (const p of cited) {
    await deps.prisma.post.update({ where: { id: p.id }, data: { status: 'draft', approvedById: null, approvedAt: null } });
    await audit(deps, actor, 'post.approval_revoked', 'post', p.id, { postKey: p.postKey, vaultItemId, reason });
  }
  return cited.map((p) => p.id);
}
