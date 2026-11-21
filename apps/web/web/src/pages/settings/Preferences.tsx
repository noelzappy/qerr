// Settings, Preferences: choices that belong to this browser (the theme).
import { useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useDocumentTitle } from '../../hooks';
import { useSession } from '../../session';
import { setTheme, themeChoice, type ThemeChoice } from '../../lib/theme';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import { Section, SettingsPage } from './section';

const OPTIONS: Array<{ value: ThemeChoice; label: string; Icon: typeof Sun }> = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'Same as the system', Icon: Monitor },
];

export function PreferencesPage() {
  useDocumentTitle('Preferences');
  const { me } = useSession();
  const [choice, setChoice] = useState<ThemeChoice>(themeChoice());
  return (
    <SettingsPage title="Preferences">
      <Section title="Account" description="Your name and email, as the team sees them. An admin can change your role; ask an admin for a password reset link if you need one.">
        <dl className="grid gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-[6rem_1fr]">
          <dt className="text-muted-foreground">Name</dt><dd>{me?.name || '-'}</dd>
          <dt className="text-muted-foreground">Email</dt><dd className="break-all">{me?.email}</dd>
          <dt className="text-muted-foreground">Role</dt><dd>{me?.role === 'admin' ? 'Admin' : 'Editor'}</dd>
        </dl>
      </Section>
      <Section title="Theme" description="Kept in this browser.">
        <RadioGroup value={choice} onValueChange={(v) => { setTheme(v as ThemeChoice); setChoice(v as ThemeChoice); }} aria-label="Theme" className="grid gap-2 sm:grid-cols-3">
          {OPTIONS.map(({ value, label, Icon }) => (
            <Label
              key={value}
              htmlFor={`theme-${value}`}
              className={cn('flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-1.5 text-[13px] font-normal transition-colors hover:bg-muted has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50 max-sm:min-h-11', choice === value && 'border-primary ring-1 ring-primary')}
            >
              <RadioGroupItem id={`theme-${value}`} value={value} />
              <Icon className="size-4" aria-hidden="true" /> {label}
            </Label>
          ))}
        </RadioGroup>
      </Section>
    </SettingsPage>
  );
}
