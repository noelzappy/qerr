// The calls of the Looks pages (routes in apps/web/src/server/routes/looks.ts), in one place.
import { api } from '../../../api';
import { refreshActiveLook } from '@/hooks/use-active-look';
import { resetPostKindsCache } from '../../batches/editor/use-post-kinds';
import type { AddDesignPlan, AddDesignResult, AddedDesign, GateRecord, LookDetail, LooksAnswer, OwnDetail, Json, Problem } from './look-types';

const B = '/api/settings/looks';
const body = <T,>(p: Promise<{ look: T }>) => p.then((r) => r.look);

export const lookApi = {
  list: () => api.get<LooksAnswer>(B),
  get: (ref: string) => body(api.get<{ look: LookDetail }>(`${B}/${ref}`)),
  duplicate: (source: string, name?: string) => body(api.post<{ look: OwnDetail }>(`${B}/duplicate`, { source, ...(name ? { name } : {}) })),
  // A look started blank (the engine's starter: one plain design of every kind in the brand's own fonts and colours).
  blank: (name: string) => body(api.post<{ look: OwnDetail }>(`${B}/blank`, { name })),
  // "Add to my look": what it would do (nothing stored), then do it.
  planAdd: (source: string, kind: string, index: number, replace?: number | null, signal?: AbortSignal) =>
    api.post<AddDesignPlan>(`${B}/add-design/plan`, { source, kind, index, ...(replace !== undefined && replace !== null ? { replace } : {}) }, signal),
  addToActive: (input: { source: string; kind: string; index: number; replace?: number | null; copy?: boolean; use?: boolean }) =>
    api.post<AddDesignResult>(`${B}/add-design`, { source: input.source, kind: input.kind, index: input.index, ...(input.replace !== undefined && input.replace !== null ? { replace: input.replace } : {}), ...(input.copy ? { copy: true } : {}), ...(input.use ? { use: true } : {}) }),
  remove: (slug: string) => api.delete<{ ok: true }>(`${B}/${slug}`),
  use: (ref: string | null) => api.put<{ activeRef: string | null }>(`${B}/active`, { ref }),
  // What the engine says about a whole definition, nothing stored (Fine-tune checks a number before it writes it).
  validate: (definition: Json, signal?: AbortSignal) => api.post<{ problems: Problem[] }>(`${B}/validate`, { definition }, signal),
  saveSettings: (slug: string, definition: Json) => body(api.put<{ look: OwnDetail }>(`${B}/${slug}/settings`, { definition })),
  addDesign: (slug: string, source: string, kind: string, index: number) => api.post<{ look: OwnDetail; added: AddedDesign }>(`${B}/${slug}/compositions`, { source, kind, index }),
  addBlankDesign: (slug: string, kind: string) => api.post<{ look: OwnDetail; added: AddedDesign }>(`${B}/${slug}/compositions/blank`, { kind }),
  enableDesign: (slug: string, id: string, enabled: boolean) => body(api.patch<{ look: OwnDetail }>(`${B}/${slug}/compositions/${id}`, { enabled })),
  moveDesign: (slug: string, id: string, position: number) => body(api.patch<{ look: OwnDetail }>(`${B}/${slug}/compositions/${id}`, { position })),
  removeDesign: (slug: string, id: string) => body(api.delete<{ look: OwnDetail }>(`${B}/${slug}/compositions/${id}`)),
  // The design editor: validate a draft as it is edited, save it as the design's draft, publish it, discard it.
  validateDraft: (slug: string, id: string, definition: Json, signal?: AbortSignal) => api.post<{ problems: Problem[] }>(`${B}/${slug}/compositions/${id}/validate`, { definition }, signal),
  saveDraft: (slug: string, id: string, definition: Json) => body(api.put<{ look: OwnDetail }>(`${B}/${slug}/compositions/${id}/draft`, { definition })),
  discardDraft: (slug: string, id: string) => body(api.delete<{ look: OwnDetail }>(`${B}/${slug}/compositions/${id}/draft`)),
  publishDesign: (slug: string, id: string) => body(api.post<{ look: OwnDetail }>(`${B}/${slug}/compositions/${id}/publish`)),
  publish: (slug: string) => body(api.post<{ look: OwnDetail }>(`${B}/${slug}/publish`)),
  gate: (slug: string) => api.post<{ record?: GateRecord }>(`${B}/${slug}/gate`),
};

// What changes when the brand's look does: the menu entry for Classic layouts, and the post editor's kinds and budgets.
export function afterLookChange(): void {
  resetPostKindsCache();
  refreshActiveLook();
}
