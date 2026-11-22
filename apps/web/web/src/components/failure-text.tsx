// A stored failure message in plain words: the first sentence, the sentence that says what to do, and the rest behind
// "Show details". See readableFailure in lib/errors.ts.
import { readableFailure } from '@/lib/errors';
import { cn } from '@/lib/utils';

export function FailureText({ text, className }: { text: string | null | undefined; className?: string }) {
  const f = readableFailure(text);
  return (
    <div className={cn('[overflow-wrap:anywhere]', className)}>
      {f.summary}{f.advice ? ` ${f.advice}` : ''}{f.cutOff ? ' …' : ''}
      {f.details && (
        <details className="mt-1 text-[13px]">
          <summary className="w-fit cursor-pointer font-medium underline-offset-4 hover:underline max-sm:min-h-11">Show details</summary>
          <p className="mt-1">{f.details}</p>
        </details>
      )}
    </div>
  );
}
