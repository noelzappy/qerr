// Assembles one page: a restrictive Content-Security-Policy, brand variables, the fonts and brand.css inline, the template's
// body and the in-page runtime. The page is self-contained (data: URIs only) and may not load anything from anywhere.
import crypto from 'node:crypto';
import { brandCssVars } from './brand.mjs';
import { RUNTIME } from './runtime.mjs';
import { esc } from '../../design/templates/common.mjs';

// No remote or file sources of any kind. Scripts: only the one inline runtime script, by nonce (it contains no spec data).
// Inline style attributes need 'unsafe-inline' for styles; every value that reaches a style is validated or computed.
export const cspFor = (nonce) => `default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src 'none'; base-uri 'none'; form-action 'none'`;

// One @font-face per font file; the family names and unicode-ranges were validated when the brand file was loaded.
export const fontFaceCss = (brand) => brand.fontFaces.map((f) => `@font-face{font-family:"${f.family}";src:url("${f.src}") format("woff2");font-weight:${f.weight};font-style:normal;unicode-range:${f.range}}`).join('');

export function buildPage({ brand, size, body, bodyClass = '', bodyAttrs = '' }) {
  const nonce = crypto.randomBytes(16).toString('base64');
  const vars = `--W:${size.w}px;--H:${size.h}px;--pad:${size.pad}px;--top:${size.top}px;--fbot:${size.fbot}px;--logo-h:${size.logoH}px;--url:${size.url}px;--hs:1;${brandCssVars(brand)}`;
  return `<!doctype html><html lang="en" data-family="${esc(brand.font.family)}" data-mono="${esc(brand.font.mono)}"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${cspFor(nonce)}">
<title>${esc(brand.name)} post</title>
<style>:root{${vars}}</style>
<style>${fontFaceCss(brand)}</style>
<style>${brand.css}</style></head>
<body class="${esc(bodyClass)}" ${bodyAttrs}>${body}<script nonce="${nonce}">${RUNTIME}</script></body></html>`;
}

// The carousel PDF: the finished page images, one per printed page, each exactly 1080 x 1350 CSS px, no margins. The same
// policy applies (images from data: only, no script at all); the images are data: URIs read from the files just written.
export function buildPrintPage({ images, w = 1080, h = 1350 }) {
  const nums = [w, h].every((n) => Number.isInteger(n) && n > 0 && n < 10000);
  if (!nums) throw new Error('print page size must be whole numbers');
  const csp = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none'";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><title>Pages</title>
<style>@page{size:${w}px ${h}px;margin:0}*{margin:0;padding:0}html,body{width:${w}px}img{display:block;width:${w}px;height:${h}px;break-after:page}img:last-child{break-after:auto}</style></head>
<body>${images.map((src) => `<img src="${esc(src)}" alt="">`).join('')}</body></html>`;
}
