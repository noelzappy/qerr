// A design (one composition of a look) in plain words, read only: its name and description, the fields it uses with their budgets,
// its elements as an indented outline, and the JSON behind a disclosure. Editing a design's layout comes with the design editor.
import { Notice } from '@/components/kit';
import { designFields, fieldLine, outline } from './look-model';
import type { Json, LookCatalogue } from './look-types';

export function DesignDetail({ definition, catalogue, className }: { definition: Json; catalogue: LookCatalogue | null; className?: string }) {
  const lines = outline(definition, catalogue);
  const fields = designFields(definition, catalogue);
  return (
    <div className={className}>
      <div className="flex flex-col gap-4 text-[13.5px]">
        <div>
          <h3 className="text-[15px] font-semibold">{String(definition.name ?? '')}</h3>
          {typeof definition.describe === 'string' && definition.describe && <p className="mt-0.5 text-muted-foreground">{definition.describe}</p>}
        </div>
        <section aria-label="Fields">
          <h4 className="mb-1 text-[13px] font-semibold">Fields</h4>
          {fields.length === 0 ? <p className="text-muted-foreground">No fields.</p> : (
            <ul className="flex flex-col gap-0.5">
              {fields.map((f) => <li key={f.name}>{fieldLine(f, catalogue)}{f.required ? ' · needed' : ''}</li>)}
            </ul>
          )}
        </section>
        <section aria-label="Elements">
          <h4 className="mb-1 text-[13px] font-semibold">Elements, back to front</h4>
          {lines.length === 0 ? <p className="text-muted-foreground">No elements.</p> : (
            <ul className="flex flex-col gap-1">
              {lines.map((l) => (
                <li key={l.path} style={{ paddingLeft: `${l.depth * 16}px` }} className="[overflow-wrap:anywhere]">
                  <span className="font-medium">{l.label}</span>{l.text && <span className="text-muted-foreground">: {l.text}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
        <details className="text-[13px]">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Advanced: JSON</summary>
          <pre className="mt-2 max-h-80 overflow-auto rounded-md bg-muted/50 p-3 text-[12px]" tabIndex={0}>{JSON.stringify(definition, null, 2)}</pre>
        </details>
        <Notice tone="info">Editing a design's layout comes with the design editor.</Notice>
      </div>
    </div>
  );
}
