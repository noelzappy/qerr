// A bare phone screenshot and a post's portrait picture (avatar). A plain screenshot at a phone's proportions is a bare phone screenshot: a look's
// phone design draws the phone round it, so it may go there; a desktop screenshot or a photo may not. The avatar is a design node like the post's
// own picture: the same path rule, the same vault copy, and the same rights rule (a face needs its consent recorded) before approval.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { vaultForAi } from './services/ai-vault.js';
import { currentSettings, resetBrandState, syncBrand } from './services/brand-settings.js';
import { designNodes, designProblems, withoutVaultIds } from './services/design-images.js';
import { framingOfItem, PHONE_SCREEN_RATIO } from './services/screen-framing.js';
import { seedBatch } from './testing-batches.js';
import { createTestApp, type TestApp } from './testing.js';

let t: TestApp;
beforeAll(async () => { t = await createTestApp(); });
afterAll(() => { resetBrandState(); return t.close(); });
beforeEach(async () => { await t.reset(); resetBrandState(); });

type Api = ReturnType<TestApp['api']>;
const admin = async (): Promise<Api> => t.api(await t.signIn(await t.createUser('admin')));
const item = (kind: 'screen' | 'photo', title: string, extra: Record<string, unknown> = {}) => t.prisma.vaultItem.create({
  data: { kind, title, body: '', status: 'confirmed', fileKey: `vault/${title}.png`, fileName: `${title}.png`, contentType: 'image/png', size: 10, licence: 'own', ...extra },
});
const bare = (title = 'Bare') => item('screen', title, { phoneFramed: false, width: 645, height: 1398 });
const desk = (title = 'Desk') => item('screen', title, { phoneFramed: false, width: 1640, height: 1025 });
const framed = (title = 'Framed') => item('screen', title, { phoneFramed: true, width: 660, height: 1354 });
const phonePost = (id: string, extra: Record<string, unknown> = {}) => ({ template: 'post', kind: 'photo', variant: 0, headline: 'See the pot, *week by week*', image: `design/assets/screens/vault-${id}.png`, vaultItemId: id, ...extra });
// The brand saved, and the shipped ledger look made its look (its photo/0 design draws a phone round the picture).
async function useLedger(api: Api) {
  await t.prisma.brandProfile.create({ data: { settings: currentSettings(null) as object } });
  expect((await api.put('/api/settings/looks/active', { ref: 'shipped:ledger' })).status).toBe(200);
  await syncBrand(t.deps);
}
const quote = (avatar: Record<string, unknown>) => ({ template: 'post', kind: 'quote', quote: 'We stopped arguing about who paid.', by: 'Ama', avatar });

describe('a bare phone screenshot', () => {
  it('is a plain screenshot at a phone\'s proportions, held to the engine\'s own phone', async () => {
    const { MODELS } = await import('@vesk/engine/design/directions/primitives/device' as string) as { MODELS: { phone: { lo: number; hi: number } } };
    expect(PHONE_SCREEN_RATIO).toEqual({ lo: MODELS.phone.lo, hi: MODELS.phone.hi });
    const it_ = (phoneFramed: boolean | null, width: number | null, height: number | null) => framingOfItem({ kind: 'screen', phoneFramed, width, height });
    expect(it_(false, 645, 1398)).toBe('phone-bare');
    expect(it_(false, 1170, 2532)).toBe('phone-bare');
    expect(it_(false, 1640, 1025)).toBe('desktop');
    expect(it_(false, 1000, 1400)).toBe('desktop');
    expect(it_(false, 600, 2000)).toBe('desktop');
    expect(it_(false, null, null)).toBe('desktop');
    expect(it_(true, 645, 1398)).toBe('phone');
    expect(it_(null, 645, 1398)).toBeNull();
    expect(framingOfItem({ kind: 'photo', phoneFramed: false, width: 645, height: 1398 })).toBeNull();
  });

  it('is offered to the AI and shown on the item page as one', async () => {
    const b = await bare();
    expect(vaultForAi(b, new Date())).toMatchObject({ kind: 'screen', framing: 'phone-bare' });
    const res = await (await admin()).get(`/api/vault/${b.id}`);
    expect(res.status).toBe(200);
    expect(res.body.item.framing).toBe('phone-bare');
  });

  it('may go in a look\'s phone design; a desktop screenshot or a photo may not, said before any render', async () => {
    const api = await admin();
    await useLedger(api);
    const [b, d, f] = [await bare(), await desk(), await framed()];
    const photo = await item('photo', 'Jar');
    const problems = (x: unknown) => designProblems(x, t.deps);
    expect(await problems(phonePost(b.id))).toEqual([]);
    expect(await problems(phonePost(f.id))).toEqual([]);
    expect(await problems(phonePost(d.id))).toEqual([expect.stringMatching(/design: "Desk" is a desktop screenshot, but this design draws a phone round a phone screenshot/)]);
    expect(await problems(phonePost(photo.id))).toEqual([expect.stringMatching(/design: this design draws a phone round a screenshot of the app, and "Jar" is a photo/)]);
    // the other photo design draws no phone: not judged here (the engine draws the picture as it is)
    expect(await problems(phonePost(d.id, { variant: 1 }))).toEqual([]);
    // a carousel page is named
    const page = await problems({ template: 'carousel', pages: [{ template: 'post', kind: 'statement', headline: 'Hello' }, phonePost(d.id)] });
    expect(page.join(' ')).toMatch(/design page 2: "Desk" is a desktop screenshot/);
    // a classic phone layout still takes only a capture with the phone drawn round it
    const classic = await problems({ template: 'product', headline: 'Every euro, *on record*', image: `design/assets/screens/vault-${b.id}.png`, vaultItemId: b.id, ground: 'cool' });
    expect(classic).toEqual([expect.stringMatching(/"Bare" is a phone screenshot without the phone drawn round it, but this layout shows a phone/)]);
  });
});

describe('a post\'s portrait picture (avatar)', () => {
  it('is a design node: listed, stripped of the app\'s vaultItemId, named, and held to the path rule', async () => {
    const d = quote({ image: 'design/assets/photos/vault-1.jpg', vaultItemId: 'v1', focal: '50% 30%' });
    expect(designNodes(d)).toContainEqual({ image: 'design/assets/photos/vault-1.jpg', vaultItemId: 'v1', focal: '50% 30%' });
    expect((withoutVaultIds(d) as { avatar: unknown }).avatar).toEqual({ image: 'design/assets/photos/vault-1.jpg', focal: '50% 30%' });
    const bad = await designProblems(quote({ image: '../../etc/secret.jpg' }));
    expect(bad.some((p) => /design avatar: image "\.\.\/\.\.\/etc\/secret\.jpg" must be a file under design\/assets\//.test(p))).toBe(true);
    const page = await designProblems({ template: 'carousel', pages: [{ template: 'post', kind: 'statement', headline: 'Hello' }, quote({ image: '/etc/x.jpg' })] });
    expect(page.join(' ')).toMatch(/design page 2 avatar: image "\/etc\/x\.jpg" must be a file under design\/assets\//);
  });

  it('is a photo, never a screen', async () => {
    const api = await admin();
    await useLedger(api);
    const b = await bare();
    const problems = await designProblems(quote({ image: `design/assets/screens/vault-${b.id}.png`, vaultItemId: b.id }), t.deps);
    expect(problems).toEqual([expect.stringMatching(/design avatar: "Bare" is a screen; a portrait picture is a photo/)]);
  });

  it('keeps a post from being approved while its face has no consent recorded, like the post\'s own picture', async () => {
    const face = await item('photo', 'Ama', { peoplePresent: true, consentRecorded: false });
    const agreed = await item('photo', 'Ama agreed', { peoplePresent: true, consentRecorded: true });
    const user = await t.createUser('editor');
    const { posts } = await seedBatch(t, user, { posts: [{ key: 'a', design: quote({ image: `design/assets/photos/vault-${face.id}.png`, vaultItemId: face.id }) }, { key: 'b', design: quote({ image: `design/assets/photos/vault-${agreed.id}.png`, vaultItemId: agreed.id }) }] });
    const api = t.api(await t.signIn(user));
    const a = await api.get(`/api/posts/${posts[0]!.id}`), b = await api.get(`/api/posts/${posts[1]!.id}`);
    expect(a.body.blockers.join(' ')).toMatch(/"Ama" shows people and no consent is recorded/);
    expect(b.body.blockers.join(' ')).not.toMatch(/consent/);
  });
});
