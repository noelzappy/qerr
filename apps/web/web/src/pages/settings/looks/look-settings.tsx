// The Settings tab of a look: every control is drawn from the engine's catalogue (`lookCatalogue().sections`), so a setting the engine
// adds appears here without UI work. Groups and plain labels come from look-model.ts. Numbers show their range and an inline error
// when out of range (never clamped); the three dials are sliders; the named angles have a small dial; typefaces are picked from
// the font library or "Our own font".
import { useEffect, useState, type ReactNode } from 'react';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { CheckField, FieldGroup, FieldSet, Hint, SelectField, SwitchField, TextField } from '@/components/kit';
import { ChoiceField } from '@/components/kit/segmented-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { blankFor, checkValue, getAt, groupSections, joinPath, labelFor, rangeText, readSetting, valueLabel } from './look-model';
import type { Desc, FontFamilyInfo, Json, LookCatalogue } from './look-types';
import { WeightStripRow } from './settings/fine-tune';
import { FONT_ROLES, weightStrip, type FontRole } from './settings/weights';

export interface SettingsCtx {
  look: Json;
  catalogue: LookCatalogue;
  fonts: FontFamilyInfo[];
  // Problems by control path (the server's, mapped, and the form's own).
  errors: Record<string, string>;
  disabled: boolean;
  onChange: (path: string, value: unknown) => void;
  // Fine-tune: compact controls (the range goes in the tooltip, units sit inside the row) and the dials as exact numbers.
  compact?: boolean;
  exact?: boolean;
  // The weights are drawn elsewhere (Fine-tune's weight strips), so a font leaves them out.
  hideWeights?: boolean;
  // The look's designs, for the weights they use (marked on the weight strips).
  comps?: Json[];
}

// The unit a number is in, shown beside it.
export function unitOf(path: string): string {
  if (path.startsWith('devices.angles.') || path === 'devices.highlight.tilt') return '°';
  if (/(^|\.)(lead|track|wordSpace|pad\[\d\])$/.test(path) && !path.startsWith('devices.frame')) return path.startsWith('devices.highlight') ? '' : 'em';
  if (/(margin|gutter|\.head$|extraLines|^devices\.(rule|frame|shadow)\.|\.size$|^logo\.height$|ruleTop|ruleBelow)/.test(path)) return 'px';
  return '';
}
// The help beside a label; in compact mode it also carries the range the stepper would otherwise print under the field.
const helpWith = (desc: Desc, ctx: SettingsCtx, dial?: boolean): string | undefined => {
  if (!ctx.compact) return desc.help;
  const r = rangeText(desc);
  return [desc.help, r ? `Use ${r}${dial ? ' degrees' : ''}.` : ''].filter(Boolean).join(' ') || undefined;
};

const wide = (d: Desc) => d.kind === 'object' || d.kind === 'list' || d.kind === 'tuple' || d.kind === 'tagged';
const decimals = (step: number) => (String(step).split('.')[1]?.length ?? 0);
const round = (n: number, step: number) => Number(n.toFixed(Math.max(decimals(step), 2)));

function Label2({ id, label, help }: { id: string; label: ReactNode; help?: string }) {
  return <div className="flex min-h-5 items-center gap-1"><Label htmlFor={id}>{label}</Label>{help && <Hint about={label}>{help}</Hint>}</div>;
}
const Err = ({ id, msg }: { id: string; msg?: string }) => (msg ? <p id={id} role="alert" className="text-[12.5px] font-medium text-destructive">{msg}</p> : null);

// A number with a stepper, its range and an inline error. The text being typed is kept as typed; the value is what parses.
function NumberRow({ path, desc, ctx, dial }: { path: string; desc: Desc; ctx: SettingsCtx; dial?: boolean }) {
  const value = readSetting(ctx.look, desc, path);
  const [text, setText] = useState(String(value ?? ''));
  useEffect(() => { if (Number(text) !== value) setText(value === undefined || value === null || Number.isNaN(value) ? '' : String(value)); }, [value]);
  const step = desc.step ?? 1;
  const set = (n: number) => { setText(Number.isNaN(n) ? '' : String(n)); ctx.onChange(path, n); };
  const problem = ctx.errors[path] ?? '';
  const id = `s-${path}`;
  const num = typeof value === 'number' ? value : 0;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label2 id={id} label={labelFor(path, desc)} help={helpWith(desc, ctx, dial)} />
      <div className="flex items-center gap-1.5">
        <Button type="button" variant="outline" size="icon" className="size-8 shrink-0 max-sm:size-11" aria-label={`Decrease ${labelFor(path, desc)}`} disabled={ctx.disabled} onClick={() => set(round(num - step, step))}><Minus aria-hidden="true" /></Button>
        <Input id={id} inputMode="decimal" value={text} disabled={ctx.disabled} aria-invalid={problem ? true : undefined} aria-describedby={`${ctx.compact ? '' : `${id}-range`}${problem ? ` ${id}-err` : ''}`.trim() || undefined}
          onChange={(e) => { setText(e.target.value); set(e.target.value.trim() === '' ? NaN : Number(e.target.value)); }} className={cn('text-center tabular-nums max-sm:h-11 max-sm:text-base', ctx.compact ? 'w-16' : 'w-20')} />
        <Button type="button" variant="outline" size="icon" className="size-8 shrink-0 max-sm:size-11" aria-label={`Increase ${labelFor(path, desc)}`} disabled={ctx.disabled} onClick={() => set(round(num + step, step))}><Plus aria-hidden="true" /></Button>
        {ctx.compact && unitOf(path) && <span className="text-[12px] text-muted-foreground" aria-hidden="true">{unitOf(path)}</span>}
        {dial && (
          <svg viewBox="-12 -12 24 24" className="size-8 shrink-0 text-muted-foreground" role="img" aria-label={`${text || 0} degrees`}>
            <circle r="10" fill="none" stroke="currentColor" strokeOpacity="0.4" />
            <line x1="0" y1="0" x2="0" y2="-9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" transform={`rotate(${Number.isFinite(num) ? num * 6 : 0})`} />
          </svg>
        )}
      </div>
      {!ctx.compact && <p id={`${id}-range`} className="text-[12px] text-muted-foreground">{rangeText(desc)}{dial ? ' degrees' : ''}</p>}
      <Err id={`${id}-err`} msg={problem} />
    </div>
  );
}

function Slider({ path, desc, ctx }: { path: string; desc: Desc; ctx: SettingsCtx }) {
  const value = Number(readSetting(ctx.look, desc, path) ?? desc.default ?? 0);
  const id = `s-${path}`;
  const problem = ctx.errors[path] ?? '';
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label2 id={id} label={labelFor(path, desc)} help={desc.help} />
      <div className="flex items-center gap-3">
        <input id={id} type="range" min={desc.min} max={desc.max} step={desc.step ?? 0.01} value={Number.isFinite(value) ? value : 0} disabled={ctx.disabled} onChange={(e) => ctx.onChange(path, Number(e.target.value))}
          aria-describedby={problem ? `${id}-err` : undefined} className="h-8 min-w-0 flex-1 accent-[var(--primary)] max-sm:h-11" />
        <span className="w-12 text-right text-[13px] tabular-nums" aria-hidden="true">{round(value, desc.step ?? 0.01)}</span>
      </div>
      <p className="text-[12px] text-muted-foreground">{rangeText(desc)}</p>
      <Err id={`${id}-err`} msg={problem} />
    </div>
  );
}

function EnumRow({ path, desc, ctx }: { path: string; desc: Desc; ctx: SettingsCtx }) {
  const value = readSetting(ctx.look, desc, path);
  const values = desc.values ?? [];
  return (
    <ChoiceField label={labelFor(path, desc)} hint={desc.help} value={value === undefined ? '' : String(value)} disabled={ctx.disabled} error={ctx.errors[path]}
      options={values.map((v) => ({ value: String(v), label: typeof v === 'number' && path.includes('size') ? `${v} px` : valueLabel(path, v) }))}
      onValueChange={(v) => ctx.onChange(path, values.find((x) => String(x) === v) ?? v)} />
  );
}

function RoleRow({ path, desc, ctx }: { path: string; desc: Desc; ctx: SettingsCtx }) {
  const roles = (ctx.catalogue.lists.roles ?? []) as string[];
  const value = String(readSetting(ctx.look, desc, path) ?? '');
  return <SelectField label={labelFor(path, desc)} hint={desc.help} value={value} disabled={ctx.disabled} error={ctx.errors[path]} options={roles.map((r) => ({ value: r, label: valueLabel(path, r) }))} onValueChange={(v) => ctx.onChange(path, v)} />;
}

function EnumList({ path, desc, ctx }: { path: string; desc: Desc; ctx: SettingsCtx }) {
  const value = (readSetting(ctx.look, desc, path) ?? []) as string[];
  const all = desc.of?.values ?? [];
  return (
    <FieldSet legend={labelFor(path, desc)} hint={desc.help} error={ctx.errors[path]}>
      {all.map((v) => (
        <CheckField key={String(v)} label={valueLabel(path, v)} checked={value.includes(v as string)} disabled={ctx.disabled}
          onCheckedChange={(on) => ctx.onChange(path, on ? all.filter((x) => value.includes(x as string) || x === v) : value.filter((x) => x !== v))} />
      ))}
    </FieldSet>
  );
}

// A list of numbers typed with commas (the headline size steps, extra text lines).
function NumberList({ path, desc, ctx }: { path: string; desc: Desc; ctx: SettingsCtx }) {
  const value = (readSetting(ctx.look, desc, path) ?? []) as number[];
  const parse = (t: string) => t.split(',').map((x) => x.trim()).filter((x) => x !== '').map(Number);
  const [text, setText] = useState(value.join(', '));
  useEffect(() => { if (JSON.stringify(parse(text)) !== JSON.stringify(value)) setText(value.join(', ')); }, [value]);
  return (
    <TextField label={labelFor(path, desc)} hint={desc.help} value={text} disabled={ctx.disabled} error={ctx.errors[path]} inputMode="decimal" placeholder="1, 0.9, 0.82"
      onChange={(e) => { setText(e.target.value); ctx.onChange(path, parse(e.target.value)); }} />
  );
}

function Tuple({ path, desc, ctx }: { path: string; desc: Desc; ctx: SettingsCtx }) {
  const value = (readSetting(ctx.look, desc, path) ?? (desc.items ?? []).map(() => 0)) as number[];
  const items = desc.items ?? [];
  const id = `s-${path}`;
  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5" aria-describedby={ctx.errors[path] ? `${id}-err` : undefined}>
      <legend className="mb-1 flex items-center gap-1 text-[13px] font-medium">{labelFor(path, desc)}{(desc.help || ctx.compact) && <Hint about={labelFor(path, desc)}>{ctx.compact ? [desc.help, items[0] ? `Each ${rangeText(items[0])}.` : ''].filter(Boolean).join(' ') : desc.help}</Hint>}</legend>
      <div className="grid grid-cols-4 gap-2">
        {items.map((d, i) => (
          <div key={i} className="flex flex-col gap-1">
            <Label htmlFor={`${id}-${i}`} className="text-[12px] font-normal text-muted-foreground">{d.label}</Label>
            <Input id={`${id}-${i}`} inputMode="decimal" disabled={ctx.disabled} value={Number.isNaN(value[i]) ? '' : String(value[i] ?? '')} aria-invalid={checkValue(d, value[i]) ? true : undefined} className="px-2 tabular-nums max-sm:h-11 max-sm:text-base"
              onChange={(e) => ctx.onChange(path, items.map((_, j) => (j === i ? (e.target.value.trim() === '' ? NaN : Number(e.target.value)) : value[j] ?? 0)))} />
          </div>
        ))}
      </div>
      {!ctx.compact && <p className="text-[12px] text-muted-foreground">{items[0] ? rangeText(items[0]) : ''}</p>}
      <Err id={`${id}-err`} msg={ctx.errors[path]} />
    </fieldset>
  );
}

const ROLE_DEFAULT: Record<string, string> = { display: 'display', text: 'sans', label: 'label', mono: 'mono' };
const OWN_ROLE: Record<string, string> = { display: 'Headline font', label: 'Label font', sans: 'Body font', mono: 'Monospaced font' };

// A typeface: a family of the font library with its weights, or "Our own font" (the one the brand uploaded for a role).
function FontControl({ path, desc, ctx }: { path: string; desc: Desc; ctx: SettingsCtx }) {
  const value = (getAt(ctx.look, path) ?? {}) as Json;
  const source = value.source === 'brand' ? 'brand' : 'library';
  const family = ctx.fonts.find((f) => f.family === value.family);
  const roleKey = path.split('.').pop() ?? '';
  const label = labelFor(path, desc);
  const set = (next: Json) => ctx.onChange(path, next);
  const limits = desc.forms?.library?.props?.weights;
  const strip = FONT_ROLES.includes(roleKey as FontRole) ? weightStrip(ctx.look, ctx.comps ?? [], roleKey as FontRole, ctx.fonts, { max: limits?.max, min: limits?.min }) : null;
  return (
    <FieldGroup legend={label} hint={desc.help} error={ctx.errors[path]}>
      <div className="grid gap-3 sm:grid-cols-2">
        <ChoiceField label="Where it comes from" value={source} disabled={ctx.disabled}
          options={[{ value: 'library', label: 'A font from our library' }, { value: 'brand', label: 'Our own font' }]}
          onValueChange={(v) => set(v === 'brand' ? { source: 'brand', role: ROLE_DEFAULT[roleKey] ?? 'sans' } : { source: 'library', family: ctx.fonts[0]?.family ?? '', weights: [400] })} />
        {source === 'library'
          ? <SelectField label="Typeface" value={String(value.family ?? '')} disabled={ctx.disabled} options={ctx.fonts.map((f) => ({ value: f.family, label: f.family }))} onValueChange={(v) => set({ ...value, family: v })} />
          : <SelectField label="Which of our fonts" hint="The font your brand uploaded in Brand and look, Type." value={String(value.role ?? '')} disabled={ctx.disabled}
              options={(desc.forms?.brand?.props?.role?.values ?? []).map((r) => ({ value: String(r), label: OWN_ROLE[String(r)] ?? String(r) }))} onValueChange={(v) => set({ ...value, role: v })} />}
      </div>
      {source === 'library' && (
        <>
          {!ctx.hideWeights && strip && (
            <WeightStripRow strip={strip} fonts={ctx.fonts} disabled={ctx.disabled} label="Weights" onWeights={(w) => set({ ...value, weights: w })} />
          )}
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {family?.italic && <SwitchField label="Also use the italic" checked={value.italic === true} disabled={ctx.disabled} onCheckedChange={(on) => set({ ...value, italic: on })} />}
            {family?.stretch && (
              <div className="w-48"><NumberRow path={`${path}.stretch`} desc={desc.forms!.library!.props!.stretch!} ctx={ctx} /></div>
            )}
          </div>
        </>
      )}
    </FieldGroup>
  );
}

function ListOfObjects({ path, desc, ctx }: { path: string; desc: Desc; ctx: SettingsCtx }) {
  const value = (readSetting(ctx.look, desc, path) ?? []) as unknown[];
  const item = desc.of!;
  const max = desc.max ?? 99;
  return (
    <FieldGroup legend={labelFor(path, desc)} hint={desc.help} error={ctx.errors[path]}>
      {value.map((_, i) => (
        <div key={i} className="flex items-end gap-2 border-t pt-3 first:border-t-0 first:pt-0">
          <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(item.props ?? {}).map(([k, d]) => <Node key={k} path={joinPath(joinPath(path, i), k)} desc={d} ctx={ctx} />)}
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${labelFor(path, desc)} ${i + 1}`} disabled={ctx.disabled || value.length <= (desc.min ?? 0)} onClick={() => ctx.onChange(path, value.filter((_, j) => j !== i))}><Trash2 aria-hidden="true" /></Button>
        </div>
      ))}
      <div><Button type="button" variant="outline" size="sm" disabled={ctx.disabled || value.length >= max} onClick={() => ctx.onChange(path, [...value, blankFor(item)])}><Plus aria-hidden="true" /> Add one</Button></div>
    </FieldGroup>
  );
}

function Children({ path, desc, ctx }: { path: string; desc: Desc; ctx: SettingsCtx }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Object.entries(desc.props ?? {}).map(([k, d]) => (
        <div key={k} className={cn('min-w-0', wide(d) && 'col-span-full')}><Node path={joinPath(path, k)} desc={d} ctx={ctx} /></div>
      ))}
    </div>
  );
}

export function Node({ path, desc, ctx }: { path: string; desc: Desc; ctx: SettingsCtx }): ReactNode {
  if (path.startsWith('fonts.') && desc.kind === 'tagged') return <FontControl path={path} desc={desc} ctx={ctx} />;
  switch (desc.kind) {
    case 'number':
      if (path.startsWith('dials.') && !ctx.exact) return <Slider path={path} desc={desc} ctx={ctx} />;
      return <NumberRow path={path} desc={desc} ctx={ctx} dial={path.startsWith('devices.angles.')} />;
    case 'enum': return <EnumRow path={path} desc={desc} ctx={ctx} />;
    case 'bool': return <SwitchField label={labelFor(path, desc)} hint={desc.help} checked={readSetting(ctx.look, desc, path) === true} disabled={ctx.disabled} onCheckedChange={(v) => ctx.onChange(path, v)} />;
    case 'role': return <RoleRow path={path} desc={desc} ctx={ctx} />;
    case 'text': return <TextField label={labelFor(path, desc)} hint={desc.help} value={String(readSetting(ctx.look, desc, path) ?? '')} disabled={ctx.disabled} error={ctx.errors[path]} onChange={(e) => ctx.onChange(path, e.target.value)} />;
    case 'tuple': return <Tuple path={path} desc={desc} ctx={ctx} />;
    case 'list':
      if (desc.of?.kind === 'enum') return <EnumList path={path} desc={desc} ctx={ctx} />;
      if (desc.of?.kind === 'number') return <NumberList path={path} desc={desc} ctx={ctx} />;
      if (desc.of?.kind === 'object') return <ListOfObjects path={path} desc={desc} ctx={ctx} />;
      return null;
    case 'object':
      return (
        <FieldGroup legend={labelFor(path, desc)} hint={desc.help} error={ctx.errors[path]}>
          <Children path={path} desc={desc} ctx={ctx} />
        </FieldGroup>
      );
    default: return null;
  }
}

// The whole tab: the dials first, then Typefaces, Type, Page, Colour, Devices, Pictures and Logo (a section the engine adds follows).
export function SettingsForm({ ctx }: { ctx: SettingsCtx }) {
  const groups = groupSections(ctx.catalogue.sections);
  return (
    <div className="flex flex-col gap-7">
      {groups.map((g) => (
        <section key={g.id} id={`settings-${g.id}`} aria-labelledby={`settings-${g.id}-title`} className="flex scroll-mt-6 flex-col gap-3 border-t pt-6 first:border-t-0 first:pt-0">
          <div className="flex items-center gap-1.5"><h2 id={`settings-${g.id}-title`} className="text-sm font-semibold">{g.title}</h2>{g.hint && <Hint about={g.title}>{g.hint}</Hint>}</div>
          {g.sections.map((name) => {
            const desc = ctx.catalogue.sections[name]!;
            // A section is a group of its own settings; the group title above already names it.
            return desc.kind === 'object' ? <Children key={name} path={name} desc={desc} ctx={ctx} /> : <Node key={name} path={name} desc={desc} ctx={ctx} />;
          })}
        </section>
      ))}
    </div>
  );
}
