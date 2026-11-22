// The headline editor's text in the page: offsets of the selection counted in the editor's text (headline-markup plainText, an icon as one
// character), and the runs read back from what the browser holds after an input method (IME) wrote into it. An icon is drawn as a span
// with data-m="icon" holding its glyph and one hidden ICON_CHAR, so the browser's own text of a range counts it once.
import { ICON_CHAR, normalise, type Run, type Style } from './headline-markup';

export interface Sel { start: number; end: number }

// The offset of a point (node, offset) inside root.
function offsetOf(root: HTMLElement, node: Node, offset: number): number {
  const icon = (node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement)?.closest('[data-m="icon"]');
  const r = document.createRange();
  r.setStart(root, 0);
  // a point inside an icon counts as just after it
  if (icon && root.contains(icon) && icon !== root) r.setEndAfter(icon);
  else r.setEnd(node, offset);
  return r.toString().length;
}

export function readSelection(root: HTMLElement): Sel | null {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const a = offsetOf(root, range.startContainer, range.startOffset), b = offsetOf(root, range.endContainer, range.endOffset);
  return { start: Math.min(a, b), end: Math.max(a, b) };
}

// The range a beforeinput event will change, from its target ranges when the browser gives them.
export function targetSelection(root: HTMLElement, e: InputEvent): Sel | null {
  const r = typeof e.getTargetRanges === 'function' ? e.getTargetRanges()[0] : undefined;
  if (!r || !root.contains(r.startContainer) || !root.contains(r.endContainer)) return null;
  const a = offsetOf(root, r.startContainer, r.startOffset), b = offsetOf(root, r.endContainer, r.endOffset);
  return { start: Math.min(a, b), end: Math.max(a, b) };
}

// The DOM point at an offset: inside a text node, or before or after an icon.
function pointAt(root: HTMLElement, n: number): [Node, number] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let last: [Node, number] = [root, 0];
  let left = n;
  for (let t = walker.nextNode() as Text | null; t; t = walker.nextNode() as Text | null) {
    const icon = t.parentElement?.closest('[data-m="icon"]');
    if (icon && root.contains(icon)) {
      const parent = icon.parentNode!, i = Array.prototype.indexOf.call(parent.childNodes, icon) as number;
      if (left === 0) return [parent, i];
      left -= 1;
      last = [parent, i + 1];
      continue;
    }
    if (left <= t.data.length) return [t, left];
    left -= t.data.length;
    last = [t, t.data.length];
  }
  return last;
}

export function writeSelection(root: HTMLElement, s: Sel): void {
  const sel = window.getSelection();
  if (!sel) return;
  const [an, ao] = pointAt(root, s.start), [bn, bo] = pointAt(root, s.end);
  const r = document.createRange();
  r.setStart(an, ao);
  r.setEnd(bn, bo);
  sel.removeAllRanges();
  sel.addRange(r);
}

// The runs the page holds now (after an input method changed it): text by the style of the nearest marked span, an icon by its name,
// a <br> or a new block as a line break. Anything else the browser added is read as plain words.
export function readRuns(root: HTMLElement): Run[] {
  const out: Run[] = [];
  const walk = (node: Node, style: Style) => {
    node.childNodes.forEach((child, i) => {
      if (child.nodeType === Node.TEXT_NODE) { out.push({ t: style, text: (child as Text).data.split(ICON_CHAR).join('') }); return; }
      if (child.nodeType !== Node.ELEMENT_NODE) return;
      const el = child as HTMLElement;
      const m = el.dataset.m;
      if (m === 'icon') { if (el.dataset.name) out.push({ t: 'icon', name: el.dataset.name }); return; }
      if (el.tagName === 'BR') { if (!el.dataset.end) out.push({ t: style, text: '\n' }); return; }
      if ((el.tagName === 'DIV' || el.tagName === 'P') && i > 0) out.push({ t: 'text', text: '\n' });
      walk(el, m === 'em' || m === 'pill' ? m : style);
    });
  };
  walk(root, 'text');
  return normalise(out);
}
