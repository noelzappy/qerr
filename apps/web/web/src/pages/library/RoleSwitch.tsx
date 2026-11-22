// The quiet switch at the top of Pictures: Photos | Cut-outs | Graphics, with a count in each label.
import { cn } from '@/lib/utils';
import { ROLE_LABEL, ROLES, type PictureRole } from './util';

export function RoleSwitch({ value, onChange, counts }: { value: PictureRole; onChange: (r: PictureRole) => void; counts: Partial<Record<PictureRole, number>> }) {
  return (
    <div role="group" aria-label="Kind of picture" className="inline-flex rounded-md border bg-muted/40 p-0.5">
      {ROLES.map((r) => (
        <button key={r} type="button" aria-pressed={r === value} onClick={() => onChange(r)}
          className={cn('h-7 rounded-sm px-3 text-[13px] font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:h-9', r === value && 'bg-background text-foreground shadow-sm')}>
          {ROLE_LABEL[r]}{counts[r] !== undefined && <span className="ml-1.5 font-normal text-muted-foreground">{counts[r]}</span>}
        </button>
      ))}
    </div>
  );
}

// A subtle checkerboard, so transparency in a cut-out or a graphic can be seen.
export const CHECKER = 'bg-[length:16px_16px] [background-image:conic-gradient(var(--color-muted)_25%,transparent_25%_50%,var(--color-muted)_50%_75%,transparent_75%)] bg-background';
