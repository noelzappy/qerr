// Which image options a layout takes, and how a focal point is read. Pure, so it can be tested without the UI kit.
import type { Json, LayoutBrief } from './types';

// Which built-in layouts take what (spec.mjs).
const FRAME = ['object', 'number', 'product', 'myth-fact', 'closing', 'cover', 'text', 'ledger', 'passbook', 'stats', 'screen', 'photo-story'];
const WINDOW = ['object', 'number', 'cover', 'stats', 'photo-story'];
const PICTURE_OPTIONAL = ['number', 'stats'];

export interface Support { frame: boolean; focal: boolean; zoom: boolean; photo: boolean; screen: boolean; glow: boolean }

export function imageOptionsSupport(d: Json, brandLayouts: LayoutBrief[]): Support {
  const t = typeof d.template === 'string' ? d.template : '';
  const hasPicture = Boolean(d.image || d.vaultItemId);
  if (t === 'layout') {
    const l = brandLayouts.find((b) => b.id === d.layout);
    const shows = !!l?.fields.some((f) => f.kind === 'image');
    return { frame: !!l, focal: shows, zoom: shows, photo: false, screen: false, glow: false };
  }
  const window = WINDOW.includes(t) && (!PICTURE_OPTIONAL.includes(t) || hasPicture);
  return { frame: FRAME.includes(t), focal: window || t === 'photo', zoom: window, photo: t === 'photo', screen: t === 'screen', glow: t === 'product' };
}

const KEYWORD: Record<string, number> = { left: 0, right: 100, top: 0, bottom: 100, center: 50 };
const clampPct = (n: number) => Math.min(100, Math.max(0, n));

// A focal point as the design writes it, as percentages. null when it is not a single point (per size, or not understood).
export function focalXY(f: unknown): { x: number; y: number } | null {
  if (Array.isArray(f) && f.length === 2 && f.every((n) => typeof n === 'number')) return { x: clampPct(f[0] as number), y: clampPct(f[1] as number) };
  if (f && typeof f === 'object' && !Array.isArray(f)) {
    const o = f as Json;
    return typeof o.x === 'number' && typeof o.y === 'number' ? { x: clampPct(o.x * 100), y: clampPct(o.y * 100) } : null;
  }
  if (typeof f !== 'string') return null;
  const parts = f.trim().split(/\s+/);
  const one = (p: string, axis: 'x' | 'y'): number | null => {
    if (/^\d{1,3}(\.\d+)?%$/.test(p)) return clampPct(parseFloat(p));
    if (p === 'center') return 50;
    if (axis === 'x' && (p === 'left' || p === 'right')) return KEYWORD[p];
    if (axis === 'y' && (p === 'top' || p === 'bottom')) return KEYWORD[p];
    return null;
  };
  if (parts.length === 1) { const x = one(parts[0], 'x'); const y = one(parts[0], 'y'); return x !== null && parts[0] !== 'top' && parts[0] !== 'bottom' ? { x, y: 50 } : y !== null ? { x: 50, y } : null; }
  if (parts.length === 2) { const x = one(parts[0], 'x'); const y = one(parts[1], 'y'); return x !== null && y !== null ? { x, y } : null; }
  return null;
}

