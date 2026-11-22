// The headline box: select words, then press Colour (the second colour of the two-tone headline), Pill (one to three words in a pill,
// where the design draws pills) or Plain, and put an icon at the cursor from the icon grid. The stored value is the same markup the engine
// reads (*colour*, [[pill]], {{icon}}); people never see it. Fine-tune holds "Edit as text", which shows that markup in a plain box, and a
// value the editor cannot show exactly is edited as text with the reason given (headline-markup.ts parseMarkup).
//
// The editor is a contenteditable box drawn from the runs of words; every change goes through the runs (beforeinput is handled here), so
// the box never holds anything the markup cannot say. Only an input method (IME) writes into the box itself: what it wrote is read back
// when it finishes. Undo and redo are the editor's own.
import { useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { ChevronRight } from 'lucide-react';
import { Hint, SwitchField } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { readRuns, readSelection, targetSelection, writeSelection, type Sel } from './headline-caret';
import {
  applyStyle, cleanInput, describeMarks, ICON_CHAR, INLINE_LIMITS, insertIcon, markProblems, parseMarkup, plainText, replaceRange, toMarkup,
  type Edit, type MarkLimits, type Run, type Style,
} from './headline-markup';
import { IconGlyph, IconGrid, iconWords } from './IconGrid';

// Which marks the chosen design draws (lookBrief marks): a mark it does not draw is kept and named under the box, never removed.
export interface Draws { pills: boolean; icons: boolean }

export function HeadlineField({ value, onChange, label = 'Headline', required, error, disabled, maxLength, hint, marks, icons = [], limits = INLINE_LIMITS, draws, offer, counter }: {
  value: string;
  onChange: (next: string) => void;
  label?: string;
  required?: boolean;
  error?: string;
  disabled?: boolean;
  maxLength?: number;
  // Replaces the default hint.
  hint?: string;
  // Offers Pill and the icons (a post designed by a look).
  marks?: boolean;
  icons?: string[];
  limits?: MarkLimits;
  // the marks the chosen design draws (notes under the box) and the ones any design of the kind draws (which buttons are offered)
  draws?: Draws | null;
  offer?: Draws | null;
  // shown at the end of the Fine-tune row, right under the box (the character counter)
  counter?: React.ReactNode;
}) {
  const id = useId();
  const parsed = useMemo(() => parseMarkup(value), [value]);
  const [asText, setAsText] = useState(false);
  const [fineOpen, setFineOpen] = useState(() => !parseMarkup(value).ok);
  const [note, setNote] = useState('');
  const forcedText = !parsed.ok;
  const textMode = asText || forcedText;
  useEffect(() => { if (forcedText) setFineOpen(true); }, [forcedText]);
  const runs = parsed.ok ? parsed.runs : [];
  const editor = useRef<RichHandle | null>(null);

  const problems = parsed.ok ? markProblems(runs, limits, marks ? icons : undefined) : [];
  const hasPill = runs.some((r) => r.t === 'pill'), hasIcon = runs.some((r) => r.t === 'icon');
  // a mark no design of this kind draws is not offered (a headline that has one keeps the button, to take it off)
  const offerPill = !!marks && (offer?.pills !== false || hasPill), offerIcon = !!marks && icons.length > 0 && (offer?.icons !== false || hasIcon);
  const plainNotes = [
    draws && hasPill && !draws.pills ? 'The chosen design shows pill words as plain words.' : '',
    draws && hasIcon && !draws.icons ? 'The chosen design leaves icons out.' : '',
  ].filter(Boolean);
  const defaultHint = `Select words, then press Colour to set them in the second colour${offerPill ? ', or Pill to set one to three words in a pill' : ''}. Plain takes it off again.${offerIcon ? ' Icon puts an icon at the cursor.' : ''}`;
  const describedBy = [`${id}-hint`, `${id}-marks`, error ? `${id}-error` : '', problems.length ? `${id}-problems` : ''].filter(Boolean).join(' ');
  // Keep the box's selection: a button press must not move focus first.
  const keep = (e: MouseEvent) => e.preventDefault();
  const act = (fn: (h: RichHandle) => void) => () => { if (editor.current) fn(editor.current); };

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className="flex min-h-5 items-center gap-1">
          <Label id={`${id}-label`} htmlFor={textMode ? `${id}-text` : undefined} onClick={() => editor.current?.focus()}>{label}{required && <span aria-hidden="true"> *</span>}</Label>
          <Hint about={label} id={`${id}-hint`}>{hint ?? defaultHint}</Hint>
        </span>
        {!textMode && (
          <div role="toolbar" aria-label={`Style the selected words of the ${label.toLowerCase()}`} aria-controls={`${id}-box`} className="flex items-center gap-1">
            <Button type="button" variant="outline" size="sm" disabled={disabled} onMouseDown={keep} onClick={act((h) => h.style('em'))} className="h-7 max-sm:min-h-9"
              aria-label="Colour: set the selected words in the second colour">
              <span className="size-2.5 rounded-full bg-primary" aria-hidden="true" />Colour
            </Button>
            {offerPill && (
              <Button type="button" variant="outline" size="sm" disabled={disabled} onMouseDown={keep} onClick={act((h) => h.style('pill'))} className="h-7 max-sm:min-h-9"
                aria-label="Pill: set the selected words in a pill">
                <span className="h-2.5 w-4 rounded-full border border-current" aria-hidden="true" />Pill
              </Button>
            )}
            <Button type="button" variant="outline" size="sm" disabled={disabled} onMouseDown={keep} onClick={act((h) => h.style('text'))} className="h-7 max-sm:min-h-9"
              aria-label="Plain: take the colour or pill off the selected words">Plain</Button>
            {offerIcon && <IconGrid icons={icons} disabled={disabled} keepSelection={keep} onPick={(name) => editor.current?.icon(name)} />}
          </div>
        )}
      </div>
      {textMode ? (
        <Textarea id={`${id}-text`} rows={2} value={value} maxLength={maxLength} disabled={disabled} required={required} spellCheck
          className="font-mono text-[12.5px] max-sm:text-base" aria-invalid={error || problems.length ? true : undefined} aria-describedby={[describedBy, `${id}-syntax`].join(' ')}
          onChange={(e) => { setNote(''); onChange(e.target.value); }} />
      ) : (
        <RichHeadline
          ref={editor} id={`${id}-box`} runs={runs} value={value} labelledBy={`${id}-label`} describedBy={describedBy} disabled={disabled}
          invalid={!!error || problems.length > 0} maxLength={maxLength} limits={limits} onChange={onChange} onNote={setNote}
        />
      )}
      {!parsed.ok && <p className="text-[12.5px] text-muted-foreground">This headline is edited as text because the styling buttons cannot show it exactly. {parsed.reason}</p>}
      {textMode && <p id={`${id}-syntax`} className="sr-only">*words* in the second colour, [[words]] in a pill, {'{{name}}'} an icon.</p>}
      <p id={`${id}-marks`} className="sr-only">{parsed.ok ? describeMarks(runs) : ''}</p>
      <p className="text-[13px] text-muted-foreground empty:hidden" aria-live="polite">{note}</p>
      {problems.length > 0 && <ul id={`${id}-problems`} className="text-[12.5px] font-medium text-destructive" role="alert">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
      {plainNotes.length > 0 && <p className="text-[12.5px] text-muted-foreground">{plainNotes.join(' ')}</p>}
      {error && <p id={`${id}-error`} className="text-[12.5px] font-medium text-destructive" role="alert">{error}</p>}
      <div>
        <div className="flex items-start justify-between gap-2">
          <button type="button" aria-expanded={fineOpen} aria-controls={`${id}-fine`} onClick={() => setFineOpen(!fineOpen)}
            className="-ml-1 inline-flex min-h-7 items-center gap-1 rounded-md px-1 text-[12.5px] font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:min-h-11">
            <ChevronRight className={cn('size-3.5 transition-transform', fineOpen && 'rotate-90')} aria-hidden="true" />Fine-tune
          </button>
          {counter}
        </div>
        {fineOpen && (
          <div id={`${id}-fine`} className="mt-1 flex flex-col gap-1.5 pl-1">
            <SwitchField label="Edit as text" checked={textMode} disabled={disabled || forcedText} onCheckedChange={(on) => { setNote(''); setAsText(on); }}
              hint="Shows the headline with its marks: *words* in the second colour, [[words]] in a pill, {{name}} an icon." />
          </div>
        )}
      </div>
    </div>
  );
}

interface RichHandle { style(s: Style): void; icon(name: string): void; focus(): void }
interface Snap { value: string; sel: Sel }

// The editing box itself. `runs` are the parsed `value`; every edit makes new runs and hands their markup to onChange.
function RichHeadline({ ref, id, runs, value, labelledBy, describedBy, disabled, invalid, maxLength, limits, onChange, onNote }: {
  ref: React.Ref<RichHandle | null>;
  id: string; runs: Run[]; value: string; labelledBy: string; describedBy: string; disabled?: boolean; invalid: boolean; maxLength?: number; limits: MarkLimits;
  onChange: (next: string) => void; onNote: (note: string) => void;
}) {
  const root = useRef<HTMLDivElement | null>(null);
  const [epoch, setEpoch] = useState(0);
  const pending = useRef<{ sel: Sel; focus: boolean } | null>(null);
  const last = useRef<Sel>({ start: plainText(runs).length, end: plainText(runs).length });
  const composing = useRef(false);
  const history = useRef<{ past: Snap[]; future: Snap[]; at: number }>({ past: [], future: [], at: 0 });
  // the latest props, for the native listeners
  const live = useRef({ runs, value, disabled, maxLength, limits });
  live.current = { runs, value, disabled, maxLength, limits };

  const restore = useCallback(() => {
    const p = pending.current, el = root.current;
    if (!p || !el) return;
    if (p.focus && document.activeElement !== el) el.focus({ preventScroll: true });
    if (document.activeElement === el) writeSelection(el, p.sel);
    last.current = p.sel;
    pending.current = null;
  }, []);
  useLayoutEffect(restore);

  const commit = useCallback((edit: Edit, opts: { record?: boolean; focus?: boolean } = {}): boolean => {
    if (!edit.ok) { onNote(edit.reason); return false; }
    const next = toMarkup(edit.runs);
    const { value: cur, maxLength: max } = live.current;
    if (max && next.length > max && next.length > cur.length) { onNote(`The headline takes up to ${max} characters.`); return false; }
    const h = history.current;
    // typing within a second is one step of undo
    if (opts.record !== false && next !== cur) {
      const now = Date.now();
      if (!(opts.record === undefined && now - h.at < 1000 && h.past.length)) h.past.push({ value: cur, sel: last.current });
      if (h.past.length > 100) h.past.shift();
      h.future = [];
      h.at = opts.record === undefined ? now : 0;
    }
    pending.current = { sel: { start: edit.start, end: edit.end }, focus: opts.focus ?? true };
    if (next !== cur) onChange(next);
    // nothing to draw again (the markup did not change): put the caret back now
    requestAnimationFrame(restore);
    return true;
  }, [onChange, onNote, restore]);

  const sel = () => (root.current && readSelection(root.current)) ?? last.current;

  useImperativeHandle(ref, () => ({
    style(s: Style) {
      const r = applyStyle(live.current.runs, sel().start, sel().end, s, live.current.limits);
      if (commit(r, { record: true })) onNote('');
    },
    icon(name: string) {
      const at = sel().end;
      const r = insertIcon(live.current.runs, at, name, live.current.limits);
      if (commit(r, { record: true })) onNote(`Added the ${iconWords(name)} icon.`);
    },
    focus() { root.current?.focus(); },
  }));

  function undo(redo = false) {
    const h = history.current;
    const from = redo ? h.future : h.past, to = redo ? h.past : h.future;
    const snap = from.pop();
    if (!snap) return;
    to.push({ value: live.current.value, sel: last.current });
    h.at = 0;
    pending.current = { sel: snap.sel, focus: true };
    onChange(snap.value);
    requestAnimationFrame(restore);
  }

  function insert(text: string, at?: Sel | null) {
    const { text: clean, dropped } = cleanInput(text);
    const s = at ?? sel();
    const r = replaceRange(live.current.runs, s.start, s.end, clean);
    if (commit(r)) onNote(dropped ? 'Asterisks, square and curly brackets and backslashes were left out: the buttons do the styling.' : '');
  }

  // Every change to the words comes through here (beforeinput), so the box holds only what the runs say. The listener calls the handler
  // of the latest render, so it never holds an old onChange (which would undo the post's other edits).
  function beforeInput(e: InputEvent) {
    const el = root.current;
    if (!el) return;
    if (live.current.disabled) { e.preventDefault(); return; }
    if (e.inputType === 'insertCompositionText' || composing.current) return;
    e.preventDefault();
    const target = targetSelection(el, e) ?? sel();
    const plain = plainText(live.current.runs);
    switch (e.inputType) {
      case 'insertText': case 'insertReplacementText': case 'insertFromPaste': case 'insertFromDrop': case 'insertFromYank':
        insert(e.data ?? e.dataTransfer?.getData('text/plain') ?? '', target); return;
      case 'insertParagraph': case 'insertLineBreak':
        insert('\n', target); return;
      case 'historyUndo': undo(); return;
      case 'historyRedo': undo(true); return;
      default:
        if (!e.inputType.startsWith('delete')) return;
    }
    let { start, end } = target;
    if (start === end) {
      // no target range from the browser: one character (a whole letter outside the basic plane), or a word
      if (/Backward/.test(e.inputType)) {
        if (/Word/.test(e.inputType)) start = start - (/\S*\s*$/.exec(plain.slice(0, start))?.[0].length ?? 1);
        else start = Math.max(0, start - (/[\uDC00-\uDFFF]/.test(plain[start - 1] ?? '') ? 2 : 1));
      } else if (/Forward/.test(e.inputType)) {
        if (/Word/.test(e.inputType)) end = end + (/^\s*\S*/.exec(plain.slice(end))?.[0].length ?? 1);
        else end = Math.min(plain.length, end + (/[\uD800-\uDBFF]/.test(plain[end] ?? '') ? 2 : 1));
      }
    }
    if (start === end) return;
    commit(replaceRange(live.current.runs, start, end, ''));
  }
  const onBeforeRef = useRef(beforeInput);
  onBeforeRef.current = beforeInput;
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const onBefore = (e: InputEvent) => onBeforeRef.current(e);
    const onSelection = () => { const s = readSelection(el); if (s) last.current = s; };
    el.addEventListener('beforeinput', onBefore);
    document.addEventListener('selectionchange', onSelection);
    return () => { el.removeEventListener('beforeinput', onBefore); document.removeEventListener('selectionchange', onSelection); };
    // the handlers read everything through refs; a new box (epoch) needs new listeners
  }, [epoch]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && !e.altKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(e.shiftKey); }
    else if (mod && !e.altKey && e.key.toLowerCase() === 'y') { e.preventDefault(); undo(true); }
  }
  function onPaste(e: ClipboardEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!live.current.disabled) insert(e.clipboardData.getData('text/plain'));
  }
  function onCut(e: ClipboardEvent<HTMLDivElement>) {
    const s = sel();
    if (s.start === s.end || live.current.disabled) return;
    e.preventDefault();
    e.clipboardData.setData('text/plain', plainText(live.current.runs).slice(s.start, s.end).split(ICON_CHAR).join(''));
    commit(replaceRange(live.current.runs, s.start, s.end, ''));
  }
  function onCopy(e: ClipboardEvent<HTMLDivElement>) {
    const s = sel();
    if (s.start === s.end) return;
    e.preventDefault();
    e.clipboardData.setData('text/plain', plainText(live.current.runs).slice(s.start, s.end).split(ICON_CHAR).join(''));
  }
  // An input method wrote into the box: read what it wrote, then draw the box again from the runs.
  function onCompositionEnd() {
    composing.current = false;
    const el = root.current;
    if (!el) return;
    const s = readSelection(el) ?? last.current;
    const r = readRuns(el);
    pending.current = { sel: s, focus: true };
    const next = toMarkup(r);
    if (next !== live.current.value) { history.current.past.push({ value: live.current.value, sel: last.current }); onChange(next); }
    setEpoch((n) => n + 1);
  }

  const empty = runs.length === 0;
  return (
    <div
      key={epoch}
      ref={root}
      id={id}
      role="textbox"
      aria-multiline="true"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-invalid={invalid ? true : undefined}
      aria-disabled={disabled ? true : undefined}
      contentEditable={!disabled}
      suppressContentEditableWarning
      spellCheck
      tabIndex={disabled ? -1 : 0}
      data-empty={empty ? 'true' : undefined}
      data-placeholder="Type the headline"
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      onCut={onCut}
      onCopy={onCopy}
      onDrop={(e) => e.preventDefault()}
      onCompositionStart={() => { composing.current = true; }}
      onCompositionEnd={onCompositionEnd}
      className={cn(
        'min-h-[4.5rem] w-full cursor-text whitespace-pre-wrap rounded-md border border-input bg-transparent px-2.5 py-1.5 text-base leading-7 shadow-xs outline-none [overflow-wrap:anywhere] sm:text-[13px] sm:leading-6',
        'transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30',
        'aria-disabled:cursor-not-allowed aria-disabled:opacity-50 data-[empty=true]:before:pointer-events-none data-[empty=true]:before:text-muted-foreground data-[empty=true]:before:content-[attr(data-placeholder)]',
      )}
    >
      {runs.map((r, i) => {
        if (r.t === 'text') return r.text;
        if (r.t === 'em') return <span key={i} data-m="em" className="font-semibold text-primary">{r.text}</span>;
        if (r.t === 'pill') return <span key={i} data-m="pill" className="rounded-full bg-primary px-1.5 py-px text-primary-foreground [box-decoration-break:clone]">{r.text}</span>;
        return (
          <span key={i} data-m="icon" data-name={r.name} contentEditable={false} role="img" aria-label={`${iconWords(r.name)} icon`}
            className="mx-px inline-flex size-[1.35em] items-center justify-center rounded-full bg-muted align-[-0.3em] text-foreground">
            <IconGlyph name={r.name} className="size-[0.9em]" />
            <span className="sr-only">{ICON_CHAR}</span>
          </span>
        );
      })}
      {/* a line break at the very end shows only with something after it */}
      {plainText(runs).endsWith('\n') && <br data-end="1" />}
    </div>
  );
}
