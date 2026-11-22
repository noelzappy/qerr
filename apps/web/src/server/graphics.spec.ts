// Brand graphics and cut-outs in the picture library: the role an item is made with, the file rules for each role (checked
// before an item is made and again when its file is stored), the counts behind the Pictures page's switch and its filter.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './testing.js';

let t: TestApp;
beforeAll(async () => { t = await createTestApp(); });
afterAll(() => t.close());
beforeEach(() => t.reset());

// A PNG header (signature, IHDR, IEND): enough for the header checks, which never decode pixels. Colour type 6 is RGBA, 2 is RGB.
function png(width: number, height: number, colourType: 2 | 6): Buffer {
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write('IHDR', 4, 'latin1');
  ihdr.writeUInt32BE(width, 8);
  ihdr.writeUInt32BE(height, 12);
  ihdr[16] = 8;
  ihdr[17] = colourType;
  const iend = Buffer.concat([Buffer.alloc(4), Buffer.from('IEND', 'latin1'), Buffer.alloc(4)]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ihdr, iend]);
}
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 2)]);
const form = (bytes: Buffer, name: string, type = 'image/png') => {
  const f = new FormData();
  f.set('file', new File([new Uint8Array(bytes)], name, { type }));
  return f;
};
const picture = (role: 'photo' | 'cutout' | 'graphic', title: string) => ({ kind: 'photo', title, body: '', role, licence: 'own', licenceNotes: 'Made by us' });

async function editor() {
  return t.api(await t.signIn(await t.createUser('editor')));
}

describe('graphics: file check before an item is made', () => {
  it('refuses for a cut-out or graphic what the stored upload would refuse, in the same words, and stores nothing', async () => {
    const api = await editor();
    const opaque = await api.post('/api/vault/file-check?role=cutout', form(png(400, 300, 2), 'flat.png'));
    expect(opaque.status).toBe(415);
    expect(opaque.body.message ?? opaque.body.error).toContain('has no transparency');
    const tiny = await api.post('/api/vault/file-check?role=graphic', form(png(100, 100, 6), 'tiny.png'));
    expect(tiny.status).toBe(415);
    expect(tiny.body.message ?? tiny.body.error).toContain('at least 256 px');
    const jpg = await api.post('/api/vault/file-check?role=graphic', form(JPG, 'a.jpg', 'image/jpeg'));
    expect(jpg.status).toBe(415);
    expect((await api.post('/api/vault/file-check?role=cutout', form(png(400, 400, 6), 'clear.png'))).body).toMatchObject({ ok: true, type: 'image/png', width: 400, height: 400 });
    // A photo takes any picture, opaque or not.
    expect((await api.post('/api/vault/file-check', form(JPG, 'a.jpg', 'image/jpeg'))).status).toBe(200);
    expect((await api.post('/api/vault/file-check?role=photo', form(png(400, 300, 2), 'flat.png'))).status).toBe(200);
    expect(await t.prisma.vaultItem.count()).toBe(0);
    expect((await t.api().post('/api/vault/file-check', form(JPG, 'a.jpg', 'image/jpeg'))).status).toBe(401);
  });
});

describe('graphics: items by role', () => {
  it('stores a transparent cut-out with its size, refuses an opaque file for it, and lists and counts items by role', async () => {
    const api = await editor();
    const cut = (await api.post('/api/vault', picture('cutout', 'Person waving'))).body.item;
    expect(cut.role).toBe('cutout');
    expect((await api.post(`/api/vault/${cut.id}/file`, form(png(400, 300, 2), 'flat.png'))).status).toBe(415);
    const stored = await api.post(`/api/vault/${cut.id}/file`, form(png(500, 800, 6), 'person.png'));
    expect(stored.status).toBe(200);
    expect(await t.prisma.vaultItem.findUniqueOrThrow({ where: { id: cut.id } })).toMatchObject({ role: 'cutout', width: 500, height: 800, contentType: 'image/png' });

    const sticker = (await api.post('/api/vault', { ...picture('graphic', 'Star sticker'), tintable: true })).body.item;
    expect((await api.post(`/api/vault/${sticker.id}/file`, form(png(320, 320, 6), 'star.png'))).status).toBe(200);
    const photo = (await api.post('/api/vault', { ...picture('photo', 'Market'), body: 'A street market.' })).body.item;
    expect((await api.post(`/api/vault/${photo.id}/file`, form(JPG, 'market.jpg', 'image/jpeg'))).status).toBe(200);

    expect((await api.get('/api/vault/counts')).body).toMatchObject({ photo: 1, cutout: 1, graphic: 1 });
    const cutouts = (await api.get('/api/vault?role=cutout')).body.items;
    expect(cutouts.map((i: { id: string }) => i.id)).toEqual([cut.id]);
    const graphics = (await api.get('/api/vault/graphics')).body;
    const listed = (graphics.items ?? graphics).map((i: { id: string; role: string }) => [i.id, i.role]);
    expect(listed).toEqual(expect.arrayContaining([[cut.id, 'cutout'], [sticker.id, 'graphic']]));
    expect(listed).toHaveLength(2);
  });

  it('keeps the role for pictures only, and recolouring for graphics only', async () => {
    const api = await editor();
    expect((await api.post('/api/vault', { kind: 'fact', title: 'A fact', body: 'x', role: 'graphic' })).status).toBe(422);
    const cut = (await api.post('/api/vault', picture('cutout', 'Person'))).body.item;
    expect((await api.patch(`/api/vault/${cut.id}`, { tintable: true })).status).toBe(422);
    const photo = (await api.post('/api/vault', { ...picture('photo', 'Plain'), tintable: true })).body.item;
    expect(photo.tintable).toBe(false);
  });
});
