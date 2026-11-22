// Brand and look, Identity and Logos.
import { ImageUp, Wand2 } from 'lucide-react';
import { BusyButton, CheckField, Hint, Notice, SelectField, SwitchField, TextField } from '@/components/kit';
import { TimeZonePicker } from '@/components/kit/time-zone-picker';
import { Section } from '../section';
import { FileField, NumberField } from './fields';
import { buildCurrencyPattern, currencyListProblem, parseCurrencyPattern } from './currency';
import { TagListField } from './tag-list-field';
import { SavedNote, useReportProblem, useUploadStatus } from './status';
import type { BrandCtx } from './model';
import type { BrandNumbers } from '../brand-types';

const LANGUAGES = ['British English', 'American English', 'Australian English', 'Canadian English', 'French', 'German', 'Spanish', 'Portuguese', 'Dutch', 'Italian'];
// The starting list when "one currency only" is switched on.
const DEFAULT_FOREIGN = '\\$|£|€';

function OtherCurrencies({ ctx }: { ctx: BrandCtx }) {
  const { s, set, fields } = ctx;
  const money = s.money!;
  const words = parseCurrencyPattern(money.foreign);
  const problem = words ? currencyListProblem(words) : '';
  useReportProblem('currencies', problem ? `Other currencies to flag: ${problem}` : '');
  if (!words) {
    return (
      <Notice tone="info" title="Other currencies to flag">
        This brand uses a more detailed rule than a list of words, so it is kept as it is and can be changed under Advanced. Posts that match it get a warning.
      </Notice>
    );
  }
  return (
    <TagListField
      label="Other currencies to flag" values={words} placeholder="For example £, euros or USD" addLabel="Add"
      hint="Words or symbols for currencies you do not use, such as $, £ or dollars. A post that mentions one gets a warning."
      error={problem || fields['money.foreign']} onChange={(next) => set('money', { ...money, foreign: buildCurrencyPattern(next) })}
    />
  );
}

// How the numbers of a chart are written: the decimal mark, the thousands separator and the currency sign, before or after the number.
const DEFAULT_NUMBERS: BrandNumbers = { decimal: '.', group: ',', currency: '', currencyAt: 'before', currencySpace: false, percentSpace: false };
function sampleOf(n: BrandNumbers): string {
  const group = { ',': ',', '.': '.', ' ': '\u00a0', thin: '\u202f', none: '' }[n.group];
  const num = `1${group}234${n.decimal}50`;
  return !n.currency ? num : n.currencyAt === 'after' ? `${num}${n.currencySpace ? '\u00a0' : ''}${n.currency}` : `${n.currency}${n.currencySpace ? '\u00a0' : ''}${num}`;
}
function NumbersFields({ ctx }: { ctx: BrandCtx }) {
  const { s, set, fields } = ctx;
  const n = s.numbers ?? DEFAULT_NUMBERS;
  const put = (patch: Partial<BrandNumbers>) => set('numbers', { ...n, ...patch });
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">Numbers in charts <span className="font-normal text-muted-foreground">(shown as {sampleOf(n)})</span></p>
      <div className="grid gap-3 md:grid-cols-4">
        <SelectField label="Decimal mark" value={n.decimal} onValueChange={(v) => put({ decimal: v as BrandNumbers['decimal'] })} options={[{ value: '.', label: 'Point (12.5)' }, { value: ',', label: 'Comma (12,5)' }]} error={fields['numbers.decimal']} />
        <SelectField label="Thousands" value={n.group} onValueChange={(v) => put({ group: v as BrandNumbers['group'] })} options={[{ value: ',', label: 'Comma (1,234)' }, { value: '.', label: 'Point (1.234)' }, { value: ' ', label: 'Space (1 234)' }, { value: 'thin', label: 'Thin space' }, { value: 'none', label: 'None (1234)' }]} error={fields['numbers.group']} />
        <TextField label="Currency sign" optional hint="Such as € or kr" maxLength={4} value={n.currency} onChange={(e) => put({ currency: e.target.value })} error={fields['numbers.currency']} />
        <SelectField label="Sign goes" value={n.currencyAt} onValueChange={(v) => put({ currencyAt: v as BrandNumbers['currencyAt'] })} options={[{ value: 'before', label: 'Before (€12)' }, { value: 'after', label: 'After (12 €)' }]} error={fields['numbers.currencyAt']} />
      </div>
      <div className="flex flex-wrap gap-4">
        <CheckField label="A space between the sign and the number" checked={n.currencySpace} onCheckedChange={(on) => put({ currencySpace: on })} />
        <CheckField label="A space before %" checked={n.percentSpace} onCheckedChange={(on) => put({ percentSpace: on })} />
      </div>
    </div>
  );
}

export function IdentitySection({ ctx }: { ctx: BrandCtx }) {
  const { s, set, fields } = ctx;
  return (
    <Section id="identity" title="Identity" description="Who the brand is. The website is printed on the posts; the description tells the AI what the brand does.">
      <div className="grid gap-3 md:grid-cols-2">
        <TextField label="Brand name" value={s.name} onChange={(e) => set('name', e.target.value)} error={fields.name} maxLength={80} required />
        <TextField label="Website" hint="As it should appear on posts, without https://" value={s.website} onChange={(e) => set('website', e.target.value)} error={fields.website} maxLength={120} required />
        <TextField label="Tagline" value={s.tagline} onChange={(e) => set('tagline', e.target.value)} error={fields.tagline} maxLength={160} required />
        <TextField label="What the brand does" optional hint="One line, for the AI" value={s.descriptor} onChange={(e) => set('descriptor', e.target.value)} error={fields.descriptor} maxLength={200} />
        <TimeZonePicker label="Time zone" hint="Posts are planned in this time zone" value={s.timezone} onChange={(v) => set('timezone', v)} error={fields.timezone} />
        <SelectField label="Language of the posts" value={s.language} onValueChange={(v) => set('language', v)} options={(LANGUAGES.includes(s.language) ? LANGUAGES : [s.language, ...LANGUAGES]).map((l) => ({ value: l, label: l }))} error={fields.language} />
      </div>
      <div className="flex flex-col gap-3">
        <SwitchField
          label="The brand works in one currency only" hint="Posts that mention another currency get a warning."
          checked={!!s.money} onCheckedChange={(on) => set('money', on ? { local: 'We work in one currency only', foreign: DEFAULT_FOREIGN } : null)}
        />
        {s.money && (
          <div className="grid gap-3 md:grid-cols-2">
            <TextField label="Your currency, in words" hint="For example: We work in euros (€) only" value={s.money.local} onChange={(e) => set('money', { ...s.money!, local: e.target.value })} error={fields['money.local']} />
            <OtherCurrencies ctx={ctx} />
          </div>
        )}
      </div>
      <NumbersFields ctx={ctx} />
    </Section>
  );
}

function LogoSlot({ title, hint, src, onFile, busy, statusKey }: { title: string; hint: string; src: string | null; onFile: (f: File) => void; busy: boolean; statusKey: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-24 items-center justify-center rounded-md bg-[repeating-conic-gradient(var(--muted)_0_25%,transparent_0_50%)] bg-[length:16px_16px] p-2">
        {src ? <img src={src} alt={title} className="max-h-full max-w-full object-contain" /> : <span className="text-[13px] text-muted-foreground">Not uploaded yet</span>}
      </div>
      <FileField label={`${title} (PNG)`} hint={hint} accept="image/png" onFile={onFile} busy={busy} icon={<ImageUp aria-hidden="true" />} buttonLabel={`${src ? 'Replace' : 'Upload'} PNG`} statusKey={statusKey} immediate />
    </div>
  );
}

export function LogosSection({ ctx }: { ctx: BrandCtx }) {
  const { s, set, view, busy } = ctx;
  return (
    <Section id="logos" title="Logos" description="The full logo (the mark, then the name) goes on posts; the mark alone is used where space is short and as the app's icon. Transparent PNGs work best.">
      <div className="grid gap-4 md:grid-cols-2">
        <LogoSlot title="Full logo" hint="The mark and the name side by side." src={ctx.logoUrl(view.logos.full)} busy={busy === 'full'} statusKey="logo-full" onFile={(f) => ctx.uploadLogo('full', f, f.name)} />
        <LogoSlot title="Mark" hint="The symbol on its own, about square." src={ctx.logoUrl(view.logos.mark)} busy={busy === 'mark'} statusKey="logo-mark" onFile={(f) => ctx.uploadLogo('mark', f, f.name)} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <BusyButton variant="outline" size="sm" loading={busy === 'simple'} onClick={ctx.drawSimple}><Wand2 aria-hidden="true" /> Draw a simple logo from the name</BusyButton>
        <Hint about="Draw a simple logo">Uses the brand name and the primary colour from this page, and replaces both logos straight away. Upload your real logo any time.</Hint>
        <SimpleSaved />
      </div>
      {view.logos.fullSize && (
        <div className="grid gap-3 md:grid-cols-2">
          <NumberField
            label="Where the name starts in the full logo" integer min={0} max={view.logos.fullSize[0] - 1} unit="pixels" value={s.logo.wordmarkFrom} onChange={(v) => set('logo', { ...s.logo, wordmarkFrom: v ?? 0 })}
            hint={`In pixels from the left, out of ${view.logos.fullSize[0]}. Measured when you upload; on dark pages the name is drawn in white from here.`}
          />
          <NumberField label="Gap between the mark and the name" integer min={0} max={5000} unit="pixels" value={s.logo.markGap} onChange={(v) => set('logo', { ...s.logo, markGap: v ?? 0 })} hint="In pixels." />
        </div>
      )}
    </Section>
  );
}

function SimpleSaved() {
  const { saved, error } = useUploadStatus('logo-simple');
  return <>{saved && <SavedNote />}{error && <span className="text-[13px] font-medium text-destructive" role="alert">{error}</span>}</>;
}
