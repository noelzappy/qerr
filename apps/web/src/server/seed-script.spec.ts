import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = path.resolve(import.meta.dirname, '..', '..', 'scripts', 'make-seed-secrets.mjs');
const MAIN = 'fixture-main-key-1111AAAA';
const SECOND = 'fixture-second-key-2222BBBB';
const AI = 'fixture-anthropic-key-3333CCCC';
const BRAVE = 'fixture-brave-key-4444DDDD';

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-script-')); });
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const write = (name: string, text: string) => { const f = path.join(dir, name); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); return f; };
const run = (args: string[]) => spawnSync('node', [SCRIPT, '--root', dir, ...args], { encoding: 'utf8' });
const seedFrom = (outFile: string) => {
  const line = fs.readFileSync(outFile, 'utf8').split('\n').find((l) => l.startsWith('SEED_SECRETS_B64='))!;
  return JSON.parse(Buffer.from(line.slice('SEED_SECRETS_B64='.length), 'base64').toString('utf8'));
};

const accounts = {
  accounts: [
    { name: 'main', keyEnv: 'BUFFER_KEY_MAIN', organizationId: '', captionLimits: { x: 280 } },
    { name: 'second', keyEnv: 'BUFFER_KEY_SECOND', organizationId: 'org-2' },
  ],
  routing: {
    x: { account: 'second', channelId: 'cx' }, linkedin: { account: 'main', channelId: 'cl' },
    facebook: { account: 'main', channelId: 'cf' }, instagram: { account: 'main', channelId: 'ci' },
    tiktok: { account: 'main', channelId: 'ct' },
  },
};

describe('make-seed-secrets', () => {
  it('builds the seed JSON from the fixture files and prints no value', () => {
    write('.env', `# comment\nBUFFER_KEY_MAIN=${MAIN}\nexport BUFFER_KEY_SECOND="${SECOND}"\nBRAVE_SEARCH_API_KEY=${BRAVE}\n`);
    write('accounts.json', JSON.stringify(accounts));
    const aiEnv = write('other/api.env', `AI_ANTHROPIC_API_KEY=${AI}\n`);
    const out = path.join(dir, 'deploy', 'staging.env.local');

    const res = run(['--anthropic-env', aiEnv]);
    expect(res.status).toBe(0);
    for (const k of [MAIN, SECOND, AI, BRAVE]) { expect(res.stdout).not.toContain(k); expect(res.stderr).not.toContain(k); }
    expect(res.stdout).toContain('Buffer accounts: main, second');
    expect(res.stdout).toContain('search: brave');
    expect(res.stdout).toContain('tiktok');

    expect(seedFrom(out)).toEqual({
      bufferAccounts: [{ name: 'main', apiKey: MAIN, captionLimits: { x: 280 } }, { name: 'second', apiKey: SECOND, organizationId: 'org-2' }],
      routing: [
        { network: 'x', account: 'second', channelId: 'cx' }, { network: 'linkedin', account: 'main', channelId: 'cl' },
        { network: 'facebook', account: 'main', channelId: 'cf' }, { network: 'instagram', account: 'main', channelId: 'ci' },
      ],
      aiProviders: [{ kind: 'anthropic', model: 'claude-sonnet-5-5', apiKey: AI, tasks: ['draft', 'research', 'rewrite'] }],
      search: { kind: 'brave', apiKey: BRAVE },
    });
    expect(fs.readFileSync(out, 'utf8')).not.toContain('SEED_VAULT');
    expect(fs.statSync(out).mode & 0o777).toBe(0o600);
  });

  it('replaces earlier SEED_ lines, keeps the rest, and leaves out parts it has no key for', () => {
    write('.env', `BUFFER_KEY_MAIN=${MAIN}\n`);
    write('accounts.json', JSON.stringify(accounts));
    const out = write('deploy/staging.env.local', 'APP_URL=https://x.test\nSEED_VAULT=1\nSEED_SECRETS_B64=old\nOTHER=1');
    fs.chmodSync(out, 0o644);
    const res = run([]);
    expect(res.status).toBe(0);
    const text = fs.readFileSync(out, 'utf8');
    expect(text.match(/^SEED_SECRETS_B64=/gm)).toHaveLength(1);
    expect(text).not.toContain('SEED_VAULT');
    expect(text).toContain('APP_URL=https://x.test\n');
    expect(text).toContain('OTHER=1\n');
    expect(text).not.toContain('=old');
    expect(fs.statSync(out).mode & 0o777).toBe(0o600);
    const seed = seedFrom(out);
    expect(seed.bufferAccounts.map((a: { name: string }) => a.name)).toEqual(['main']);
    expect(seed.routing.map((r: { network: string }) => r.network)).toEqual(['linkedin', 'facebook', 'instagram']);
    expect(seed.aiProviders).toBeUndefined();
    expect(seed.search).toBeUndefined();
    expect(res.stdout).toContain('BUFFER_KEY_SECOND');
    expect(res.stdout).not.toContain(MAIN);
  });

  it('writes nothing when there are no secrets', () => {
    write('accounts.json', JSON.stringify(accounts));
    const res = run([]);
    expect(res.status).toBe(1);
    expect(fs.existsSync(path.join(dir, 'deploy', 'staging.env.local'))).toBe(false);
  });
});

