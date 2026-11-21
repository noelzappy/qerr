// Whether a vault screen is a pre-framed phone capture or a plain (desktop) screenshot.
//
// The engine decides it from the file: a phone capture has the phone drawn into a transparent picture, so it has an alpha
// channel; a plain screenshot has none (hasAlpha in the engine's design/assets.mjs, the test the renderer uses before it will
// put a picture in a phone layout). The answer is worked out when the file is uploaded and kept on the item (phoneFramed);
// an item that has none yet (a file stored before this column) is read from storage the first time it is needed and kept.
import type { VaultItem } from '@prisma/client';
import type { Deps } from '../deps.js';
import { pipelineEngine } from '../engine/pipeline.js';
import { logger } from '../log.js';

export type Framing = 'phone' | 'desktop';

// The engine's own test of a stored file: 'phone' (it has transparency), 'desktop' (it has none), or null when the header
// cannot tell (a GIF).
export async function framingOfBytes(bytes: Buffer): Promise<Framing | null> {
  const alpha = (await pipelineEngine()).hasAlpha(bytes);
  return alpha === null ? null : alpha ? 'phone' : 'desktop';
}

export const phoneFramedOf = (f: Framing | null): boolean | null => (f === null ? null : f === 'phone');

// What the item's stored value says, without reading anything.
export const framingOfItem = (item: Pick<VaultItem, 'kind' | 'phoneFramed'>): Framing | null => (item.kind !== 'screen' || item.phoneFramed === null || item.phoneFramed === undefined ? null : item.phoneFramed ? 'phone' : 'desktop');

// The framing of a screen item. When it was never worked out the file is read and the answer kept; a file that cannot be read
// leaves it unknown (the renderer still refuses a wrong picture).
export async function screenFraming(deps: Pick<Deps, 'prisma' | 'storage'>, item: VaultItem): Promise<Framing | null> {
  if (item.kind !== 'screen') return null;
  const known = framingOfItem(item);
  if (known || !item.fileKey || item.deletedAt) return known;
  try {
    const framing = await framingOfBytes(await deps.storage.getObject(item.fileKey));
    if (framing) {
      await deps.prisma.vaultItem.update({ where: { id: item.id }, data: { phoneFramed: framing === 'phone' } });
      item.phoneFramed = framing === 'phone';
    }
    return framing;
  } catch (e) {
    logger.warn('vault.screen_framing_unreadable', { itemId: item.id, message: String((e as Error).message).slice(0, 200) });
    return null;
  }
}

// Fills in phoneFramed on every screen item in the list that does not have it yet (the AI catalogue reads it from the items).
export async function ensureScreenFraming(deps: Pick<Deps, 'prisma' | 'storage'>, items: VaultItem[]): Promise<void> {
  for (const item of items) if (item.kind === 'screen' && item.phoneFramed === null) await screenFraming(deps, item);
}
