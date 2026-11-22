// Brand text rules, as warnings. They never block a render; the owner decides.
const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}️‍]/u;
// A web address: a full URL, or a bare domain (letters for the top-level part) with an optional path. Addresses are written
// in lower case on purpose, so they are taken out before the spelling rules run.
export const WEB_ADDRESS = /https?:\/\/\S+|\b[\w-]+(?:\.[\w-]+)*\.[a-z]{2,24}\b(?:\/\S*)?/gi;
const withoutUrls = (t) => t.replace(WEB_ADDRESS, ' ');
const plain = (t) => t.replace(/\*/g, '').replace(/\\n|\n/g, ' ').replace(/\s+/g, ' ').trim();

// Another currency in a text. The brand's money.foreign is a pattern (matched without regard to case) of the currencies it does not
// use; money.local says what its money is. Web addresses are left out. -> the words that matched, or null.
export function foreignMoneyIn(text, brand) {
  const pattern = brand?.money?.foreign;
  if (typeof pattern !== 'string' || !pattern || typeof text !== 'string') return null;
  let re;
  try { re = new RegExp(pattern, 'i'); } catch { return null; }
  return withoutUrls(text).match(re)?.[0] ?? null;
}

// The warning for one text (`where`: "caption", "headline", ...) that names another currency, or null. A warning, never a block:
// a fact the brand cites may carry the other currency, and a person decides.
export function foreignMoneyWarning(where, text, brand) {
  const found = foreignMoneyIn(text, brand);
  return found === null ? null : `${where}: mentions another currency ("${found.trim().slice(0, 30)}")${brand.money.local ? `; ${brand.money.local}` : ''}`;
}

// fields: [{ field: 'headline', text }], sizeName: 'feed' ...
export function lintText(fields, sizeName, brand) {
  const warnings = [];
  for (const { field, text } of fields) {
    if (typeof text !== 'string') continue;
    const t = plain(text);
    for (const r of brand.spelling) {
      const m = withoutUrls(t).match(new RegExp(r.wrong, r.flags ?? ''));
      if (m) warnings.push(`${field}: "${m[0]}" should be written "${r.right}"`);
    }
    const money = foreignMoneyWarning(field, t, brand);
    if (money) warnings.push(money);
    const emoji = t.match(EMOJI);
    if (emoji) warnings.push(`${field}: contains an emoji (${emoji[0]}); image text uses words only`);
    const kind = field.replace(/^page \d+ /, '');
    // A two-tone headline (the website's: a statement, then its *continuation* in grey) is judged in two parts: the statement
    // against the headline guidance, the whole against the sub line's.
    if (kind === 'headline') {
      const max = brand.lint.headlineMaxChars[sizeName], whole = brand.lint.subMaxChars[sizeName];
      const statement = [...plain(text.replace(/\*[^*]+\*/g, ' '))].length;
      if (max && statement > max) warnings.push(`${field}: ${statement} characters before the grey continuation is long for ${sizeName} (guidance: up to ${max})`);
      else if (whole && [...t].length > whole) warnings.push(`${field}: ${[...t].length} characters is long for ${sizeName} (guidance: up to ${whole} with the continuation)`);
    }
    const max = kind === 'sub' ? brand.lint.subMaxChars[sizeName] : null;
    if (max && [...t].length > max) warnings.push(`${field}: ${[...t].length} characters is long for ${sizeName} (guidance: up to ${max})`);
  }
  return [...new Set(warnings)];
}

// Collects the text fields of a normalised spec (a carousel has one set per page): every text that appears in the image.
const TEXT_KEYS = ['headline', 'sub', 'eyebrow', 'label', 'headRight', 'caption', 'title', 'big', 'line', 'myth', 'factLead', 'fact', 'quote', 'note', 'by', 'unit', 'meta', 'tag', 'cta'];
function fieldsOfOne(o) {
  const out = TEXT_KEYS.filter((k) => typeof o[k] === 'string').map((k) => ({ field: k, text: o[k] }));
  // a post's info rows (the value; the label is a fixed word) and the names under its round pictures
  (Array.isArray(o.info) ? o.info : []).forEach((r, i) => { if (r && typeof r.value === 'string') out.push({ field: `info ${i + 1}`, text: r.value }); });
  (Array.isArray(o.gallery) ? o.gallery : []).forEach((p, i) => { if (p && typeof p.caption === 'string') out.push({ field: `picture ${i + 1} name`, text: p.caption }); });
  for (const k of ['pills', 'checks', 'items']) (Array.isArray(o[k]) ? o[k] : []).forEach((t, i) => out.push({ field: `${k.slice(0, -1)} ${i + 1}`, text: t }));
  (o.stats ?? []).forEach((s, i) => out.push({ field: `stat ${i + 1} number`, text: s[0] }, { field: `stat ${i + 1} label`, text: s[1] }));
  const art = o.artefact ?? (o.columns || o.register || o.rows ? o : null);
  if (art) {
    (art.columns ?? []).forEach((c) => out.push({ field: 'column', text: c.label }));
    (art.rows ?? []).flat().forEach((c) => { if (typeof c === 'string') out.push({ field: 'cell', text: c }); });
    (art.notes ?? []).forEach((t) => out.push({ field: 'note', text: t }));
    const reg = art.type === 'register' ? art : art.register;
    if (reg) { if (reg.title) out.push({ field: 'register title', text: reg.title }); (reg.rows ?? []).flat().forEach((c) => out.push({ field: 'register row', text: c })); }
  }
  return out;
}
export function textFieldsOf(spec) {
  if (spec.pages) return spec.pages.flatMap((s, i) => fieldsOfOne(s).map((f) => ({ ...f, field: `page ${i + 1} ${f.field}` })));
  return fieldsOfOne(spec);
}
