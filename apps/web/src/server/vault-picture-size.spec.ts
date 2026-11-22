// Every picture's pixel size is read from its header before it is stored, whatever its role: a small file that claims a huge canvas (a
// decompression bomb) would make the renderer's Chrome decode gigabytes of pixels for one post. A photo has a ceiling far above any camera's.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './testing.js';

let t: TestApp;
beforeAll(async () => { t = await createTestApp(); });
afterAll(() => t.close());
beforeEach(() => t.reset());

// A PNG header (signature, IHDR, IEND): the header checks never decode pixels. Colour type 2 is RGB.
function png(width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write('IHDR', 4, 'latin1');
  ihdr.writeUInt32BE(width, 8);
  ihdr.writeUInt32BE(height, 12);
  ihdr[16] = 8;
  ihdr[17] = 2;
  const iend = Buffer.concat([Buffer.alloc(4), Buffer.from('IEND', 'latin1'), Buffer.alloc(4)]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ihdr, iend]);
}
// A baseline JPEG's start of frame (SOF0) with the given size.
function jpeg(width: number, height: number): Buffer {
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), sof, Buffer.alloc(32, 0), Buffer.from([0xff, 0xd9])]);
}
const form = (bytes: Buffer, name: string, type: string) => {
  const f = new FormData();
  f.set('file', new File([new Uint8Array(bytes)], name, { type }));
  return f;
};

describe('vault pictures: a size ceiling for every role', () => {
  it('refuses a photo whose header claims a canvas no camera makes, and stores nothing', async () => {
    const api = t.api(await t.signIn(await t.createUser('editor')));
    const bomb = await api.post('/api/vault/file-check?role=photo', form(png(60000, 60000), 'bomb.png', 'image/png'));
    expect(bomb.status).toBe(415);
    expect(bomb.body.message ?? bomb.body.error).toMatch(/larger than/);
    expect((await api.post('/api/vault/file-check', form(jpeg(65000, 65000), 'bomb.jpg', 'image/jpeg'))).status).toBe(415);
    const item = await api.post('/api/vault', { kind: 'photo', title: 'Wide', body: '', licence: 'own', licenceNotes: 'Made by us' });
    expect(item.status).toBe(201);
    const stored = await api.post(`/api/vault/${item.body.item.id}/file`, form(png(20000, 20000), 'wide.png', 'image/png'));
    expect(stored.status).toBe(415);
    expect((await t.prisma.vaultItem.findUniqueOrThrow({ where: { id: item.body.item.id } })).fileKey).toBeNull();
    // an ordinary large photo is fine
    expect((await api.post('/api/vault/file-check', form(png(8192, 5464), 'camera.png', 'image/png'))).status).toBe(200);
  });
});
