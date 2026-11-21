import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { decrypt } from './crypto.js';
import { runSeed, defaultVaultFile } from './seed.js';
import { getAiConfig } from './services/ai-config.js';
import { loadAccountsConfig } from './services/buffer-accounts.js';
import { createTestApp, type TestApp } from './testing.js';

let t: TestApp;
beforeAll(async () => { t = await createTestApp(); });
afterAll(() => t.close());
beforeEach(() => t.reset());

const MAIN_KEY = 'plain-main-key-AAAA1111BBBB';
const SECOND_KEY = 'plain-second-key-CCCC2222DDDD';
const AI_KEY = 'plain-ai-key-EEEE3333FFFF';
const SEARCH_KEY = 'plain-search-key-GGGG4444HHHH';
const ALL_KEYS = [MAIN_KEY, SECOND_KEY, AI_KEY, SEARCH_KEY];

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64');
const secrets = (extra: Record<string, unknown> = {}) => b64({
  bufferAccounts: [{ name: 'main', apiKey: MAIN_KEY, captionLimits: { x: 280 } }, { name: 'second', apiKey: SECOND_KEY, keyExpiresAt: '2027-01-31' }],
  routing: [
    { network: 'x', account: 'second', channelId: 'chan-x' },
    { network: 'linkedin', account: 'main', channelId: 'chan-li' },
    { network: 'facebook', account: 'main', channelId: 'chan-fb' },
    { network: 'instagram', account: 'main', channelId: 'chan-ig' },
  ],
  aiProviders: [{ kind: 'anthropic', model: 'claude-sonnet-5-5', apiKey: AI_KEY, tasks: ['draft', 'research', 'rewrite'], priceInPerMTok: 3, priceOutPerMTok: 15 }],
  search: { kind: 'brave', apiKey: SEARCH_KEY },
  aiMonthlyBudgetUsd: 25,
  ...extra,
});

type Line = { event: string; fields?: Record<string, unknown> };
const capture = () => {
  const lines: Line[] = [];
  return { lines, log: (event: string, fields?: Record<string, unknown>) => { lines.push({ event, fields }); } };
};
const deps = () => ({ prisma: t.prisma, config: t.config, now: t.now });
const done = (lines: Line[]) => lines.find((l) => l.event === 'seed.done')!.fields!;
// Everything a key could leak into: logs, the audit table, every settings page.
async function leaks(lines: Line[]): Promise<string[]> {
  const admin = await t.createUser('admin');
  const api = t.api(await t.signIn(admin));
  const haystack = JSON.stringify([
    lines,
    await t.prisma.auditLog.findMany(),
    (await api.get('/api/buffer-accounts')).body,
    (await api.get('/api/routing')).body,
    (await api.get('/api/settings/ai')).body,
    (await api.get('/api/audit')).body,
  ]);
  return ALL_KEYS.filter((k) => haystack.includes(k));
}

describe('seed: vault', () => {
  it('imports the seed file onto the real model, as confirmed by the owner, and saves the research topics', async () => {
    const file = JSON.parse(fs.readFileSync(await defaultVaultFile(), 'utf8'));
    const { lines, log } = capture();
    await runSeed(deps(), {}, log);
    expect(done(lines)).toMatchObject({ vault: file.vault.length, researchTopics: file.research.topics.length, bufferAccounts: 0 });

    const rows = await t.prisma.vaultItem.findMany({ orderBy: { createdAt: 'asc' } });
    expect(rows).toHaveLength(file.vault.length);
    const byTitle = new Map(rows.map((r) => [r.title, r]));
    for (const src of file.vault) {
      const r = byTitle.get(src.title)!;
      expect(r.kind).toBe(src.kind === 'product' ? 'product_note' : src.kind);
      expect(r.body).toBe(src.body);
      expect(r.sourceUrl).toBe(src.sourceUrl ?? null);
      expect(r.sourceNotes).toBe(src.sourceNote ?? null);
      expect(r.status).toBe(src.status);
      expect(r.validFrom?.toISOString().slice(0, 10) ?? null).toBe(src.validFrom ?? null);
      expect(r.validUntil?.toISOString().slice(0, 10) ?? null).toBe(src.validUntil ?? null);
      expect(r.tags).toEqual(src.tags);
      expect(r.createdById).toBeNull();
      expect(r.confirmedById).toBeNull();
      expect(r.deletedAt).toBeNull();
      expect(!!r.confirmedAt).toBe(src.status === 'confirmed');
    }
    expect(rows.filter((r) => r.status === 'unconfirmed')).toHaveLength(1);

    const audits = await t.prisma.auditLog.findMany({ where: { action: 'seed.vault_import' } });
    expect(audits).toHaveLength(file.vault.length);
    expect(audits.every((a) => a.actorId === null && a.actorEmail === 'system' && a.entity === 'vault_item')).toBe(true);
    const confirmedAudit = audits.find((a) => (a.detail as any).status === 'confirmed')!;
    expect((confirmedAudit.detail as any).confirmedBy).toBe('seed (the brand pack\'s vault.json)');

    const admin = await t.createUser('admin');
    const api = t.api(await t.signIn(admin));
    const listed = (await api.get('/api/settings/ai')).body;
    expect(listed.topics).toEqual(file.research.topics);
    const vault = (await api.get('/api/vault?pageSize=100')).body;
    expect(vault.total).toBe(file.vault.length);
  });

  it('is idempotent and never touches a vault that already has items', async () => {
    const first = capture();
    await runSeed(deps(), {}, first.log);
    const before = await t.prisma.vaultItem.count();
    const second = capture();
    await runSeed(deps(), {}, second.log);
    expect(second.lines).toHaveLength(0);
    expect(await t.prisma.vaultItem.count()).toBe(before);
    expect(await t.prisma.auditLog.count({ where: { action: 'seed.vault_import' } })).toBe(before);

    await t.reset();
    await t.prisma.vaultItem.create({ data: { kind: 'fact', title: 'Mine', body: 'x' } });
    const third = capture();
    await runSeed(deps(), {}, third.log);
    expect(await t.prisma.vaultItem.count()).toBe(1);
  });

  it('keeps research topics an admin already saved, even an empty list', async () => {
    await t.prisma.appSetting.create({ data: { key: 'researchTopics', value: [] } });
    await runSeed(deps(), {}, capture().log);
    expect((await t.prisma.appSetting.findUnique({ where: { key: 'researchTopics' } }))!.value).toEqual([]);
  });

  it('runs by default on an empty vault, and SEED_VAULT=0 turns it off', async () => {
    const off = capture();
    expect(await runSeed(deps(), { SEED_VAULT: '0' }, off.log)).toBeNull();
    expect(off.lines).toHaveLength(0);
    expect(await t.prisma.vaultItem.count()).toBe(0);
    await runSeed(deps(), {}, capture().log);
    expect(await t.prisma.vaultItem.count()).toBeGreaterThan(0);
  });

  it('never brings the seed back once it has run, even after every item is deleted', async () => {
    await runSeed(deps(), {}, capture().log);
    await t.prisma.vaultItem.deleteMany();
    await t.prisma.appSetting.deleteMany({ where: { key: 'researchTopics' } });
    const { lines, log } = capture();
    await runSeed(deps(), {}, log);
    expect(await t.prisma.vaultItem.count()).toBe(0);
    expect(await t.prisma.appSetting.findUnique({ where: { key: 'researchTopics' } })).toBeNull();
    expect(lines).toHaveLength(0);
  });

  it('reports a seed file that does not fit the model, naming the field, and imports nothing', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-test-'));
    try {
      const file = path.join(dir, 'v.json');
      fs.writeFileSync(file, JSON.stringify({ vault: [{ kind: 'weird', title: 'x', status: 'confirmed' }] }));
      const { lines, log } = capture();
      await runSeed(deps(), {}, log, { vaultFile: file });
      expect(lines.find((l) => l.event === 'seed.invalid')!.fields).toMatchObject({ part: 'vault', field: 'vault.0.kind' });
      expect(await t.prisma.vaultItem.count()).toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('logs the reminder to remove the secrets variable, and only then', async () => {
    const { lines, log } = capture();
    await runSeed(deps(), { SEED_VAULT: '0', SEED_SECRETS_B64: secrets() }, log);
    const reminder = lines.find((l) => l.event === 'seed.remove_env')!;
    expect(String(reminder.fields!.message)).toContain('SEED_SECRETS_B64');
  });
});

describe('seed: search key from the environment', () => {
  it('saves a Brave key set directly in the environment once, encrypted, and never logs it', async () => {
    const KEY = 'brave-env-key-0123456789abcdef';
    const { lines, log } = capture();
    await runSeed(deps(), { SEED_VAULT: '0', BRAVE_SEARCH_API_KEY: KEY }, log);
    const row = await t.prisma.searchSetting.findUnique({ where: { id: 'search' } });
    expect(row?.kind).toBe('brave');
    expect(JSON.stringify(row)).not.toContain(KEY);
    expect(JSON.stringify(lines)).not.toContain(KEY);
    // a second start, or a changed variable, does not replace a saved setting
    await runSeed(deps(), { SEED_VAULT: '0', BRAVE_SEARCH_API_KEY: 'another-key-0123456789abcdef' }, capture().log);
    expect((await t.prisma.searchSetting.findUnique({ where: { id: 'search' } }))?.updatedAt).toEqual(row?.updatedAt);
  });
});

describe('seed: secrets', () => {
  it('creates accounts, routes, the provider, search and budget; keys are encrypted and appear nowhere', async () => {
    const { lines, log } = capture();
    await runSeed(deps(), { SEED_VAULT: '0', SEED_SECRETS_B64: secrets() }, log);
    expect(done(lines)).toEqual({ vault: 0, researchTopics: 0, bufferAccounts: 2, routes: 4, aiProviders: 1, search: 1, budget: 1 });

    const accounts = await t.prisma.bufferAccount.findMany({ orderBy: { name: 'asc' } });
    expect(accounts.map((a) => a.name)).toEqual(['main', 'second']);
    for (const a of accounts) {
      expect(ALL_KEYS).not.toContain(a.keyCipher);
      expect(a.keyCipher).toMatch(/^v1\./);
      expect(a.keyCipher).not.toContain(MAIN_KEY);
    }
    expect(accounts[1]!.keyExpiresAt?.toISOString().slice(0, 10)).toBe('2027-01-31');
    expect(accounts[0]!.captionLimits).toEqual({ x: 280 });

    // the same decryption the app uses reads the keys back
    const cfg = await loadAccountsConfig(deps());
    expect(cfg.accounts.map((a) => [a.name, a.apiKey])).toEqual([['main', MAIN_KEY], ['second', SECOND_KEY]]);
    expect(cfg.routing).toEqual({
      x: { account: 'second', channelId: 'chan-x' }, linkedin: { account: 'main', channelId: 'chan-li' },
      facebook: { account: 'main', channelId: 'chan-fb' }, instagram: { account: 'main', channelId: 'chan-ig' },
    });
    const ai = await getAiConfig(deps());
    expect(ai.providers).toHaveLength(1);
    expect(ai.providers[0]).toMatchObject({ kind: 'anthropic', baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-5-5', apiKey: AI_KEY, tasks: ['draft', 'research', 'rewrite'] });
    expect(ai.providers[0]!.prices).toEqual({ 'claude-sonnet-5-5': { inputPerMTok: 3, outputPerMTok: 15 } });
    expect(ai.search).toEqual({ kind: 'brave', apiKey: SEARCH_KEY });
    expect(ai.budget.monthlyLimitUsd).toBe(25);
    const stored = await t.prisma.aiProvider.findFirst();
    expect(decrypt(stored!.keyCipher, t.config.keyring)).toBe(AI_KEY);
    expect(stored!.keyCipher).not.toContain(AI_KEY);

    expect(await leaks(lines)).toEqual([]);
    const audits = await t.prisma.auditLog.findMany({ where: { actorEmail: 'system' } });
    expect(audits.map((a) => a.action).sort()).toEqual(['ai_budget.update', 'ai_provider.create', 'buffer_account.create', 'buffer_account.create', 'routing.set', 'routing.set', 'routing.set', 'routing.set', 'search_setting.update']);
  });

  it('a second start with the same environment changes nothing', async () => {
    await runSeed(deps(), { SEED_VAULT: '0', SEED_SECRETS_B64: secrets() }, capture().log);
    const snapshot = async () => JSON.stringify([
      await t.prisma.bufferAccount.findMany({ orderBy: { name: 'asc' } }), await t.prisma.channelRoute.findMany({ orderBy: { network: 'asc' } }),
      await t.prisma.aiProvider.findMany(), await t.prisma.searchSetting.findMany(), await t.prisma.appSetting.findMany({ orderBy: { key: 'asc' } }),
      await t.prisma.vaultItem.count(), await t.prisma.auditLog.count(),
    ]);
    const before = await snapshot();
    const { lines, log } = capture();
    await runSeed(deps(), { SEED_VAULT: '0', SEED_SECRETS_B64: secrets() }, log);
    expect(done(lines)).toEqual({ vault: 0, researchTopics: 0, bufferAccounts: 0, routes: 0, aiProviders: 0, search: 0, budget: 0 });
    expect(await snapshot()).toBe(before);
  });

  it('skips what exists: an account with the name, a network with a route, any provider, search and budget', async () => {
    const admin = await t.createUser('admin');
    const api = t.api(await t.signIn(admin));
    const existingKey = 'plain-existing-key-ZZZZ9999';
    const acct = (await api.post('/api/buffer-accounts', { name: 'main', apiKey: existingKey })).body.account;
    await api.put('/api/routing', { network: 'x', accountId: acct.id, channelId: 'chan-existing' });
    await api.post('/api/settings/ai/providers', { name: 'Mine', kind: 'anthropic', model: 'm', apiKey: 'plain-other-key-12345678', tasks: ['draft'] });
    await api.put('/api/settings/ai/budget', { monthlyBudgetUsd: 5 });

    const { lines, log } = capture();
    await runSeed(deps(), { SEED_VAULT: '0', SEED_SECRETS_B64: secrets() }, log);
    expect(done(lines)).toEqual({ vault: 0, researchTopics: 0, bufferAccounts: 1, routes: 3, aiProviders: 0, search: 1, budget: 0 });
    const cfg = await loadAccountsConfig(deps());
    expect(cfg.accounts.find((a) => a.name === 'main')!.apiKey).toBe(existingKey);
    expect(cfg.routing.x).toEqual({ account: 'main', channelId: 'chan-existing' });
    expect(await t.prisma.aiProvider.count()).toBe(1);
    expect((await t.prisma.appSetting.findUnique({ where: { key: 'monthlyBudgetUsd' } }))!.value).toBe(5);
    expect(await leaks(lines)).toEqual([]);
  });

  it('skips an invalid part with an error that names the field and not the value; valid parts still go in', async () => {
    const badKey = 'plain-bad-key-QQQQ5555RRRR';
    const raw = secrets({
      bufferAccounts: [{ name: 'main', apiKey: MAIN_KEY }, { name: 'bad name!', apiKey: badKey }, { name: 'short', apiKey: 'tiny' }],
      aiProviders: [{ kind: 'bogus', model: 'm', apiKey: badKey, tasks: ['draft'] }],
      routing: [{ network: 'myspace', account: 'main', channelId: 'c' }, { network: 'x', account: 'nobody', channelId: 'c' }, { network: 'linkedin', account: 'main', channelId: 'chan-li' }],
      search: { kind: 'bing', apiKey: badKey },
      aiMonthlyBudgetUsd: -4,
    });
    const { lines, log } = capture();
    await runSeed(deps(), { SEED_VAULT: '0', SEED_SECRETS_B64: raw }, log);
    const invalid = lines.filter((l) => l.event === 'seed.invalid').map((l) => `${l.fields!.part}:${l.fields!.field}`);
    expect(invalid).toEqual(expect.arrayContaining([
      'bufferAccounts:bufferAccounts.1.name', 'bufferAccounts:bufferAccounts.2.apiKey', 'aiProviders:aiProviders.0.kind',
      'routing:routing.0.network', 'routing:routing.1.account', 'search:search.kind', 'aiMonthlyBudgetUsd:aiMonthlyBudgetUsd',
    ]));
    expect(done(lines)).toEqual({ vault: 0, researchTopics: 0, bufferAccounts: 1, routes: 1, aiProviders: 0, search: 0, budget: 0 });
    expect(JSON.stringify(lines)).not.toContain(badKey);
    expect(JSON.stringify(lines)).not.toContain(MAIN_KEY);
    expect(await t.prisma.bufferAccount.count()).toBe(1);
  });

  it('reports a value that is not base64 JSON, and a field that does not belong', async () => {
    const a = capture();
    await runSeed(deps(), { SEED_VAULT: '0', SEED_SECRETS_B64: '!!!not-json!!!' }, a.log);
    expect(a.lines.find((l) => l.event === 'seed.invalid')!.fields).toMatchObject({ part: 'secrets', field: 'SEED_SECRETS_B64' });
    const b = capture();
    await runSeed(deps(), { SEED_VAULT: '0', SEED_SECRETS_B64: b64({ bufferAccount: [] }) }, b.log);
    expect(b.lines.some((l) => l.event === 'seed.invalid' && l.fields!.part === 'secrets')).toBe(true);
    expect(await t.prisma.bufferAccount.count()).toBe(0);
  });
});
