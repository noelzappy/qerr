// The guided first setup's rules, kept apart from the screens so they can be tested: the steps and their order, where a person
// lands and where they pick up again, what the first save of the brand keeps from the example brand, the typing kept across a
// reload, and how an AI suggestion fills the form without overwriting what a person typed.
import type { BrandSettings } from '../settings/brand-types';

export const STEPS = [
  { key: 'brand', title: 'Your brand', skippable: false },
  { key: 'logo', title: 'Your logo', skippable: true },
  { key: 'look', title: 'Your look', skippable: false },
  { key: 'channels', title: 'Channels', skippable: true },
  { key: 'ai', title: 'AI', skippable: true },
  { key: 'batch', title: 'First batch', skippable: false },
] as const;
export type StepKey = (typeof STEPS)[number]['key'];

export const isStep = (v: string | undefined): v is StepKey => STEPS.some((s) => s.key === v);
export const stepPath = (k: StepKey) => `/setup/${k}`;
export const stepIndex = (k: StepKey) => STEPS.findIndex((s) => s.key === k);
export const stepOf = (k: StepKey) => STEPS[stepIndex(k)]!;
export const nextStep = (k: StepKey): StepKey | null => STEPS[stepIndex(k) + 1]?.key ?? null;
export const prevStep = (k: StepKey): StepKey | null => (stepIndex(k) > 0 ? STEPS[stepIndex(k) - 1]!.key : null);

// GET /api/setup (apps/web/src/server/routes/setup.ts).
export interface SetupProgress { done: StepKey[]; skipped: StepKey[]; left: boolean; finished: boolean }
export interface SetupStatus {
  brandSaved: boolean;
  steps: {
    brand: { done: boolean };
    logo: { done: boolean };
    look: { done: boolean; activeRef: string | null };
    channels: { done: boolean; accounts: number; routes: number };
    ai: { done: boolean; missing: 'provider' | 'budget' | null; providers: number };
    batch: { done: boolean };
  };
  progress: SetupProgress;
}

export const isComplete = (s: SetupStatus, k: StepKey): boolean => s.steps[k].done;

// Where a person picks up: the first step that is neither done nor put off for later. Nothing works without a brand, so an
// unsaved brand always comes first. With every step settled, the last one (the first batch) is where the setup ends.
export function resumeStep(s: SetupStatus): StepKey {
  if (!s.brandSaved) return 'brand';
  return STEPS.find((x) => !isComplete(s, x.key) && !s.progress.skipped.includes(x.key))?.key ?? 'batch';
}

// After signing in, an admin whose brand was never saved lands on the setup, unless they left it for later or finished it.
// Editors never do: they cannot change settings.
export function shouldLandOnSetup(role: string | undefined, s: SetupStatus | null): boolean {
  if (role !== 'admin' || !s) return false;
  return !s.brandSaved && !s.progress.left && !s.progress.finished;
}

// The steps of Home's checklist that the setup covers open the matching step; the others (facts, team) keep their own page.
const HOME_TO_SETUP: Record<string, StepKey> = { brand: 'brand', logo: 'logo', channels: 'channels', ai: 'ai', batch: 'batch' };
export const setupLinkForHomeStep = (key: string, fallback: string): string => (HOME_TO_SETUP[key] ? stepPath(HOME_TO_SETUP[key]) : fallback);

// The progress line's state of each step, for the indicator.
export type StepState = 'done' | 'current' | 'skipped' | 'todo';
export function stepStates(s: SetupStatus | null, current: StepKey): Record<StepKey, StepState> {
  const out = {} as Record<StepKey, StepState>;
  for (const x of STEPS) {
    out[x.key] = x.key === current ? 'current'
      : s && isComplete(s, x.key) ? 'done'
      : s && s.progress.skipped.includes(x.key) ? 'skipped' : 'todo';
  }
  return out;
}

// ---- step 1: the brand ------------------------------------------------------------------------------------------------

// What a person types on the first step. `suggested` names the fields the AI filled (and nobody has typed in since), so a later
// suggestion may replace them and the page can mark them; `colours` are the website's colours, offered on the logo step.
export interface BrandDraft {
  name: string; website: string; tagline: string; descriptor: string; voice: string; timezone: string; language: string;
  suggested: Array<'tagline' | 'descriptor' | 'voice'>;
  colours: string[];
}
export const DRAFT_TEXT = ['name', 'website', 'tagline', 'descriptor', 'voice', 'timezone', 'language'] as const;

export function emptyDraft(timezone: string, language: string): BrandDraft {
  return { name: '', website: '', tagline: '', descriptor: '', voice: '', timezone, language, suggested: [], colours: [] };
}

// The draft a saved brand gives: the words it has, for editing them again.
export function draftFromSettings(s: BrandSettings): BrandDraft {
  return { name: s.name, website: s.website, tagline: s.tagline, descriptor: s.descriptor, voice: s.voice, timezone: s.timezone, language: s.language, suggested: [], colours: [] };
}

// A person typed in a field: it is theirs from now on, so no suggestion replaces it.
export function typeInDraft(d: BrandDraft, field: (typeof DRAFT_TEXT)[number], value: string): BrandDraft {
  return { ...d, [field]: value, suggested: d.suggested.filter((f) => f !== field) };
}

// Typing survives a reload (sessionStorage: this tab only, gone when it closes). Nothing secret is ever in it.
export const DRAFT_KEY = 'qerr.setup.brand';
type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const HEX = /^#[0-9a-f]{6}$/i;
export function saveDraft(store: KV | null, d: BrandDraft): void {
  try { store?.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* storage full or blocked: the form still works */ }
}
export function loadDraft(store: KV | null): BrandDraft | null {
  let raw: unknown;
  try { raw = JSON.parse(store?.getItem(DRAFT_KEY) ?? 'null'); } catch { return null; }
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const text = (k: string, max: number) => (typeof o[k] === 'string' ? (o[k] as string).slice(0, max) : '');
  return {
    name: text('name', 80), website: text('website', 120), tagline: text('tagline', 160), descriptor: text('descriptor', 200), voice: text('voice', 4000),
    timezone: text('timezone', 60), language: text('language', 60),
    suggested: Array.isArray(o.suggested) ? o.suggested.filter((f): f is BrandDraft['suggested'][number] => f === 'tagline' || f === 'descriptor' || f === 'voice') : [],
    colours: Array.isArray(o.colours) ? o.colours.filter((c): c is string => typeof c === 'string' && HEX.test(c)).slice(0, 8) : [],
  };
}
export function clearDraft(store: KV | null): void {
  try { store?.removeItem(DRAFT_KEY); } catch { /* nothing to clear */ }
}

// The website's colours, kept after the brand is saved so the logo step can offer them beside the logo's own.
export const SITE_COLOURS_KEY = 'qerr.setup.siteColours';
export function saveSiteColours(store: KV | null, colours: string[]): void {
  try { if (colours.length) store?.setItem(SITE_COLOURS_KEY, JSON.stringify(colours)); } catch { /* optional */ }
}
export function loadSiteColours(store: KV | null): string[] {
  try {
    const v = JSON.parse(store?.getItem(SITE_COLOURS_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((c): c is string => typeof c === 'string' && HEX.test(c)).slice(0, 8) : [];
  } catch { return []; }
}
// The tab's sessionStorage, or null where the browser refuses it.
export function sessionStore(): KV | null {
  try { return typeof window !== 'undefined' ? window.sessionStorage : null; } catch { return null; }
}

// The website as posts print it: no scheme, no "www." kept as typed, no trailing slash.
export const cleanWebsite = (v: string) => v.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');

// POST /api/suggest/brand-from-site answers { descriptor?, tagline?, voice?, colours? }. Read defensively: only strings, cut to
// what the brand form accepts, and colours as #RRGGBB whether they come as a list or as named roles.
export interface BrandSuggestion { tagline?: string; descriptor?: string; voice?: string; colours: string[] }
export function readSuggestion(raw: unknown): BrandSuggestion {
  const o = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const text = (k: string, max: number) => (typeof o[k] === 'string' && (o[k] as string).trim() ? (o[k] as string).trim().slice(0, max) : undefined);
  const c = o.colours;
  const list = Array.isArray(c) ? c : c && typeof c === 'object' ? Object.values(c as object) : [];
  const colours = [...new Set(list.filter((x): x is string => typeof x === 'string' && HEX.test(x.trim())).map((x) => x.trim().toUpperCase()))].slice(0, 8);
  return { tagline: text('tagline', 160), descriptor: text('descriptor', 200), voice: text('voice', 4000), colours };
}

// A suggestion fills a field only when it is empty or still holds an earlier suggestion; what a person typed stays.
export function applySuggestion(d: BrandDraft, s: BrandSuggestion): { draft: BrandDraft; filled: Array<BrandDraft['suggested'][number]> } {
  const next = { ...d, suggested: [...d.suggested] };
  const filled: Array<BrandDraft['suggested'][number]> = [];
  for (const k of ['tagline', 'descriptor', 'voice'] as const) {
    const v = s[k];
    if (!v) continue;
    if (d[k].trim() && !d.suggested.includes(k)) continue;
    next[k] = v;
    if (!next.suggested.includes(k)) next.suggested.push(k);
    filled.push(k);
  }
  if (s.colours.length) next.colours = s.colours;
  return { draft: next, filled };
}

// The first save of the brand: until then the form holds the example brand. Its words (tagline, description, voice, spellings,
// currency, post types and their names, colour roles set one by one) belong to that example and are not carried over; its colours,
// type and shapes are a neutral start that the logo and look steps change. A brand that was saved before keeps everything except
// the fields this step edits.
export function brandSettingsFor(base: BrandSettings, d: BrandDraft, firstSave: boolean): BrandSettings {
  const words = { name: d.name.trim(), website: cleanWebsite(d.website), tagline: d.tagline.trim(), descriptor: d.descriptor.trim(), voice: d.voice.trim(), timezone: d.timezone, language: d.language };
  if (!firstSave) return { ...base, ...words };
  return {
    ...base, ...words,
    money: null,
    spellings: [],
    series: [{ key: 'posts', name: 'Posts', ground: 'light', accent: 'muted' }],
    roles: { grounds: {}, text: {}, accents: {}, surfaces: {}, slabs: {} },
    visualDirection: '',
  };
}

// What the browser says about where and in which language the person works; both stay editable.
export function detectZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}
export const LANGUAGES = ['British English', 'American English', 'Australian English', 'Canadian English', 'French', 'German', 'Spanish', 'Portuguese', 'Dutch', 'Italian'];
export function languageFor(tag: string | undefined): string {
  const t = (tag ?? '').toLowerCase();
  const region = t.split('-')[1] ?? '';
  if (t.startsWith('en')) return region === 'us' ? 'American English' : region === 'au' ? 'Australian English' : region === 'ca' ? 'Canadian English' : 'British English';
  const byLang: Record<string, string> = { fr: 'French', de: 'German', es: 'Spanish', pt: 'Portuguese', nl: 'Dutch', it: 'Italian' };
  return byLang[t.split('-')[0] ?? ''] ?? 'British English';
}

// ---- step 3: the look ------------------------------------------------------------------------------------------------

export const DEFAULT_LOOK = 'shipped:clean';
// The look shown as chosen: the one in use, else Clean, else the first one shipped.
export function initialLook(activeRef: string | null, shipped: Array<{ ref: string }>): string | null {
  if (activeRef) return activeRef;
  return shipped.find((l) => l.ref === DEFAULT_LOOK)?.ref ?? shipped[0]?.ref ?? null;
}

// ---- step 5: AI -------------------------------------------------------------------------------------------------------

// The choices behind "Model": the model id and its prices (US dollars per million tokens) follow the choice, so nobody types
// them. Exact values stay editable under Fine-tune. One table for the setup and Settings, AI (lib/ai-presets.ts).
export { ANTHROPIC_MODELS } from '../../lib/ai-presets';
export { BUDGET_PRESETS, DEFAULT_BUDGET } from '../../lib/ai-presets';

// The provider body the setup sends (the same POST /api/settings/ai/providers as Settings, AI).
export function providerBody(o: { kind: 'anthropic' | 'openai-compatible'; apiKey: string; model: string; baseUrl?: string; input: number | null; output: number | null }) {
  return {
    name: o.kind === 'anthropic' ? 'Anthropic' : 'AI provider',
    kind: o.kind,
    model: o.model.trim(),
    apiKey: o.apiKey.trim(),
    tasks: ['draft', 'rewrite', 'research'],
    enabled: true,
    inputPricePerMTok: o.input,
    outputPricePerMTok: o.output,
    ...(o.baseUrl?.trim() ? { baseUrl: o.baseUrl.trim() } : {}),
  };
}

// A budget typed as Custom: a number of dollars above zero, else null.
export function readBudget(v: string): number | null {
  const n = Number(v.trim().replace(/^\$/, ''));
  return Number.isFinite(n) && n > 0 && n <= 1_000_000 ? Math.round(n * 100) / 100 : null;
}

// ---- step 6: the first batch ------------------------------------------------------------------------------------------

// Why "Draft my first month with AI" cannot run yet, or null when it can.
export function aiDraftBlocker(missing: 'provider' | 'budget' | null): string | null {
  if (missing === 'provider') return 'Add an AI provider first.';
  if (missing === 'budget') return 'Set a monthly budget first.';
  return null;
}
