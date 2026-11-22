// Step 1, Your brand: the name and the website, with the rest offered from the website by the AI when it is set up. The time
// zone and the language come from the browser, and the country from the time zone (marked as filled in); all stay one "Change" away. Saved with PUT /api/settings/brand (the first save
// makes the brand; see brandSettingsFor in flow.ts for what it keeps from the example brand).
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '../../api';
import { useLoad } from '../../hooks';
import { useAppInfo } from '../../app-info';
import { errorMessage, fieldErrors } from '../../lib/errors';
import { BusyButton, ErrorBlock, FilledTag, FormProblem, SelectField, TextAreaField, TextField } from '@/components/kit';
import { countryName, countryOptions } from '../../lib/countries';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { BrandView } from '../settings/brand-types';
import {
  applySuggestion, brandSettingsFor, clearDraft, countryFromZone, detectZone, withZone, draftFromSettings, emptyDraft, languageFor, LANGUAGES, loadDraft, readSuggestion, saveDraft,
  saveSiteColours, sessionStore, typeInDraft, type BrandDraft,
} from './flow';
import { StepActions, StepHeader, SuggestedNote, type StepProps } from './parts';
import { TimeZonePicker } from '@/components/kit/time-zone-picker';

const COUNTRIES = countryOptions();

// Whether this server has the suggestion route at all (another part of the app adds it); once it answers "not here", the button
// stays hidden for the rest of the visit.
let suggestMissing = false;

export function StepBrand({ status, reload, next }: StepProps) {
  const view = useLoad(() => api.get<BrandView>('/api/settings/brand'), []);
  const appInfo = useAppInfo();
  const store = sessionStore();
  const [d, setD] = useState<BrandDraft | null>(null);
  const [changing, setChanging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [hideSuggest, setHideSuggest] = useState(suggestMissing);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});

  // The typing of an earlier visit comes back first; else the saved brand's words; else an empty form with the browser's zone.
  useEffect(() => {
    if (!view.data || d) return;
    setD(loadDraft(store) ?? (view.data.saved ? draftFromSettings(view.data.settings) : emptyDraft(detectZone(), languageFor(navigator.language))));
  }, [view.data, d, store]);
  useEffect(() => { if (d) saveDraft(store, d); }, [d, store]);

  if (view.error) return <ErrorBlock message={view.error} onRetry={() => void view.reload()} />;
  if (!view.data || !d) return <div className="flex flex-col gap-3"><Skeleton className="h-7 w-48" /><Skeleton className="h-48" /></div>;
  const v = view.data;
  const type = (k: Parameters<typeof typeInDraft>[1]) => (e: { target: { value: string } }) => setD((cur) => (cur ? typeInDraft(cur, k, e.target.value) : cur));
  const canSuggest = status.steps.ai.done && !hideSuggest;

  async function suggest() {
    if (!d) return;
    if (!d.website.trim()) { setFields({ website: 'Enter the website first' }); return; }
    setSuggesting(true); setError('');
    try {
      const raw = await api.post<unknown>('/api/suggest/brand-from-site', { website: d.website.trim(), name: d.name.trim() });
      const { draft, filled } = applySuggestion(d, readSuggestion(raw));
      setD(draft);
      saveSiteColours(store, draft.colours);
      toast.success(filled.length ? 'Filled in from your website' : 'Nothing new to fill in: your own words are kept');
    } catch (err) {
      // No such route on this server, or the AI is not set up after all: the button goes, and the form works as before.
      if (err instanceof ApiError && [404, 405, 501].includes(err.status)) { suggestMissing = true; setHideSuggest(true); }
      else setError(errorMessage(err, 'The website could not be read. Fill in the rest yourself.'));
    } finally {
      setSuggesting(false);
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!d) return;
    const problems: Record<string, string> = {};
    if (!d.name.trim()) problems.name = 'Give the brand a name';
    if (!d.website.trim()) problems.website = 'Give the website people should visit';
    if (!d.tagline.trim()) problems.tagline = 'Give a short tagline';
    setFields(problems);
    if (Object.keys(problems).length) return;
    setSaving(true); setError('');
    try {
      await api.put<BrandView>('/api/settings/brand', brandSettingsFor(v.settings, d, !v.saved));
      saveSiteColours(store, d.colours);
      clearDraft(store);
      appInfo.reload();
      await reload();
      next();
    } catch (err) {
      setFields(fieldErrors(err));
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={(e) => void save(e)} noValidate>
      <StepHeader title="Your brand">The name and website go on every post.</StepHeader>
      <div className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Brand name" value={d.name} onChange={type('name')} error={fields.name} maxLength={80} required autoFocus autoComplete="organization" />
          <TextField label="Website" value={d.website} onChange={type('website')} error={fields.website} maxLength={120} required placeholder="example.com" inputMode="url" autoComplete="url" />
        </div>
        {canSuggest && (
          <div>
            <BusyButton type="button" variant="outline" size="sm" className="max-sm:min-h-11" loading={suggesting} onClick={() => void suggest()} disabled={!d.website.trim()}>
              <Sparkles aria-hidden="true" />Fill in from your website
            </BusyButton>
          </div>
        )}
        <div className="flex flex-col gap-1">
          <TextField label="Tagline" value={d.tagline} onChange={type('tagline')} error={fields.tagline} maxLength={160} required placeholder="Bread from the hill, every morning" />
          {d.suggested.includes('tagline') && <SuggestedNote />}
        </div>
        <div className="flex flex-col gap-1">
          <TextField label="What the brand does" optional hint="One line. The AI reads it when it writes posts." value={d.descriptor} onChange={type('descriptor')} error={fields.descriptor} maxLength={200} />
          {d.suggested.includes('descriptor') && <SuggestedNote />}
        </div>
        {(d.voice || d.suggested.includes('voice')) && (
          <div className="flex flex-col gap-1">
            <TextAreaField label="How the brand sounds" optional hint="The AI writes in this voice." value={d.voice} onChange={type('voice')} error={fields.voice} rows={3} maxLength={4000} />
            {d.suggested.includes('voice') && <SuggestedNote />}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 border-t pt-4">
        {!changing ? (
          <p className="flex flex-wrap items-center gap-x-2 text-[13px]">
            <span>
              Posts are planned in <span className="font-medium">{d.timezone.replace(/_/g, ' ')}</span> time and written in <span className="font-medium">{d.language}</span>
              {d.country ? <>, with the holidays of <span className="font-medium">{countryName(d.country)}</span>{countryFromZone(d) && <FilledTag>From the time zone</FilledTag>}</> : <>; no country is set, so drafts get no local holidays</>}.
            </span>
            <Button type="button" variant="link" size="sm" className="h-auto p-0 max-sm:min-h-11" onClick={() => setChanging(true)}>Change</Button>
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <TimeZonePicker label="Time zone" value={d.timezone} onChange={(z) => setD(withZone(d, z))} error={fields.timezone} />
            <SelectField
              label={<>Country{countryFromZone(d) && <FilledTag>From the time zone</FilledTag>}</>} optional hint="Drafts are offered its holidays and observances"
              value={d.country} onValueChange={(c) => setD({ ...d, country: c })} options={COUNTRIES} placeholder="Choose a country" error={fields.country}
            />
            <SelectField label="Language of the posts" value={d.language} onValueChange={(l) => setD({ ...d, language: l })} options={(LANGUAGES.includes(d.language) ? LANGUAGES : [d.language, ...LANGUAGES]).map((l) => ({ value: l, label: l }))} error={fields.language} />
          </div>
        )}
      </div>

      <FormProblem error={error} />
      <StepActions step="brand" busy={saving} form={undefined} primary={<BusyButton type="submit" className="max-sm:min-h-11" loading={saving}>Continue</BusyButton>} />
    </form>
  );
}
