// The tests run against this checkout's engine and AI library: a second checkout (a git worktree) without its own install
// would otherwise load another checkout's engine through Node's walk up the folders, and its design checks with it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { workspaceLinkProblems } from './engine/root.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vesk-links-'));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
const mk = (dir: string) => { fs.mkdirSync(path.join(tmp, dir), { recursive: true }); fs.writeFileSync(path.join(tmp, dir, 'package.json'), '{}'); };
mk('here/packages/engine'); mk('here/packages/ai'); mk('other/packages/engine');

describe('workspaceLinkProblems', () => {
  it('accepts packages that are this repository\'s own', () => {
    const resolve = (s: string) => path.join(tmp, 'here', 'packages', s.startsWith('@vesk/engine') ? 'engine' : 'ai', 'package.json');
    expect(workspaceLinkProblems(path.join(tmp, 'here'), resolve)).toEqual([]);
  });
  it('names a package that resolves to another checkout, and says how to fix it', () => {
    const resolve = (s: string) => path.join(tmp, s.startsWith('@vesk/engine') ? 'other' : 'here', 'packages', s.startsWith('@vesk/engine') ? 'engine' : 'ai', 'package.json');
    const p = workspaceLinkProblems(path.join(tmp, 'here'), resolve);
    expect(p).toHaveLength(1);
    expect(p[0]).toContain('@vesk/engine resolves to');
    expect(p[0]).toContain('run npm install in this checkout');
  });
  it('holds for the checkout the tests are running in', () => {
    const repo = path.resolve(import.meta.dirname, '..', '..', '..', '..');
    expect(workspaceLinkProblems(repo, (s) => import.meta.resolve(s).replace(/^file:\/\//, ''))).toEqual([]);
  });
});
