// The shapes of /api/settings/looks (apps/web/src/server/routes/looks.ts and services/looks.ts) and of the engine's catalogue.
export type Json = Record<string, unknown>;

// One descriptor of the engine's look catalogue (packages/engine/lib/design/look-elements.mjs): what a setting is and its bounds.
export interface Desc {
  kind: 'object' | 'number' | 'enum' | 'bool' | 'list' | 'tuple' | 'tagged' | 'role' | 'text' | string;
  label?: string;
  help?: string;
  props?: Record<string, Desc>;
  required?: string[];
  min?: number; max?: number; step?: number; int?: boolean;
  values?: Array<string | number>;
  of?: Desc;
  items?: Desc[];
  unique?: boolean;
  key?: string;
  forms?: Record<string, Desc>;
  default?: unknown;
}

export interface KindInfo { label: string; help: string; fields: string[]; required: string[] }
export interface FieldInfo { label: string; help: string; type: 'text' | 'items' | 'image'; max?: number; min?: number; chars?: number; emphasis?: boolean }
export interface ElementInfo {
  label: string; group: string; help: string; properties: Record<string, Desc & { group?: string }>;
  placement?: 'required' | 'none'; flow?: boolean; container?: 'any' | 'text' | null; text?: boolean; fitted?: boolean; required?: string[];
  slots?: Record<string, { of: string; label: string; help: string; places: string[] }>;
}
export interface LookCatalogue {
  schema: number;
  limits: Record<string, number>;
  kinds: Record<string, KindInfo>;
  fields: Record<string, FieldInfo>;
  lists: Record<string, unknown[]>;
  elements: Record<string, ElementInfo>;
  sections: Record<string, Desc>;
  // present in the engine's catalogue; optional here so older fixtures still type
  page?: { w: number; h: number };
  common?: Record<string, Desc>;
  place?: { forms: Record<string, Desc>; modifiers: Record<string, Desc> };
  sizeRange?: Record<string, [number, number]>;
  inkOn?: Record<string, string[]>;
}

export interface FontFile { file: string; style: string; weight: string; range: string }
export interface FontFamilyInfo { family: string; minWeight: number; maxWeight: number; italic: boolean; stretch: boolean; files?: FontFile[] }
export interface LookLimits { looks: number; compositions: number; perKind: number; definitionBytes: number }

export interface ShippedSummary { ref: string; source: 'shipped'; id: string; name: string; description: string; readOnly: true; kinds: Record<string, number> }
export interface GateSummary { passed: boolean; at: unknown; stale: boolean }
export interface OwnSummary {
  ref: string; source: 'own'; id: string; slug: string; name: string; description: string; origin: string; status: 'draft' | 'ready' | string;
  gate: GateSummary | null; kinds: Record<string, number>; compositionCount: number; needsAttention: boolean; problems?: string[]; createdAt: string; updatedAt: string;
}
export interface LooksAnswer { activeRef: string | null; shipped: ShippedSummary[]; own: OwnSummary[]; catalogue: LookCatalogue; limits: LookLimits; fonts: FontFamilyInfo[] }

export interface GateCheck { name: string; passed: boolean; message?: string }
export interface GateRecord { engineVersion?: string; definitionHash?: string; at?: string; passed: boolean; checks: GateCheck[] }
export interface Composition {
  id: string; kind: string; position: number; name: string; definition: Json; draft: Json | null; hasDraft: boolean; enabled: boolean; gate: GateRecord | null; updatedAt?: string;
}
export interface BriefVariant { index: number; name: string; describe: string; fields: Record<string, { required: boolean; max?: number; min?: number }>; accepts: unknown[]; marks?: { pills: boolean; icons: boolean } }
export interface Brief { id?: string; name?: string; kinds: Record<string, { variants: BriefVariant[] }> }

export interface OwnDetail extends OwnSummary { definition: Json; gateRecord: GateRecord | null; compositions: Composition[] }
export interface ShippedDetail extends ShippedSummary { definition: Json & { compositions: Json[] }; brief: Brief }
export type LookDetail = OwnDetail | ShippedDetail;
export const isOwn = (l: LookDetail | OwnSummary | ShippedSummary): l is OwnDetail => l.source === 'own';

export interface PreviewSample { kind: string; ok: boolean; image?: string; error?: string; warnings: string[] }
export interface PreviewAnswer { hash: string; samples: PreviewSample[]; superseded?: boolean }
export interface Problem { path: string; message: string }
