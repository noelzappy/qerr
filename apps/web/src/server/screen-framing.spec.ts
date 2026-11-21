// A screen picture is either a pre-framed phone capture (transparent) or a plain (desktop) screenshot, worked out from the
// stored file the way the engine does it. The AI is told which, and a design that puts one in the wrong layout is refused before
// any render, whoever wrote it.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { vaultForAi } from './services/ai-vault.js';
import { currencyWarnings } from './services/currency-check.js';
import { designProblems } from './services/design-images.js';
import { ensureScreenFraming, framingOfBytes } from './services/screen-framing.js';
import { seedBatch } from './testing-batches.js';
import { createTestApp, type TestApp } from './testing.js';

let t: TestApp;
beforeAll(async () => { t = await createTestApp(); });
afterAll(() => t.close());
beforeEach(() => t.reset());

// A PNG header of the given colour type (6 = with alpha, 2 = without) followed by an IDAT chunk, enough for the engine's header test.
const chunk = (name: string, len: number) => { const b = Buffer.alloc(8 + len + 4); b.writeUInt32BE(len, 0); b.write(name, 4, 'latin1'); return b; };
const png = (colour: number) => {
  const ihdr = chunk('IHDR', 13); ihdr.writeUInt32BE(660, 8); ihdr.writeUInt32BE(1300, 12); ihdr[16] = 8; ihdr[17] = colour;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ihdr, chunk('IDAT', 4)]);
};
const PHONE = png(6), DESKTOP = png(2);
const upload = (bytes: Buffer, name: string) => { const form = new FormData(); form.set('file', new File([new Uint8Array(bytes)], name, { type: 'image/png' })); return form; };
const editor = async () => t.api(await t.signIn(await t.createUser('editor')));

const screen = (title: string, bytes: Buffer | null, extra: Record<string, unknown> = {}) => (async () => {
  const key = `vault/framing-${title}.png`;
  if (bytes) await t.storage.putObject(key, bytes, 'image/png');
  return t.prisma.vaultItem.create({ data: { kind: 'screen', title, body: '', status: 'confirmed', ...(bytes ? { fileKey: key, fileName: `${title}.png`, contentType: 'image/png', size: bytes.length } : {}), licence: 'own', ...extra } });
})();
const design = (template: string, id: string, extra: Record<string, unknown> = {}) => ({ template, headline: 'Every euro, *on record*', image: `design/assets/screens/vault-${id}.png`, vaultItemId: id, ground: 'cool', ...extra });

describe('the engine test, on stored bytes', () => {
  it('says phone for a transparent PNG, desktop for an opaque one, nothing for a GIF', async () => {
    expect(await framingOfBytes(PHONE)).toBe('phone');
    expect(await framingOfBytes(DESKTOP)).toBe('desktop');
    expect(await framingOfBytes(Buffer.from('GIF89a\0\0\0\0\0\0\0\0\0\0\0\0'))).toBeNull();
  });
});

describe('upload', () => {
  it('records at upload whether a screen is a phone capture, and nothing for a photo', async () => {
    const api = await editor();
    const mk = async (kind: string, title: string) => (await api.post('/api/vault', { kind, title, body: 'x' })).body.item.id as string;
    const phone = await mk('screen', 'Phone'), desk = await mk('screen', 'Desk'), photo = await mk('photo', 'Photo');
    for (const [id, bytes] of [[phone, PHONE], [desk, DESKTOP], [photo, DESKTOP]] as const) expect((await api.post(`/api/vault/${id}/file`, upload(bytes, `${id}.png`))).status).toBe(200);
    const got = async (id: string) => (await t.prisma.vaultItem.findUniqueOrThrow({ where: { id } })).phoneFramed;
    expect(await got(phone)).toBe(true);
    expect(await got(desk)).toBe(false);
    expect(await got(photo)).toBeNull();
    // a new file replaces the answer
    await api.post(`/api/vault/${phone}/file`, upload(DESKTOP, 'now-desktop.png'));
    expect(await got(phone)).toBe(false);
  });

  it('reads a file stored before the column existed once, and keeps the answer', async () => {
    const old = await screen('Old', DESKTOP);
    expect(old.phoneFramed).toBeNull();
    await ensureScreenFraming(t.deps, [old]);
    expect(old.phoneFramed).toBe(false);
    expect((await t.prisma.vaultItem.findUniqueOrThrow({ where: { id: old.id } })).phoneFramed).toBe(false);
    // a file that is gone leaves it unknown instead of failing
    const gone = await screen('Gone', null, { fileKey: 'vault/missing.png', fileName: 'm.png', contentType: 'image/png', size: 1 });
    await ensureScreenFraming(t.deps, [gone]);
    expect(gone.phoneFramed).toBeNull();
  });
});

describe('what the AI is told', () => {
  it('names the framing of a screen and leaves a photo and an unknown screen alone', async () => {
    const phone = await screen('P', PHONE, { phoneFramed: true }), desk = await screen('D', DESKTOP, { phoneFramed: false }), unknown = await screen('U', DESKTOP);
    const photo = await t.prisma.vaultItem.create({ data: { kind: 'photo', title: 'Ph', body: '', status: 'confirmed', fileKey: 'vault/p.jpg', fileName: 'p.jpg', contentType: 'image/jpeg', size: 1 } });
    const now = new Date();
    expect(vaultForAi(phone, now)).toMatchObject({ kind: 'screen', framing: 'phone' });
    expect(vaultForAi(desk, now)).toMatchObject({ framing: 'desktop' });
    expect(vaultForAi(unknown, now)).not.toHaveProperty('framing');
    expect(vaultForAi(photo, now)).not.toHaveProperty('framing');
  });
});

describe('a design a person saves', () => {
  it('refuses a desktop screenshot in the phone layout, and a phone capture in a desktop screen, before any render', async () => {
    const phone = await screen('Phone', PHONE), desk = await screen('Desk', DESKTOP);
    const problems = (d: unknown) => designProblems(d, t.deps);
    expect(await problems(design('product', desk.id))).toEqual([expect.stringMatching(/design: "Desk" is a desktop screenshot, but this layout shows a phone and needs a phone screen/)]);
    expect(await problems(design('product', phone.id))).toEqual([]);
    expect(await problems(design('screen', desk.id, { device: 'desktop' }))).toEqual([]);
    expect(await problems(design('screen', phone.id, { device: 'desktop' }))).toEqual([expect.stringMatching(/"Phone" is a phone screen, but this layout shows a desktop screenshot/)]);
    expect(await problems(design('screen', desk.id))).toHaveLength(1); // the screen template shows a phone unless it says desktop
    // a carousel page is named
    const page = await problems({ template: 'carousel', pages: [{ template: 'closing' }, design('product', desk.id)] });
    expect(page.join(' ')).toMatch(/design page 2: "Desk" is a desktop screenshot/);
    // without deps the picture is not looked at (the engine's own checks only)
    expect(await designProblems(design('product', desk.id))).toEqual([]);
  });

  it('refuses it on the preview route and when a post is saved, with the same plain message', async () => {
    const desk = await screen('Desk', DESKTOP);
    const api = await editor();
    const preview = await api.post('/api/posts/preview-design', { design: design('product', desk.id) });
    expect(preview.status).toBe(422);
    expect(preview.body.details.join(' ')).toMatch(/"Desk" is a desktop screenshot, but this layout shows a phone/);
    const user = await t.createUser('editor');
    const { posts } = await seedBatch(t, user, { posts: [{ key: 'a' }] });
    const saved = await api.patch(`/api/posts/${posts[0]!.id}`, { design: design('product', desk.id) });
    expect(saved.status).toBe(422);
    expect(saved.body.details.join(' ')).toMatch(/"Desk" is a desktop screenshot, but this layout shows a phone/);
  });

  it('keeps a post with a wrong screen from being approved', async () => {
    const desk = await screen('Desk', DESKTOP);
    const user = await t.createUser('editor');
    const { posts } = await seedBatch(t, user, { posts: [{ key: 'a', design: design('product', desk.id) }] });
    const res = await (await editor()).get(`/api/posts/${posts[0]!.id}`);
    expect(res.body.blockers.join(' ')).toMatch(/is a desktop screenshot, but this layout shows a phone/);
  });
});

describe('another currency in a post a person wrote', () => {
  it('warns about the brand\'s other currencies in the caption, a network caption and the image text, in any case', async () => {
    const post = (caption: string, extra: Record<string, unknown> = {}) => ({ caption, networks: {}, design: null, ...extra }) as Parameters<typeof currencyWarnings>[0];
    const money = /another currency/;
    expect((await currencyWarnings(post('It costs 9 dollars a month'))).join()).toMatch(money);
    expect((await currencyWarnings(post('It costs 9 DOLLARS a month'))).join()).toMatch(money);
    expect((await currencyWarnings(post('It costs $9 a month'))).join()).toMatch(money);
    expect(await currencyWarnings(post('It costs 9 euros a month'))).toEqual([]);
    expect((await currencyWarnings(post('Fine', { networks: { x: { caption: 'Only 9 dollars' } } }))).join()).toMatch(/^x caption: mentions another currency \("dollars"\)/);
    const image = await currencyWarnings(post('Fine', { design: { template: 'closing', headline: 'Only 9 dollars a month' } }));
    expect(image.join()).toMatch(/image text \(headline\): mentions another currency \("dollars"\)/);
  });

  it('shows on the review page, and does not block approval', async () => {
    const user = await t.createUser('editor');
    const { posts } = await seedBatch(t, user, { posts: [{ key: 'a', caption: 'Premium is 9 dollars a month #AcmeSavings' }] });
    const res = await (await editor()).get(`/api/posts/${posts[0]!.id}`);
    expect(res.body.warnings.join(' ')).toMatch(/caption: mentions another currency \("dollars"\); Acme Savings works in euros/);
    expect(res.body.blockers).toEqual([]);
  });
});
