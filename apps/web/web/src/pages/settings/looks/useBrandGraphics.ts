// The brand's cut-outs and graphics, for the design editor's piece library (the pieces themselves come in a later step).
// Compact: id, name, role, tintable, size and a short-lived thumbnail address (valid for a few minutes; call reload for fresh ones).
import { api } from '@/api';
import { useLoad } from '@/hooks';

export type GraphicRole = 'cutout' | 'graphic';
export interface BrandGraphic { id: string; name: string; role: GraphicRole; tintable: boolean; w: number | null; h: number | null; status: 'confirmed' | 'unconfirmed'; thumbnailUrl: string | null }

export function useBrandGraphics(role?: GraphicRole) {
  const state = useLoad(() => api.get<{ items: BrandGraphic[] }>(`/api/vault/graphics${role ? `?role=${role}` : ''}`).then((r) => r.items), [role]);
  return { graphics: state.data ?? [], loading: state.loading, error: state.error, reload: state.reload };
}
