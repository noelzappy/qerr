// "This period": the occasions of the dates picked in Draft with AI, as chips the person ticks (period-occasions.ts has the rules).
// The calendar's come from GET /api/batches/ai-draft/occasions; "Look for events this month" (with a search key) asks
// POST /api/batches/ai-draft/occasions/web, which runs an AI call and adds its finds unticked, marked "from the web".
import { useEffect, useId, useState } from 'react';
import { Globe, Plus, X } from 'lucide-react';
import { api } from '../../api';
import { BusyButton, Hint } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { errorMessage } from '../../lib/errors';
import { countryName } from '../../lib/countries';
import {
  MAX_NAME, MAX_OWN, addOwn, addWeb, chipDate, mergeCalendar, ownProblem, removeChip, toggle,
  type CalendarOccasion, type OccasionChip, type WebOccasion,
} from './period-occasions';

const KIND_WORD: Record<OccasionChip['kind'], string> = { holiday: 'Public holiday', observance: 'Observance', season: 'Season', commerce: 'Shopping and money' };

export function PeriodOccasions({ period, search, chips, onChange }: {
  period: { from: string; to: string }; search: boolean; chips: OccasionChip[]; onChange: (next: OccasionChip[] | ((cur: OccasionChip[]) => OccasionChip[])) => void;
}) {
  const id = useId();
  const [country, setCountry] = useState<string | null | undefined>(undefined);
  const [loadError, setLoadError] = useState('');
  const [own, setOwn] = useState('');
  const [ownError, setOwnError] = useState('');
  const [looking, setLooking] = useState(false);
  const [webNote, setWebNote] = useState('');

  useEffect(() => {
    if (!period.from || !period.to || period.to < period.from) return;
    let current = true;
    setLoadError('');
    api.get<{ country: string | null; occasions: CalendarOccasion[] }>(`/api/batches/ai-draft/occasions?from=${period.from}&to=${period.to}`)
      .then((r) => { if (!current) return; setCountry(r.country); onChange((cur) => mergeCalendar(cur, r.occasions, period)); })
      .catch((e) => { if (current) setLoadError(errorMessage(e, 'The occasions could not be loaded.')); });
    return () => { current = false; };
    // (onChange is the parent's state setter, which never changes)
  }, [period.from, period.to]);

  function add() {
    const problem = ownProblem(chips, own);
    setOwnError(problem);
    if (problem) return;
    onChange(addOwn(chips, own));
    setOwn('');
  }

  async function lookOnWeb() {
    setLooking(true); setWebNote('');
    try {
      const r = await api.post<{ occasions: WebOccasion[] }>('/api/batches/ai-draft/occasions/web', { periodStart: period.from, periodEnd: period.to, known: chips.map((c) => c.name).slice(0, 60) });
      const next = addWeb(chips, r.occasions);
      onChange(next);
      setWebNote(next.length > chips.length ? `${next.length - chips.length} found on the web. Tick the ones to use, and check their sources.` : 'Nothing new was found on the web.');
    } catch (e) {
      setWebNote(errorMessage(e, 'The search did not work.'));
    } finally {
      setLooking(false);
    }
  }

  const ownCount = chips.filter((c) => c.origin === 'own').length;
  return (
    <fieldset className="flex min-w-0 flex-col gap-2" aria-describedby={`${id}-hint`}>
      <legend className="mb-1 flex items-center gap-1 text-sm font-medium">
        <span>This period</span>
        <Hint about="This period">The AI plans posts around the ticked occasions where they fit the brand, on the right dates. It names an occasion and its date as given, and never claims the brand does something for it unless a fact says so.</Hint>
      </legend>
      <p id={`${id}-hint`} className="text-[12.5px] text-muted-foreground">
        {country === undefined ? 'Loading the occasions…' : country ? <>Holidays and observances in {countryName(country)}. Untick any that do not suit.</> : <>No country is set for the brand, so only worldwide occasions are listed. Set it in Settings, Brand and look.</>}
      </p>
      {loadError && <p className="text-[12.5px] font-medium text-destructive" role="alert">{loadError}</p>}
      <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label="Occasions">
        {chips.map((c) => (
          <li key={c.key} className="flex">
            <label
              title={[c.note, c.source ? `Source: ${c.source}` : ''].filter(Boolean).join('\n') || undefined}
              className={cn(
                'inline-flex min-h-11 cursor-pointer items-center gap-1.5 border px-2.5 text-[13px] transition-colors sm:min-h-8',
                c.origin === 'calendar' ? 'rounded-md' : 'rounded-l-md',
                'has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50',
                c.ticked ? 'border-primary bg-primary text-primary-foreground' : 'bg-transparent hover:bg-accent',
              )}
            >
              <input type="checkbox" className="sr-only" checked={c.ticked} onChange={() => onChange(toggle(chips, c.key))} />
              <span className="font-medium">{c.name}</span>
              {c.date && <span className={cn('tabular-nums', c.ticked ? 'opacity-80' : 'text-muted-foreground')}>{chipDate(c)}</span>}
              {c.origin === 'web' && <span className={cn('inline-flex items-center gap-0.5 text-[11px]', c.ticked ? 'opacity-80' : 'text-muted-foreground')}><Globe className="size-3" aria-hidden="true" />from the web</span>}
              {c.origin === 'own' && <span className={cn('text-[11px]', c.ticked ? 'opacity-80' : 'text-muted-foreground')}>yours</span>}
              <span className="sr-only">{`, ${KIND_WORD[c.kind]}`}{c.note ? `. ${c.note}` : ''}</span>
            </label>
            {c.origin !== 'calendar' && (
              <button type="button" aria-label={`Remove ${c.name}`} onClick={() => onChange(removeChip(chips, c.key))}
                className={cn('inline-flex min-h-11 w-8 items-center justify-center rounded-r-md border border-l-0 text-muted-foreground hover:bg-accent sm:min-h-8', c.ticked && 'border-primary')}
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label="An occasion of your own" placeholder="Add your own, such as our winter fair" maxLength={MAX_NAME} value={own}
            onChange={(e) => { setOwn(e.target.value); setOwnError(''); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
            disabled={ownCount >= MAX_OWN} className="h-9 min-w-0 flex-1 max-sm:h-11 sm:max-w-xs"
          />
          <Button type="button" variant="outline" size="sm" className="max-sm:min-h-11" onClick={add} disabled={ownCount >= MAX_OWN}><Plus aria-hidden="true" />Add</Button>
          {search && (
            <BusyButton type="button" variant="outline" size="sm" className="max-sm:min-h-11" loading={looking} disabled={!country} onClick={() => void lookOnWeb()}>
              <Globe aria-hidden="true" />Look for events this month
            </BusyButton>
          )}
        </div>
        {ownError && <p className="text-[12.5px] font-medium text-destructive" role="alert">{ownError}</p>}
        {search && <p className="text-[12.5px] text-muted-foreground" role="status">{webNote || 'The web search uses the AI and counts towards the monthly budget.'}</p>}
      </div>
    </fieldset>
  );
}
