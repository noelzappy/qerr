// A read-only box with a Copy button, for links an admin has to pass on by hand.
import { useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function CopyBox({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; the text is selected so the person can copy it by hand.
      input.current?.focus();
    }
  }
  return (
    <div className="flex items-stretch gap-2">
      <Input ref={input} className="min-w-0 flex-1 font-mono text-[13px] max-sm:h-11" readOnly value={value} aria-label={label} onFocus={(e) => e.currentTarget.select()} />
      <Button variant="outline" className="max-sm:h-11" onClick={() => void copy()}>
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
  );
}
