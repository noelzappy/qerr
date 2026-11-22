// The grouped controls a group's Fine-tune shows above its exact values: a number with named presets (the kit's PresetNumber, each
// preset with a tiny picture of its value) for each control of fine-controls.ts, and the weight strips of the fonts.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Hint, PresetNumber } from '@/components/kit';
import { cn } from '@/lib/utils';
import { plainProblem } from '../look-model';
import type { FontFamilyInfo, Json } from '../look-types';
import { lookApi } from '../looks-api';
import { FINE_CONTROLS, fineProblem, finePresets, newProblems, readFine, writeFine, type FineControl, type FineCtx } from './fine-controls';
import { cardFontFamily, ensureFamily } from './load-fonts';
import { FONT_ROLES, toggleWeight, weightStrip, type FontRole, type WeightStrip } from './weights';

// A tiny picture of a value, drawn in the text colour. `t` is where the value sits in the control's range, 0 to 1.
export function FineVisual({ c, value }: { c: Pick<FineControl, 'visual' | 'min' | 'max'>; value: number }) {
  const t = Math.min(1, Math.max(0, (value - c.min) / (c.max - c.min || 1)));
  const svg = (children: ReactNode) => <svg viewBox="0 0 24 16" className="h-4 w-6" fill="none">{children}</svg>;
  switch (c.visual) {
    case 'size': return <span className="leading-none font-semibold" style={{ fontSize: `${Math.round(8 + t * 8)}px` }}>Aa</span>;
    case 'tracking': return <span className="text-[12px] leading-none font-bold" style={{ letterSpacing: `${value}em` }}>Sale</span>;
    case 'caps': return <span className="text-[9.5px] leading-none font-semibold" style={{ letterSpacing: `${value}em` }}>NEW</span>;
    case 'lines': { const gap = 2.5 + t * 3; return svg([0, 1, 2].map((i) => <rect key={i} x="2" y={2 + i * gap} width={i === 2 ? 12 : 20} height="1.6" rx="0.8" fill="currentColor" />)); }
    case 'margin': { const m = 0.5 + t * 7; return svg(<><rect x="4.5" y="0.5" width="15" height="15" rx="1" stroke="currentColor" opacity="0.5" /><rect x={4.5 + m * 0.6} y={0.5 + m * 0.6} width={15 - m * 1.2} height={15 - m * 1.2} fill="currentColor" opacity="0.35" /></>); }
    case 'gap': { const g = t * 6; const w = (16 - g) / 2; return svg(<><rect x={4} y="2" width={w} height="12" fill="currentColor" opacity="0.4" /><rect x={4 + w + g} y="2" width={w} height="12" fill="currentColor" opacity="0.4" /></>); }
    case 'rule': return svg(<><line x1="2" y1="5" x2="22" y2="5" stroke="currentColor" strokeWidth={value >= 6 ? 1 : 0.6} /><line x1="2" y1="11" x2="22" y2="11" stroke="currentColor" strokeWidth={0.6 + t * 3.4} /></>);
    case 'frame': return svg(<rect x={4.5} y={0.5} width="15" height="15" stroke="currentColor" strokeWidth={value === 0 ? 0.5 : 0.8 + t * 5} opacity={value === 0 ? 0.4 : 0.8} strokeDasharray={value === 0 ? '1.5 1.5' : undefined} />);
    case 'shadow': { const o = Math.max(0, value) / 24 * 4; return svg(<><rect x={6 + o} y={2 + o} width="10" height="10" fill="currentColor" opacity="0.45" /><rect x="6" y="2" width="10" height="10" fill="var(--background)" stroke="currentColor" strokeWidth="0.8" /></>); }
    case 'strength': return <span className="block h-1.5 w-7 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-current" style={{ width: `${Math.round(15 + t * 85)}%` }} /></span>;
    default: return null;
  }
}

// The engine's problems with a whole definition, asked of the server once per definition (nothing is stored). A failed request
// answers null: unknown, and the number is let through (saving checks again).
const checked = new Map<string, Promise<string[] | null>>();
function engineProblems(definition: Json): Promise<string[] | null> {
  const key = JSON.stringify(definition);
  let hit = checked.get(key);
  if (!hit) {
    hit = lookApi.validate(definition).then((r) => r.problems.map((p) => p.message)).catch(() => null);
    checked.set(key, hit);
    // Keep the last few dozen answers.
    if (checked.size > 60) checked.delete(checked.keys().next().value!);
  }
  return hit;
}
// Why the engine would refuse the look with the control at n ('' when it would not, or cannot say).
async function engineRefusal(id: string, n: number, look: Json, ctx: FineCtx, definitionOf: (settings: Json) => Json): Promise<string> {
  const next = writeFine(id, n, look, ctx);
  if (next === look) return '';
  const [before, after] = await Promise.all([engineProblems(definitionOf(look)), engineProblems(definitionOf(next))]);
  const fresh = before && after ? newProblems(before, after) : [];
  return fresh.length ? `That would break the look: ${plainProblem(fresh[0]!)}` : '';
}

// One grouped control: the presets this look can take, Custom when its values fit none or do not all follow the one number. A number
// is written only when the browser's guard and then the engine (asked through the server) accept it; presets either refuses are not
// offered, and a note says which.
export function FineNumber({ id, look, preset, definitionOf, disabled, onLook }: { id: string; look: Json; preset: FineCtx; definitionOf: (settings: Json) => Json; disabled?: boolean; onLook: (next: Json) => void }) {
  const c = FINE_CONTROLS[id]!;
  const reading = readFine(id, look, preset);
  const all = c.presets(look, preset);
  const guarded = finePresets(id, look, preset);
  // The engine's verdict on each preset left, for this look (keyed by the look, so an old answer is never used).
  const lookKey = JSON.stringify(look);
  const [verdict, setVerdict] = useState<{ key: string; refused: number[] }>({ key: '', refused: [] });
  const [typed, setTyped] = useState('');
  const seq = useRef(0);
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      void Promise.all(guarded.map(async (p) => ((await engineRefusal(id, p.value, look, preset, definitionOf)) ? p.value : null))).then((r) => {
        if (live) setVerdict({ key: lookKey, refused: r.filter((x): x is number => x !== null) });
      });
    }, 350);
    return () => { live = false; clearTimeout(t); };
  }, [lookKey, id]);
  useEffect(() => { setTyped(''); }, [lookKey]);
  const refused = verdict.key === lookKey ? verdict.refused : [];
  const offered = guarded.filter((p) => !refused.includes(p.value));
  const hidden = all.filter((p) => !offered.some((o) => o.value === p.value));
  const presets = offered.map((p) => ({ ...p, visual: <FineVisual c={c} value={p.value} /> }));
  const set = (n: number) => {
    const mine = ++seq.current;
    const local = fineProblem(id, n, look, preset);
    if (local) { setTyped(local); return; }
    setTyped('');
    // A preset the engine already accepted is written at once; anything else after the engine has had its say.
    if (offered.some((p) => p.value === n) && verdict.key === lookKey) { const next = writeFine(id, n, look, preset); if (next !== look) onLook(next); return; }
    void engineRefusal(id, n, look, preset, definitionOf).then((why) => {
      if (mine !== seq.current) return;
      if (why) { setTyped(why); return; }
      const next = writeFine(id, n, look, preset);
      if (next !== look) onLook(next);
    });
  };
  const note = hidden.length ? `${hidden.map((p) => p.label).join(' and ')} ${hidden.length === 1 ? 'is' : 'are'} not offered: ${hidden.length === 1 ? 'it' : 'they'} would break a design of this look.` : undefined;
  return (
    <PresetNumber label={c.label} hint={c.hint} presets={presets} value={reading.value} custom={!reading.linked} min={c.min} max={c.max} step={c.step} unit={c.unit}
      disabled={disabled} onChange={set} error={typed || undefined} note={note} />
  );
}

const ROLE_NAME: Record<FontRole, string> = { display: 'Headlines', text: 'Body text', label: 'Labels', mono: 'Figures and code' };

// The weights of one library font as samples, each a toggle: set in the family, "Used" under the ones the look needs.
export function WeightStripRow({ strip, fonts, disabled, onWeights, label }: { strip: WeightStrip; fonts: FontFamilyInfo[]; disabled?: boolean; onWeights: (w: number[]) => void; label?: string }) {
  const id = useId();
  const info = fonts.find((f) => f.family === strip.family);
  useEffect(() => { if (info) ensureFamily(info); }, [info]);
  const missing = strip.needed.filter((w) => !strip.chosen.includes(w));
  return (
    <div role="group" aria-labelledby={`${id}-l`} aria-describedby={`${id}-d`} className="flex min-w-0 flex-col gap-1">
      <div className="flex flex-wrap items-baseline gap-x-2 text-[12.5px]">
        <span id={`${id}-l`} className="font-medium">{label ?? ROLE_NAME[strip.role]}</span>
        <span className="text-muted-foreground">{strip.family}</span>
      </div>
      <span id={`${id}-d`} className="sr-only">Up to {strip.max} weights. A weight a type setting is at cannot be switched off.</span>
      <div className="flex flex-wrap gap-1">
        {strip.offered.map((w) => {
          const on = strip.chosen.includes(w);
          const blocked = toggleWeight(strip, w) === strip.chosen;
          const used = strip.needed.includes(w) || strip.locked.includes(w);
          return (
            <button key={w} type="button" aria-pressed={on} disabled={disabled || blocked} onClick={() => onWeights(toggleWeight(strip, w))}
              aria-label={`${w}${used ? ', used by this look' : ''}`}
              className={cn('flex h-12 w-11 flex-col items-center justify-center gap-0.5 rounded-md border text-foreground outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed max-sm:h-14 max-sm:w-12',
                on ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'bg-background hover:border-foreground/40', !on && blocked && 'opacity-45')}>
              <span aria-hidden="true" className="text-[17px] leading-none" style={{ fontFamily: cardFontFamily(strip.family), fontWeight: w }}>Ag</span>
              <span aria-hidden="true" className="font-mono text-[10px] leading-none text-muted-foreground tabular-nums">{w}</span>
              <span aria-hidden="true" className={cn('h-1 w-1 rounded-full', used ? 'bg-primary' : 'bg-transparent')} />
            </button>
          );
        })}
      </div>
      {missing.length > 0 && <p className="text-[12px] text-muted-foreground">Used but not listed: {missing.join(', ')}.</p>}
    </div>
  );
}

// The weight strips of every library font of the look (a brand font has its own uploaded weights).
export function WeightStrips({ look, comps, fonts, max, disabled, onChange }: { look: Json; comps: Json[]; fonts: FontFamilyInfo[]; max?: number; disabled?: boolean; onChange: (path: string, value: unknown) => void }) {
  const strips = FONT_ROLES.map((r) => weightStrip(look, comps, r, fonts, { max })).filter((s): s is WeightStrip => !!s);
  if (!strips.length) return null;
  return (
    <fieldset className="flex min-w-0 flex-col gap-3" disabled={disabled}>
      <legend className="mb-1 flex items-center gap-1 text-[13px] font-medium">Weights<Hint about="Weights">The weights each font is embedded at, up to {max ?? 4}. A dot marks the weights this look's settings and designs use; a choice above adds them for you.</Hint></legend>
      {strips.map((s) => <WeightStripRow key={s.role} strip={s} fonts={fonts} disabled={disabled} onWeights={(w) => onChange(`fonts.${s.role}.weights`, w)} />)}
    </fieldset>
  );
}
