// "Apply this look": the style settings the AI proposed from a design reference, sketched beside the brand as it is now, with what
// changes and how the colour checks come out. Nothing is saved until an admin accepts; the server checks the proposal again and
// saves it like any change to the brand.
import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../api';
import { errorMessage } from '../../lib/errors';
import { BusyButton, Notice } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { LABELS, ROLE_LABEL, type BrandLook, type BrandSettings, type DesignReference } from './brand-types';
import { StyleSketch } from './StyleSketch';

type Side = BrandLook & { settings: BrandSettings };
interface ProposalView { current: Side; proposed: Side }

// What the proposal changes, in words: every colour role it sets and every style choice that differs.
function differences(a: BrandSettings, b: BrandSettings): Array<{ what: string; from: string; to: string; colour?: boolean }> {
  const out: Array<{ what: string; from: string; to: string; colour?: boolean }> = [];
  for (const [g, roles] of Object.entries(b.roles)) {
    for (const [k, v] of Object.entries(roles)) if (v && v !== (a.roles as Record<string, Record<string, string | undefined>>)[g]?.[k]) out.push({ what: ROLE_LABEL[`${g}.${k}`] ?? k, from: (a.roles as Record<string, Record<string, string | undefined>>)[g]?.[k] ?? 'from the four colours', to: v, colour: true });
  }
  const word = (v: unknown) => (v === null || v === undefined ? "the brand's" : typeof v === 'string' ? LABELS[v] ?? v : String(v));
  const pairs: Array<[string, unknown, unknown]> = [
    ['Headline case', a.style.type.display.case, b.style.type.display.case], ['Headline letter spacing', a.style.type.display.tracking, b.style.type.display.tracking],
    ['Headline weight', a.style.type.display.weight, b.style.type.display.weight], ['Label case', a.style.type.label.case, b.style.type.label.case],
    ['Label letter spacing', a.style.type.label.tracking, b.style.type.label.tracking], ['Label font', a.style.type.label.font, b.style.type.label.font],
    ['Second half of a headline', a.style.type.accent, b.style.type.accent], ['Cards and panels', a.style.surface, b.style.surface],
    ['Decoration', a.style.decoration.kind, b.style.decoration.kind], ['Decoration on', a.style.decoration.on, b.style.decoration.on],
    ['Photos', a.style.photo.treatment, b.style.photo.treatment], ['Photo strength', a.style.photo.strength, b.style.photo.strength],
  ];
  for (const [what, x, y] of pairs) if (x !== y) out.push({ what, from: word(x), to: word(y) });
  return out;
}

const failing = (l: BrandLook) => l.checks.filter((c) => !c.ok).length;

export function ApplyLook({ reference, open, onClose, logo }: { reference: DesignReference; open: boolean; onClose: () => void; logo?: string | null }) {
  const [data, setData] = useState<ProposalView | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setData(null); setError('');
    api.get<ProposalView>(`/api/settings/brand/references/${reference.id}/proposal`).then(setData).catch((err) => setError(errorMessage(err)));
  }, [open, reference.id]);

  async function accept() {
    setBusy(true);
    try {
      await api.post(`/api/settings/brand/references/${reference.id}/apply`, {});
      toast.success('The look is applied. New images use it from now on; change any part of it in Brand and look.');
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const diff = data ? differences(data.current.settings, data.proposed.settings) : [];
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Apply this look?</DialogTitle>
          <DialogDescription>The style settings the AI proposes from {reference.fileName}, beside your brand as it is now. Nothing changes until you apply it, and you can change any part of it afterwards in Brand and look.</DialogDescription>
        </DialogHeader>
        {error ? <Notice tone="bad">{error}</Notice>
          : !data ? <Skeleton className="h-64" />
          : (
            <div className="flex flex-col gap-5">
              <div className="grid gap-4 md:grid-cols-2">
                <section aria-label="Now">
                  <h3 className="mb-2 text-[13px] font-semibold">Now</h3>
                  <StyleSketch s={data.current.settings} palette={data.current.palette} logo={logo} compact />
                  <p className="mt-2 text-[12px] text-muted-foreground">{failing(data.current) ? `${failing(data.current)} colour pairs are hard to read.` : 'Every colour pair reads.'}</p>
                </section>
                <section aria-label="With this look">
                  <h3 className="mb-2 text-[13px] font-semibold">With this look</h3>
                  <StyleSketch s={data.proposed.settings} palette={data.proposed.palette} logo={logo} compact />
                  <p className="mt-2 text-[12px] text-muted-foreground">{failing(data.proposed) ? `${failing(data.proposed)} colour pairs would be hard to read; posts with faint text get a warning. You can change those colours after applying.` : 'Every colour pair reads.'}</p>
                </section>
              </div>
              {diff.length ? (
                <div>
                  <h3 className="mb-1.5 text-[13px] font-semibold">What changes</h3>
                  <ul className="grid gap-1 text-[12.5px] sm:grid-cols-2">
                    {diff.map((d) => (
                      <li key={d.what} className="flex items-center gap-1.5">
                        <span className="text-muted-foreground">{d.what}:</span>
                        {d.colour && <span className="inline-block size-3 rounded-full border" style={{ background: d.to }} aria-hidden="true" />}
                        <span className={d.colour ? 'font-mono' : undefined}>{d.to}</span>
                        <span className="text-muted-foreground">(was {d.from})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : <p className="text-[12.5px] text-muted-foreground">This look is the one you have already.</p>}
              <details className="text-[12.5px]">
                <summary className="cursor-pointer">Colour checks with this look</summary>
                <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                  {[...data.proposed.checks].sort((x, y) => Number(x.ok) - Number(y.ok)).map((c) => (
                    <li key={c.label} className="flex items-center gap-1.5">
                      {c.ok ? <Check className="size-3.5 text-primary" aria-label="Readable" /> : <X className="size-3.5 text-destructive" aria-label="Too faint" />}
                      <span className="flex-1">{c.label}</span><span className="tabular-nums text-muted-foreground">{c.ratio.toFixed(1)} : 1</span>
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          )}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>Keep my look</Button>
          <BusyButton type="button" loading={busy} disabled={!data || !diff.length} onClick={() => void accept()}>Apply this look</BusyButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
