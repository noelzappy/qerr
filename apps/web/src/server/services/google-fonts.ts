// Google Fonts for the type roles (Settings, Brand and look, Type), from a curated list, with no API key.
//
// An admin picks a family from GOOGLE_FONTS for a type role. The server works out which weights the role is drawn at (the
// engine's familyWeights; of the weights the family has, the nearest stands in for one it lacks), asks the Google Fonts CSS API
// once for the family at those weights, keeps the latin and latin-ext faces of each, downloads those woff2 files from
// fonts.gstatic.com (each file once: a variable family sends the same file for every weight) and stores them like an uploaded
// font, each with the weights it draws (routes/brand.ts). Nothing contacts Google when a post is rendered or a page is viewed:
// the render page blocks every request and embeds the stored files as data: URIs, and the web app's CSP allows fonts from
// itself only.
//
// No URL is ever built from what the browser sent: the family must be one of the list (whose names are checked by the test to
// be plain letters, digits and spaces) and the weights ones it offers. The files may come from fonts.gstatic.com only, over
// https, with no redirect, under a size limit per file and for all of them together, and must start with the woff2 signature.
//
// Every family, its category's weights and its licence were checked against Google Fonts (the css2 API answering for every
// weight listed, with latin and latin-ext faces, and the licence in the google/fonts repository) on 2026-11-21. Weights above
// 900 are left out (the engine's type weights stop at 900). Big Shoulders is the family once called Big Shoulders Display.

export const GOOGLE_FONT_CATEGORIES = ['sans', 'serif', 'display', 'condensed', 'mono', 'handwriting'] as const;
export type GoogleFontCategory = (typeof GOOGLE_FONT_CATEGORIES)[number];
export type GoogleFontLicence = 'OFL-1.1' | 'Apache-2.0';

export interface GoogleFont {
  family: string;
  category: GoogleFontCategory;
  weights: readonly number[];
  licence: GoogleFontLicence;
  note: string;
}

const ALL = [100, 200, 300, 400, 500, 600, 700, 800, 900];
const from = (lo: number, hi: number) => ALL.filter((w) => w >= lo && w <= hi);
const f = (family: string, category: GoogleFontCategory, weights: readonly number[], note: string, licence: GoogleFontLicence = 'OFL-1.1'): GoogleFont => ({ family, category, weights, licence, note });

export const GOOGLE_FONTS: readonly GoogleFont[] = [
  // sans
  f('Inter', 'sans', ALL, 'The built-in face: neutral, very legible screen sans for text and headlines.'),
  f('Manrope', 'sans', from(200, 800), 'Geometric with soft corners; modern and friendly at every size.'),
  f('DM Sans', 'sans', ALL, 'Low-contrast geometric sans, calm and clean in short texts.'),
  f('Work Sans', 'sans', ALL, 'Slightly wide grotesque; plain in text, characterful in heavy weights.'),
  f('Plus Jakarta Sans', 'sans', from(200, 800), 'Crisp geometric sans with open shapes; good for confident headlines.'),
  f('Space Grotesk', 'sans', from(300, 700), 'Grotesque with quirky details from Space Mono; techy and distinctive.'),
  f('IBM Plex Sans', 'sans', from(100, 700), 'Engineered grotesque with a corporate, precise voice.'),
  f('Source Sans 3', 'sans', from(200, 900), 'Adobe\'s humanist sans: clear and unobtrusive for body text.'),
  f('Nunito Sans', 'sans', from(200, 900), 'Rounded-terminal humanist sans; warm and approachable.'),
  f('Figtree', 'sans', from(300, 900), 'Clean geometric sans with a friendly, simple tone.'),
  f('Outfit', 'sans', ALL, 'Geometric sans with round forms; strong in bold headlines.'),
  f('Sora', 'sans', from(100, 800), 'Wide geometric sans made for screens; airy and contemporary.'),
  f('Lexend', 'sans', ALL, 'Spaced for reading ease; very clear at small sizes.'),
  f('Public Sans', 'sans', ALL, 'Neutral, strong grotesque from the US government design system.'),
  f('Rubik', 'sans', from(300, 900), 'Slightly rounded corners; playful but still tidy.'),
  f('Montserrat', 'sans', ALL, 'Wide urban geometric; bold and poster-like in heavy weights.'),
  f('Hanken Grotesk', 'sans', ALL, 'Compact, minimal grotesque that sets text cleanly.'),
  f('Schibsted Grotesk', 'sans', from(400, 900), 'Editorial grotesque from a news publisher; firm and readable.'),
  f('Karla', 'sans', from(200, 800), 'Quirky grotesque with a hand-made feel; informal.'),
  // serif
  f('Fraunces', 'serif', ALL, 'Soft, chunky old-style serif with warmth and character for display.'),
  f('Playfair Display', 'serif', from(400, 900), 'High-contrast transitional serif; elegant, editorial headlines.'),
  f('DM Serif Display', 'serif', [400], 'High-contrast display serif with tight curves; for large headlines only.'),
  f('Libre Caslon Text', 'serif', [400, 700], 'Classic Caslon for text; bookish and trustworthy.'),
  f('Source Serif 4', 'serif', from(200, 900), 'Sturdy transitional serif with optical sizes; reads well everywhere.'),
  f('Lora', 'serif', from(400, 700), 'Contemporary serif with calligraphic roots; balanced in text.'),
  f('Merriweather', 'serif', from(300, 900), 'Sturdy, slightly condensed serif built for screens.'),
  f('Crimson Pro', 'serif', from(200, 900), 'Garamond-like book serif; refined and literary.'),
  f('Newsreader', 'serif', from(200, 800), 'Newspaper serif with optical sizes; journalistic and clear.'),
  f('Instrument Serif', 'serif', [400], 'Condensed display serif; stylish, magazine-like headlines.'),
  f('EB Garamond', 'serif', from(400, 800), 'Classic Garamond revival; traditional and literary.'),
  f('Libre Baskerville', 'serif', from(400, 700), 'Baskerville drawn for screen text; formal and readable.'),
  f('Spectral', 'serif', from(200, 800), 'Light, elegant screen serif from Production Type.'),
  f('Young Serif', 'serif', [400], 'Heavy old-style serif with a friendly, retro tone.'),
  f('Roboto Slab', 'serif', ALL, 'Mechanical slab serif; sturdy and plain.', 'Apache-2.0'),
  f('Bitter', 'serif', ALL, 'Contemporary slab serif made for reading on screens.'),
  // display
  f('Archivo Black', 'display', [400], 'Very heavy grotesque for short, loud headlines.'),
  f('Abril Fatface', 'display', [400], 'Fat-face Didone; dramatic, high-contrast headlines.'),
  f('Syne', 'display', from(400, 800), 'Art-gallery display sans that widens as it gets bolder.'),
  f('Unbounded', 'display', from(200, 900), 'Wide, rounded display sans; bold and futuristic.'),
  f('Bricolage Grotesque', 'display', from(200, 800), 'Expressive grotesque with ink traps; lively headlines.'),
  // condensed
  f('Oswald', 'condensed', from(200, 700), 'Classic condensed gothic; fits long headlines in narrow space.'),
  f('Bebas Neue', 'condensed', [400], 'All-caps condensed display; the poster headline face.'),
  f('Barlow Condensed', 'condensed', ALL, 'Slightly rounded condensed grotesque; a full range of weights.'),
  f('Anton', 'condensed', [400], 'Heavy condensed sans for big, impactful headlines.'),
  f('Archivo Narrow', 'condensed', from(400, 700), 'Narrow grotesque that stays readable in text and labels.'),
  f('Big Shoulders', 'condensed', ALL, 'Chicago-inspired condensed display with optical sizes.'),
  f('Roboto Condensed', 'condensed', ALL, 'Narrow Roboto; neutral and space-saving.'),
  f('League Gothic', 'condensed', [400], 'Revival of a classic tall gothic; vintage headlines.'),
  // mono
  f('Space Mono', 'mono', [400, 700], 'Geometric mono with retro-futurist character.'),
  f('IBM Plex Mono', 'mono', from(100, 700), 'The built-in label face: engineered and neutral.'),
  f('JetBrains Mono', 'mono', from(100, 800), 'Tall-x-height coding mono; very clear for figures and labels.'),
  f('DM Mono', 'mono', from(300, 500), 'Light, friendly mono that pairs with DM Sans.'),
  f('Roboto Mono', 'mono', from(100, 700), 'Plain mono from the Roboto family.'),
  // handwriting
  f('Caveat', 'handwriting', from(400, 700), 'Casual handwriting; for a short accent, not for text.'),
  f('Permanent Marker', 'handwriting', [400], 'Bold marker lettering; for a word or two. Latin only (no latin-ext).', 'Apache-2.0'),
];

export const findGoogleFont = (family: string): GoogleFont | undefined => GOOGLE_FONTS.find((g) => g.family === family);

// ---- fetching ----

export const GOOGLE_CSS_HOST = 'fonts.googleapis.com';
export const GOOGLE_FILE_HOST = 'fonts.gstatic.com';
// The CSS API answers with woff2 files only to a browser it knows; any recent Chrome will do.
const BROWSER_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const MAX_CSS_BYTES = 256 * 1024;
export const MAX_GOOGLE_FONT_BYTES = 2 * 1024 * 1024;
// One pick brings at most every weight from 100 to 900, in two files each, and at most this many bytes in all.
export const MAX_GOOGLE_WEIGHTS = 9;
export const MAX_GOOGLE_PICK_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 20_000;
export const GOOGLE_SUBSETS = ['latin', 'latin-ext'] as const;
export type GoogleSubset = (typeof GOOGLE_SUBSETS)[number];
// The engine's unicode-range check (lib/design/brand.mjs RANGE): the file is refused unless its range passes it too.
const RANGE = /^U\+[0-9A-Fa-f?]{1,6}(-[0-9A-Fa-f]{1,6})?(, ?U\+[0-9A-Fa-f?]{1,6}(-[0-9A-Fa-f]{1,6})?)*$/;

export class GoogleFontError extends Error {
  constructor(public status: 400 | 413 | 502, message: string) {
    super(message);
    this.name = 'GoogleFontError';
  }
}

// One downloaded file: a subset of the family and the weights (of those asked for) it draws. A variable family's file draws
// several; a static family has a file per weight.
export interface GoogleFontFile { subset: GoogleSubset; range: string; weights: number[]; bytes: Buffer }

// The css2 address of a family at some of its weights (in ascending order, as the API wants them).
export const googleCssUrl = (g: GoogleFont, weights: readonly number[]) =>
  `https://${GOOGLE_CSS_HOST}/css2?family=${encodeURIComponent(g.family).replace(/%20/g, '+')}:wght@${[...weights].sort((a, b) => a - b).join(';')}&display=swap`;

// The body of a response, refused once it passes `max` bytes (the stream is cancelled; nothing more is read).
async function readCapped(res: Response, max: number, what: string): Promise<Buffer> {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > max) { await res.body?.cancel().catch(() => undefined); throw new GoogleFontError(413, `${what} is larger than ${Math.round(max / 1024)} KB; nothing was stored`); }
  if (!res.body) return Buffer.from(await res.arrayBuffer());
  const reader = res.body.getReader();
  const parts: Buffer[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel().catch(() => undefined); throw new GoogleFontError(413, `${what} is larger than ${Math.round(max / 1024)} KB; nothing was stored`); }
    parts.push(Buffer.from(value));
  }
  return Buffer.concat(parts);
}

async function get(fetchImpl: typeof fetch, url: string, accept: string, what: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetchImpl(url, { headers: { 'user-agent': BROWSER_UA, accept }, redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new GoogleFontError(502, `Google Fonts could not be reached for ${what}. Check that this server may connect to ${GOOGLE_CSS_HOST} and ${GOOGLE_FILE_HOST}, then try again.`);
  }
  return res;
}

// The faces of a css2 answer: one per subset comment ("/* latin */ @font-face {...}"), with its weight, file and range.
export function parseFontFaces(css: string): Array<{ subset: string; weight: string; style: string; url: string; format: string; range: string }> {
  const out: Array<{ subset: string; weight: string; style: string; url: string; format: string; range: string }> = [];
  const re = /\/\*\s*([a-z0-9-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g;
  for (const m of css.matchAll(re)) {
    const body = m[2]!;
    const prop = (name: string) => new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`).exec(body)?.[1]?.trim() ?? '';
    const src = /url\(\s*['"]?([^'")\s]+)['"]?\s*\)\s*format\(\s*['"]?([a-z0-9-]+)['"]?\s*\)/.exec(prop('src'));
    out.push({ subset: m[1]!, weight: prop('font-weight'), style: prop('font-style'), url: src?.[1] ?? '', format: src?.[2] ?? '', range: prop('unicode-range').replace(/\s+/g, ' ') });
  }
  return out;
}

// Whether a face's font-weight ("700", or a variable family's "400 700") draws weight w.
export function faceDraws(weight: string, w: number): boolean {
  const m = /^(\d{1,4})(?:\s+(\d{1,4}))?$/.exec(weight.trim());
  if (!m) return false;
  const lo = Number(m[1]), hi = Number(m[2] ?? m[1]);
  return lo <= hi && w >= lo && w <= hi;
}

// Only https://fonts.gstatic.com/..., with no user, password or port.
export function isGoogleFileUrl(u: string): boolean {
  try {
    const url = new URL(u);
    return url.protocol === 'https:' && url.hostname === GOOGLE_FILE_HOST && url.port === '' && !url.username && !url.password;
  } catch { return false; }
}

const isWoff2 = (buf: Buffer) => buf.length > 48 && buf.toString('latin1', 0, 4) === 'wOF2';
const upper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Downloads the latin (and, when Google has it, latin-ext) woff2 files of one family at the given weights: one css2 request,
// then each distinct file once, at most MAX_GOOGLE_FONT_BYTES each and MAX_GOOGLE_PICK_BYTES together. Throws GoogleFontError
// with a message for the admin; never includes a response body in it.
export async function fetchGoogleFont(fetchImpl: typeof fetch, g: GoogleFont, asked: readonly number[]): Promise<GoogleFontFile[]> {
  const weights = [...new Set(asked)].sort((a, b) => a - b);
  if (!weights.length || weights.length > MAX_GOOGLE_WEIGHTS) throw new GoogleFontError(400, `Ask for 1 to ${MAX_GOOGLE_WEIGHTS} weights of ${g.family}`);
  for (const w of weights) if (!g.weights.includes(w)) throw new GoogleFontError(400, `${g.family} has no weight ${w}`);
  const what = `${g.family} ${weights.join(', ')}`;
  const res = await get(fetchImpl, googleCssUrl(g, weights), 'text/css,*/*;q=0.1', what);
  if (res.status === 400 || res.status === 404) {
    await res.body?.cancel().catch(() => undefined);
    throw new GoogleFontError(502, `Google Fonts no longer serves ${what}. Choose another family.`);
  }
  if (!res.ok) {
    await res.body?.cancel().catch(() => undefined);
    throw new GoogleFontError(502, `Google Fonts did not answer for ${what} (HTTP ${res.status}). Try again later.`);
  }
  const css = (await readCapped(res, MAX_CSS_BYTES, 'The Google Fonts answer')).toString('utf8');
  const faces = parseFontFaces(css).filter((x) => (GOOGLE_SUBSETS as readonly string[]).includes(x.subset) && (x.style === '' || x.style === 'normal'));
  // Each weight's face in each subset, gathered by file: a file Google sends for several weights is downloaded once.
  const byUrl = new Map<string, { subset: GoogleSubset; url: string; format: string; range: string; weights: number[] }>();
  for (const w of weights) {
    for (const subset of GOOGLE_SUBSETS) {
      const x = faces.find((f) => f.subset === subset && faceDraws(f.weight, w));
      if (!x) {
        if (subset === 'latin') throw new GoogleFontError(502, `Google Fonts sent no latin file for ${g.family} ${w}; nothing was stored.`);
        continue;
      }
      const file = byUrl.get(x.url) ?? { subset, url: x.url, format: x.format, range: x.range, weights: [] };
      if (file.subset !== subset) throw new GoogleFontError(502, `Google Fonts sent the same file for two subsets of ${what}; nothing was stored.`);
      file.weights.push(w);
      byUrl.set(x.url, file);
    }
  }
  const picked = [...byUrl.values()];
  for (const x of picked) {
    if (!isGoogleFileUrl(x.url)) throw new GoogleFontError(502, `Google Fonts pointed at a file outside ${GOOGLE_FILE_HOST}; nothing was stored.`);
    if (x.format !== 'woff2') throw new GoogleFontError(502, `Google Fonts did not offer ${what} as woff2; nothing was stored.`);
    if (x.range.length > 2000 || !RANGE.test(x.range)) throw new GoogleFontError(502, `Google Fonts sent a character range the design engine does not accept for ${what}; nothing was stored.`);
  }
  const files: GoogleFontFile[] = [];
  let total = 0;
  for (const x of picked) {
    const name = `the ${x.subset} file of ${g.family} ${x.weights.join(', ')}`;
    const r = await get(fetchImpl, x.url, 'font/woff2,*/*;q=0.1', what);
    if (!r.ok) {
      await r.body?.cancel().catch(() => undefined);
      throw new GoogleFontError(502, `${upper(name)} could not be downloaded (HTTP ${r.status}); nothing was stored.`);
    }
    const left = MAX_GOOGLE_PICK_BYTES - total;
    const bytes = await readCapped(r, Math.min(MAX_GOOGLE_FONT_BYTES, left), left < MAX_GOOGLE_FONT_BYTES ? `${upper(g.family)} at ${weights.join(', ')} (all its files together)` : upper(name));
    if (!isWoff2(bytes)) throw new GoogleFontError(502, `${upper(name)} is not a woff2 font; nothing was stored.`);
    total += bytes.length;
    files.push({ subset: x.subset, range: x.range, weights: x.weights, bytes });
  }
  return files;
}
