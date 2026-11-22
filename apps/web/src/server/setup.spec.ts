// /api/setup: where each step of the guided setup stands, read from what is saved, and the record of steps put off for later.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { markStep, readProgress } from './routes/setup.js';
import { createTestApp, type TestApp } from './testing.js';

let t: TestApp;
beforeAll(async () => { t = await createTestApp(); });
afterAll(() => t.close());
beforeEach(async () => { await t.reset(); });

describe('setup status', () => {
  it('is for admins only', async () => {
    expect((await t.api().get('/api/setup')).status).toBe(401);
    const { api } = await t.signedIn('editor');
    expect((await api.get('/api/setup')).status).toBe(403);
    expect((await api.put('/api/setup/progress', { left: true })).status).toBe(403);
  });

  it('starts with nothing saved, and follows what each step saves through its own route', async () => {
    const { api } = await t.signedIn('admin');
    const first = await api.get('/api/setup');
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      brandSaved: false,
      steps: { brand: { done: false }, logo: { done: false }, look: { done: false, activeRef: null }, channels: { done: false }, ai: { done: false, missing: 'provider' }, batch: { done: false } },
      progress: { done: [], skipped: [], left: false, finished: false },
    });

    // Step 1 saves the brand through Settings, Brand.
    const brand = await api.get('/api/settings/brand');
    expect((await api.put('/api/settings/brand', { ...brand.body.settings, name: 'Fernhill Bakery', website: 'fernhill.example', tagline: 'Bread every morning' })).status).toBe(200);
    // Step 5 saves the budget through Settings, AI (a provider needs a key, which a test never holds).
    expect((await api.put('/api/settings/ai/budget', { monthlyBudgetUsd: 25 })).status).toBe(200);
    const after = await api.get('/api/setup');
    expect(after.body.brandSaved).toBe(true);
    expect(after.body.steps.brand.done).toBe(true);
    expect(after.body.steps.ai).toMatchObject({ done: false, missing: 'provider' });
    // Every saved brand starts on a look, but the step counts only once it was chosen here.
    expect(after.body.steps.look.done).toBe(false);
  });

  it('records a step done or put off for later, and the whole setup left or finished', async () => {
    const { api } = await t.signedIn('admin');
    let r = await api.put('/api/setup/progress', { step: 'logo', state: 'skipped' });
    expect(r.status).toBe(200);
    expect(r.body.progress).toMatchObject({ skipped: ['logo'], done: [] });
    r = await api.put('/api/setup/progress', { step: 'look', state: 'done' });
    expect(r.body.steps.look.done).toBe(true);
    r = await api.put('/api/setup/progress', { step: 'logo', state: 'done' });
    expect(r.body.progress).toMatchObject({ skipped: [], done: ['look', 'logo'] });
    r = await api.put('/api/setup/progress', { left: true });
    expect(r.body.progress.left).toBe(true);
    r = await api.put('/api/setup/progress', { finished: true });
    expect(r.body.progress).toMatchObject({ left: true, finished: true });
    // It survives: a reload reads the same record.
    expect((await api.get('/api/setup')).body.progress).toEqual({ done: ['look', 'logo'], skipped: [], left: true, finished: true });
  });

  it('refuses unknown steps and states', async () => {
    const { api } = await t.signedIn('admin');
    expect((await api.put('/api/setup/progress', { step: 'team', state: 'done' })).status).toBe(400);
    expect((await api.put('/api/setup/progress', { step: 'logo', state: 'maybe' })).status).toBe(400);
    expect((await api.put('/api/setup/progress', { left: false })).status).toBe(400);
    expect((await api.put('/api/setup/progress', {})).status).toBe(400);
  });
});

describe('the stored record', () => {
  it('is read defensively', () => {
    expect(readProgress(null)).toEqual({ done: [], skipped: [], left: false, finished: false });
    expect(readProgress({ done: ['logo', 'logo', 'evil', 3], skipped: 'ai', left: 'yes', finished: true })).toEqual({ done: ['logo'], skipped: [], left: false, finished: true });
  });
  it('moves a step between done and skipped', () => {
    const p = markStep(readProgress(null), 'ai', 'skipped');
    expect(markStep(p, 'ai', 'done')).toMatchObject({ done: ['ai'], skipped: [] });
  });
});
