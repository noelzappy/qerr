// The live look of the brand: what the server says these settings give (asked after typing stops), the notice about colours it
// adjusted, the colour-pair readability summary, and the four sample pages in a sticky column (wide screens) or a sticky bar.
import { useEffect, useState } from 'react';
import { Check, ChevronDown, ChevronUp, X } from 'lucide-react';
import { api } from '../../../api';
import { Notice } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { validHex, type BrandLook, type BrandSettings, type ContrastCheck, type PaletteChange } from '../brand-types';
import { StyleSketch } from '../StyleSketch';

// Waits for typing to stop, then asks the server what these settings would give.
export function useLook(s: BrandSettings | null, initial: BrandLook | null): BrandLook | null {
  const [look, setLook] = useState<BrandLook | null>(initial);
  useEffect(() => { setLook(initial); }, [initial]);
  const key = s ? JSON.stringify(s) : '';
  useEffect(() => {
    if (!s || !Object.values(s.colours).every(validHex)) return;
    let live = true;
    const t = setTimeout(() => {
      api.post<BrandLook>('/api/settings/brand/preview', s).then((l) => { if (live) setLook(l); }).catch(() => { /* the saved look stays */ });
    }, 350);
    return () => { live = false; clearTimeout(t); };
  }, [key]);
  return look;
}

const COLOUR_NAME: Record<PaletteChange['colour'], string> = { primary: 'primary', accent: 'accent', dark: 'dark' };

// The colours the server moved so text stays readable, side by side with what was picked.
export function Changes({ changes }: { changes: PaletteChange[] }) {
  if (!changes.length) return null;
  return (
    <Notice tone="info" title="Adjusted so text stays readable">
      Where they are used for text, posts use {changes.map((c, i) => (
        <span key={c.colour}>
          {i > 0 && (i === changes.length - 1 ? ' and ' : ', ')}
          a slightly {c.colour === 'accent' ? 'lighter' : 'darker'} {COLOUR_NAME[c.colour]}
          {' '}<span className="inline-flex items-center gap-1 align-middle">
            <span className="inline-block size-3 rounded-full border" style={{ background: c.from }} aria-hidden="true" />
            <span className="font-mono text-[12px]">{c.from}</span> → <span className="inline-block size-3 rounded-full border" style={{ background: c.to }} aria-hidden="true" />
            <span className="font-mono text-[12px]">{c.to}</span>
          </span>
        </span>
      ))}. Large shapes keep the colours you picked.
    </Notice>
  );
}

export const readabilityText = (checks: ContrastCheck[]) => {
  const failing = checks.filter((c) => !c.ok).length;
  return failing ? `${failing} of ${checks.length} colour pairs are hard to read` : `All ${checks.length} colour pairs are readable`;
};

// The colour pairs (text on each page colour) with the ratio each reaches.
export function Readability({ checks }: { checks: ContrastCheck[] }) {
  const failing = checks.filter((c) => !c.ok);
  return (
    <details className="rounded-lg border p-3" open={failing.length > 0}>
      <summary className="cursor-pointer text-[13.5px] font-medium">
        {readabilityText(checks)} <span className="font-normal text-muted-foreground">(headlines, sub lines, labels and accent words on every page colour)</span>
      </summary>
      <ul className="mt-3 grid gap-1.5 text-[12.5px] sm:grid-cols-2">
        {[...checks].sort((a, b) => Number(a.ok) - Number(b.ok)).map((c) => (
          <li key={c.label} className="flex items-center gap-2">
            {c.ok ? <Check className="size-3.5 text-primary" aria-label="Readable" /> : <X className="size-3.5 text-destructive" aria-label="Too faint" />}
            <span className="flex-1">{c.label}{c.set && <span className="text-muted-foreground"> (a colour you set)</span>}</span>
            <span className="tabular-nums text-muted-foreground">{c.ratio.toFixed(1)} : 1 (needs {c.needs})</span>
          </li>
        ))}
      </ul>
      {failing.length > 0 && <p className="mt-2 text-[12.5px] text-muted-foreground">Posts with faint text get a warning from the design checks. {failing.some((c) => c.set) ? 'Colours you set yourself are used exactly as you set them: change them, or reset them to automatic. ' : ''}Otherwise make the dark colour darker or the light colour lighter: the four colours you picked are as far as the automatic adjustment can go.</p>}
    </details>
  );
}

interface SketchProps { s: BrandSettings; look: BrandLook | null; fallbackChecks: ContrastCheck[]; logo: string | null; artwork: string | null; font: string | null }

// Wide screens: the four sample pages stay beside the form while it is scrolled.
export function PreviewRail({ s, look, fallbackChecks, logo, artwork, font }: SketchProps) {
  const checks = look?.checks ?? fallbackChecks;
  return (
    <aside aria-label="Preview of your posts" className="hidden xl:sticky xl:top-0 xl:block xl:self-start">
      <div className="flex flex-col gap-2 rounded-lg border bg-card p-3">
        <h2 className="text-[13px] font-semibold">Preview</h2>
        <StyleSketch s={s} palette={look?.palette ?? null} logo={logo} artwork={artwork} font={font} compact />
        <p className="text-[12.5px] text-muted-foreground" role="status">{readabilityText(checks)}. A sketch: the real images are made by Vesk.</p>
      </div>
    </aside>
  );
}

// Narrower screens: a bar that stays at the top while the form is scrolled and opens to the four sample pages.
export function PreviewBar({ s, look, fallbackChecks, logo, artwork, font }: SketchProps) {
  const [open, setOpen] = useState(false);
  const checks = look?.checks ?? fallbackChecks;
  return (
    <div className="sticky top-14 z-20 rounded-lg border bg-background/95 shadow-sm backdrop-blur md:top-0 xl:hidden">
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold">Preview</div>
          <div className="truncate text-[12.5px] text-muted-foreground" role="status">{readabilityText(checks)}</div>
        </div>
        <Button type="button" variant="outline" size="sm" aria-expanded={open} aria-controls="brand-preview-samples" onClick={() => setOpen((o) => !o)}>
          {open ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />} {open ? 'Hide samples' : 'Show samples'}
        </Button>
      </div>
      {open && (
        <div id="brand-preview-samples" className="max-h-[60vh] overflow-y-auto border-t p-3">
          <StyleSketch s={s} palette={look?.palette ?? null} logo={logo} artwork={artwork} font={font} compact className="sm:grid-cols-4" />
        </div>
      )}
    </div>
  );
}
