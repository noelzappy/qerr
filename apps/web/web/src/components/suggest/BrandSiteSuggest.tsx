// "Suggest from website": asks POST /api/suggest/brand-from-site (admins) to read the brand's home page and draft what it does,
// a tagline, the voice, the visual direction and two colours. Each suggestion is shown with its own Use button; using one puts
// it in the form's field, where it stays editable and is saved only with the page's Save. Nothing a person typed is replaced
// without their click ("Replace" then says so), and what was filled in is marked as the AI's until the page is left.
//
// `BrandSiteSuggest` is the generic piece (the guided setup can use it, or call `suggestBrandFromSite` itself);
// `BrandSettingsSiteSuggest` binds it to the Brand and look form.
import { useState } from 'react';
import { Check, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/api';
import { BusyButton, Notice } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/errors';
import { useSession } from '@/session';
import type { BrandCtx } from '@/pages/settings/brand/model';
import { AiMark, useSuggestReady } from './shared';

export type BrandSiteField = 'descriptor' | 'tagline' | 'voice' | 'visualDirection' | 'primary' | 'accent';
export interface BrandSiteSuggestion {
  descriptor?: string; tagline?: string; voice?: string; visualDirection?: string;
  colours?: { primary?: string; accent?: string };
  source?: { url: string | null };
}

// The one call, for any page that wants the suggestions without this component (the guided setup).
export const suggestBrandFromSite = (website: string) => api.post<BrandSiteSuggestion>('/api/suggest/brand-from-site', { website });

const FIELDS: Array<{ key: BrandSiteField; label: string; where: string; noun: string }> = [
  { key: 'voice', label: 'Voice', where: 'Voice and spelling', noun: 'voice' },
  { key: 'visualDirection', label: 'Visual direction', where: 'Voice and spelling', noun: 'visual direction' },
  { key: 'descriptor', label: 'What you do', where: 'Identity', noun: 'description of what you do' },
  { key: 'tagline', label: 'Tagline', where: 'Identity', noun: 'tagline' },
  { key: 'primary', label: 'Main colour', where: 'Colours', noun: 'main colour' },
  { key: 'accent', label: 'Accent colour', where: 'Colours', noun: 'accent colour' },
];

const valueOf = (s: BrandSiteSuggestion, k: BrandSiteField): string | undefined => (k === 'primary' || k === 'accent' ? s.colours?.[k] : s[k]);
const hostOf = (url: string | null | undefined, fallback: string) => { try { return url ? new URL(url).hostname : fallback; } catch { return fallback; } };

export function BrandSiteSuggest({ website, values, onUse, fields }: {
  website: string;
  // What the form holds now, so a suggestion can say "Replace" instead of "Use" and an equal one shows as in use.
  values: Partial<Record<BrandSiteField, string>>;
  onUse: (field: BrandSiteField, value: string) => void;
  // Which suggestions to offer, in this order (all by default).
  fields?: BrandSiteField[];
}) {
  const ready = useSuggestReady();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [found, setFound] = useState<BrandSiteSuggestion | null>(null);
  // What was filled in from a suggestion, by field, so the mark stays while the field still holds it.
  const [used, setUsed] = useState<Partial<Record<BrandSiteField, string>>>({});
  const site = website.trim();
  const shown = FIELDS.filter((f) => (fields ?? FIELDS.map((x) => x.key)).includes(f.key));
  const rows = found ? shown.filter((f) => valueOf(found, f.key)) : [];
  const blocked = ready && !ready.available ? ready.reason : null;

  async function ask() {
    setBusy(true); setError(''); setFound(null);
    try {
      const s = await suggestBrandFromSite(site);
      setFound(s);
      if (!shown.some((f) => valueOf(s, f.key))) setError('The website did not say enough to suggest anything. Write these in your own words.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function use(f: (typeof FIELDS)[number], value: string) {
    const before = values[f.key] ?? '';
    onUse(f.key, value);
    setUsed((u) => ({ ...u, [f.key]: value }));
    if (before.trim() && before !== value) {
      toast(`Replaced the ${f.noun}.`, { duration: 10000, action: { label: 'Undo', onClick: () => { onUse(f.key, before); setUsed(({ [f.key]: _gone, ...rest }) => rest); } } });
    }
  }

  const usedLabels = shown.filter((f) => used[f.key] !== undefined && values[f.key] === used[f.key]).map((f) => f.label);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <BusyButton variant="outline" size="sm" loading={busy} disabled={!site || !!blocked} onClick={() => void ask()}>
          {!busy && <Sparkles aria-hidden="true" />}{busy ? 'Reading the website' : 'Suggest from website'}
        </BusyButton>
        <span className="text-[12.5px] text-muted-foreground [overflow-wrap:anywhere]">
          {!site ? 'Add your website under Identity first.' : blocked ?? `Reads ${hostOf(/^https?:\/\//i.test(site) ? site : `https://${site}`, site)}. Nothing changes until you use a suggestion.`}
        </span>
      </div>
      {error && <Notice tone={found ? 'info' : 'bad'}>{error}</Notice>}
      {found && rows.length > 0 && (
        <section aria-label="Suggestions from your website" className="rounded-lg border">
          <div className="flex items-center justify-between gap-2 border-b px-3 py-1.5">
            <AiMark>Suggested by the AI from {hostOf(found.source?.url, site)}</AiMark>
            <Button type="button" variant="ghost" size="icon-sm" className="max-sm:size-11" aria-label="Close the suggestions" onClick={() => setFound(null)}><X aria-hidden="true" /></Button>
          </div>
          <ul className="m-0 list-none divide-y p-0">
            {rows.map((f) => {
              const value = valueOf(found, f.key)!;
              const current = values[f.key] ?? '';
              const inUse = current === value;
              const colour = f.key === 'primary' || f.key === 'accent';
              return (
                <li key={f.key} className="flex flex-col gap-1.5 px-3 py-2.5 sm:flex-row sm:items-start sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-medium">{f.label} <span className="font-normal text-muted-foreground">· {f.where}</span></div>
                    {colour
                      ? <div className="mt-1 flex items-center gap-2 text-[13px]"><span className="size-5 rounded border" style={{ background: value }} aria-hidden="true" /><span className="font-mono">{value}</span></div>
                      : <p className="m-0 mt-0.5 whitespace-pre-line text-[13px] [overflow-wrap:anywhere]">{value}</p>}
                  </div>
                  {inUse
                    ? <span className="inline-flex h-7 items-center gap-1 text-[12.5px] text-success max-sm:min-h-11"><Check className="size-3.5" aria-hidden="true" />In use</span>
                    : <Button type="button" variant="outline" size="sm" className="shrink-0 self-start max-sm:min-h-11" aria-label={`${current.trim() ? 'Replace with' : 'Use'} the suggested ${f.noun}`} onClick={() => use(f, value)}>{current.trim() ? 'Replace' : 'Use'}</Button>}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {!found && usedLabels.length > 0 && (
        <AiMark>{usedLabels.join(', ')} filled in by the AI. Check {usedLabels.length > 1 ? 'them' : 'it'} before you save.</AiMark>
      )}
      {found && usedLabels.length > 0 && <span className="sr-only" role="status">{usedLabels.join(', ')} filled in by the AI.</span>}
    </div>
  );
}

// The Brand and look form's binding: values from the settings, a used suggestion written into them (saved with the page's Save).
export function BrandSettingsSiteSuggest({ ctx }: { ctx: BrandCtx }) {
  const { me } = useSession();
  if (me?.role !== 'admin') return null;
  const { s } = ctx;
  return (
    <BrandSiteSuggest
      website={s.website}
      values={{ descriptor: s.descriptor, tagline: s.tagline, voice: s.voice, visualDirection: s.visualDirection, primary: s.colours.primary, accent: s.colours.accent }}
      onUse={(field, value) => {
        if (field === 'primary' || field === 'accent') ctx.update((cur) => ({ ...cur, colours: { ...cur.colours, [field]: value } }));
        else ctx.set(field, value);
      }}
    />
  );
}
