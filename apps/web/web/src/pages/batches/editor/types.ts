// What the post editor's pieces share: the shapes they pass around and what each built-in layout takes.

// The brand's own layouts, as GET /api/layouts lists them: what a post fills in for each.
export interface LayoutBrief {
  id: string;
  name: string;
  description: string | null;
  sizes: string[];
  fields: Array<{ name: string; kind: string; required: boolean; max: number | null; min: number | null; word: string }>;
}

// A design, or one page of a carousel.
export type Json = Record<string, unknown>;

// The words a person sees for the design fields, by the name the design block uses.
export const FIELD_LABEL: Record<string, string> = {
  headline: 'Headline', sub: 'Sub line', line: 'Line', quote: 'Quotation', myth: 'Myth', factLead: 'Fact (headline)', fact: 'Fact explained',
  big: 'Big figure', label: 'Label', eyebrow: 'Small label above the headline', note: 'Note', title: 'Window title', stats: 'Figures', items: 'Points',
};

// Which design fields each built-in layout takes (spec.mjs, checkOne). The form shows exactly these.
//   text:   a text box ('headline' and 'sub' are multi-line)
//   short:  a one-line text
//   stats:  the figures editor (number|label rows)
//   pills / checks: lists of short one-line texts
//   artefact: the table or card of a Text layout
//   table:  a ledger table that is the page itself (columns, rows, marks, notes)
//   passbook: a passbook page that is the page itself (days, ticked, today, tick, member card)
//   picture: the picture chooser (image + vaultItemId)
export type FieldKind = 'headline' | 'text' | 'short' | 'stats' | 'pills' | 'checks' | 'artefact' | 'table' | 'passbook' | 'picture';
export interface FieldSpec { name: string; kind: FieldKind; required?: boolean; label?: string; hint?: string; max?: number }

export const TEMPLATE_FIELDS: Record<string, FieldSpec[]> = {
  object: [{ name: 'headline', kind: 'headline', required: true }, { name: 'sub', kind: 'text' }, { name: 'image', kind: 'picture', required: true }],
  number: [{ name: 'big', kind: 'short', required: true, max: 40, hint: 'One big figure, such as 14.8M+.' }, { name: 'line', kind: 'text', max: 80, hint: 'A line under the figure.' }, { name: 'stats', kind: 'stats' }, { name: 'image', kind: 'picture' }],
  product: [{ name: 'headline', kind: 'headline', required: true }, { name: 'sub', kind: 'text' }, { name: 'image', kind: 'picture', required: true }],
  cover: [{ name: 'headline', kind: 'headline', required: true }, { name: 'sub', kind: 'text' }, { name: 'image', kind: 'picture', required: true }],
  text: [{ name: 'headline', kind: 'headline', required: true }, { name: 'sub', kind: 'text' }, { name: 'artefact', kind: 'artefact' }],
  ledger: [{ name: 'headline', kind: 'headline', required: true }, { name: 'sub', kind: 'text' }, { name: 'table', kind: 'table', required: true }],
  passbook: [{ name: 'headline', kind: 'headline', required: true }, { name: 'sub', kind: 'text' }, { name: 'passbook', kind: 'passbook', required: true }],
  'myth-fact': [{ name: 'myth', kind: 'text', required: true, label: 'Myth' }, { name: 'factLead', kind: 'text', required: true, label: 'Fact (headline)' }, { name: 'fact', kind: 'text', label: 'Fact explained' }],
  stats: [{ name: 'big', kind: 'short', required: true, max: 40, hint: 'One big figure, such as 14.8M+.' }, { name: 'line', kind: 'text', max: 80, hint: 'A line under the figure.' }, { name: 'stats', kind: 'stats' }, { name: 'image', kind: 'picture' }],
  screen: [{ name: 'headline', kind: 'headline', required: true }, { name: 'sub', kind: 'text' }, { name: 'image', kind: 'picture', required: true }, { name: 'pills', kind: 'pills', label: 'Pills' }, { name: 'checks', kind: 'checks', label: 'Tick list' }],
  'photo-story': [{ name: 'headline', kind: 'headline', required: true }, { name: 'sub', kind: 'text' }, { name: 'image', kind: 'picture', required: true }],
  closing: [{ name: 'headline', kind: 'headline' }, { name: 'line', kind: 'short', max: 60 }],
  photo: [{ name: 'headline', kind: 'headline', required: true }, { name: 'sub', kind: 'text' }, { name: 'eyebrow', kind: 'short', max: 60 }, { name: 'image', kind: 'picture', required: true }],
};

// Design keys the form never shows for a built-in layout, so they stay in "Advanced" (the design as JSON) only: scrimPeak, lines, align,
// photoTop, phoneTop, size, dots, headRight, sizes, networkSizes, name, tilt, region, beside, layout (poster/story variants), map,
// mark and notes of a ledger beyond the editor, and any value set per size. focal, zoom, ground, accent, textAt, scrim, device,
// framed, glow, fade and title are in "Image options" (ImageOptions.tsx) for the layouts that take them.
