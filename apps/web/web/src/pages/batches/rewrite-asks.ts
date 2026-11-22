// The quick asks of "Rewrite with AI" and how they become the one instruction the rewrite route takes. Pure, specced in
// src/web-rewrite-asks.spec.ts.

export const REWRITE_MAX = 500;

// The chip people see, and the sentence the AI is given.
export const QUICK_ASKS = [
  { id: 'shorter', label: 'Shorter', says: 'Make it shorter.' },
  { id: 'warmer', label: 'Warmer', says: 'Make the tone warmer.' },
  { id: 'figure', label: 'Lead with the figure', says: 'Lead with the key figure.' },
  { id: 'informal', label: 'Less formal', says: 'Make it less formal.' },
  { id: 'cta', label: 'Add a call to action', says: 'End with a clear call to action.' },
  { id: 'facts', label: 'Fix the facts', says: 'Check every claim against the linked facts and correct any that do not match them.' },
] as const;
export type QuickAsk = (typeof QUICK_ASKS)[number]['id'];

// The chosen asks, in the order shown, then the person's own words.
export function rewriteInstruction(asks: readonly string[], extra: string): string {
  const said: string[] = QUICK_ASKS.filter((a) => asks.includes(a.id)).map((a) => a.says);
  const own = extra.trim();
  if (own) said.push(said.length ? `Also: ${own}` : own);
  return said.join(' ');
}

// How many characters are left for the person's own words once the asks are in.
export function extraRoom(asks: readonly string[]): number {
  const base = rewriteInstruction(asks, '');
  return Math.max(0, REWRITE_MAX - (base ? base.length + ' Also: '.length : 0));
}
