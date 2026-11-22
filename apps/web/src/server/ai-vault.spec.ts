// What the AI is offered from the vault: only items a person confirmed, that are current and (photos, screens) have a file and
// settled rights. The same rule gates an approved post (services/vault-rules.ts), so a draft never starts from something approval
// would refuse. The AI library applies it again to what it is sent and rejects a post that cites anything else.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { usableForAi, vaultForAi, vaultListForAi } from './services/ai-vault.js';
import { createTestApp, type TestApp } from './testing.js';

let t: TestApp;
beforeAll(async () => { t = await createTestApp(); });
afterAll(() => t.close());
beforeEach(() => t.reset());

const NOW = new Date('2026-11-20T10:00:00Z');
const file = { fileKey: 'vault/x.jpg', fileName: 'x.jpg', contentType: 'image/jpeg', size: 10 };

describe('what the AI is offered from the vault', () => {
  it('offers confirmed, current items and cleared pictures, and nothing else', async () => {
    const make = (data: Record<string, unknown>) => t.prisma.vaultItem.create({ data: { kind: 'fact', title: 'T', body: 'B', status: 'confirmed', ...data } as never });
    const ok = await make({ title: 'Confirmed fact' });
    const figure = await make({ kind: 'figure', title: 'Fresh figure', recordedAt: new Date('2026-10-01') });
    const photo = await make({ kind: 'photo', title: 'Cleared photo', licence: 'own', ...file });
    const unconfirmed = await make({ title: 'Research finding', status: 'unconfirmed' });
    const expired = await make({ title: 'Expired', validUntil: new Date('2026-01-01') });
    const oldFigure = await make({ kind: 'figure', title: 'Old figure', recordedAt: new Date('2024-01-01') });
    const unconfirmedPhoto = await make({ kind: 'photo', title: 'Draft photo', status: 'unconfirmed', licence: 'own', ...file });
    const noLicence = await make({ kind: 'photo', title: 'No licence', ...file });
    const toConfirm = await make({ kind: 'photo', title: 'Rights open', licence: 'rights_to_confirm', ...file });
    const people = await make({ kind: 'photo', title: 'People', licence: 'own', peoplePresent: true, ...file });
    const noFile = await make({ kind: 'photo', title: 'No file', licence: 'own' });
    const deleted = await make({ title: 'Deleted', deletedAt: new Date('2026-11-01') });

    const items = await t.prisma.vaultItem.findMany();
    const offered = vaultListForAi(items, NOW).map((i) => i.id);
    expect(new Set(offered)).toEqual(new Set([ok.id, figure.id, photo.id]));
    for (const hidden of [unconfirmed, expired, oldFigure, unconfirmedPhoto, noLicence, toConfirm, people, noFile, deleted]) {
      expect(usableForAi(hidden, NOW), hidden.title).toBe(false);
      expect(offered).not.toContain(hidden.id);
    }
    // The text of a hidden item is not sent either.
    expect(JSON.stringify(vaultListForAi(items, NOW))).not.toContain('Research finding');
  });

  it('says in a boolean whether an item is stale, by the app\'s own rule, so the library need not guess', async () => {
    const fresh = await t.prisma.vaultItem.create({ data: { kind: 'figure', title: 'F', body: 'B', status: 'confirmed', recordedAt: new Date('2026-06-01') } });
    // Older than the library's own 180-day default, inside the app's 365 days: the app says it is not stale.
    expect(vaultForAi(fresh, NOW)).toMatchObject({ stale: false });
    const expired = await t.prisma.vaultItem.create({ data: { kind: 'fact', title: 'E', body: 'B', status: 'confirmed', validUntil: new Date('2026-01-01') } });
    expect(vaultForAi(expired, NOW)).toMatchObject({ stale: true });
    expect(usableForAi(fresh, NOW)).toBe(true);
  });
});
