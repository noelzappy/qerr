// The marks a series is offered as choices ("Tip #12", "No. 12", "Part 12"), so nobody has to type the {n} placeholder; anything else is
// Custom, typed as before. The stored mark is the same text with {n} where the number goes (the engine's seriesMark reads it).

export type MarkPreset = 'none' | 'tip' | 'no' | 'part' | 'custom';
export const MARK_PRESETS: ReadonlyArray<{ id: Exclude<MarkPreset, 'custom'>; label: string; mark: string }> = [
  { id: 'none', label: 'No mark', mark: '' },
  { id: 'tip', label: 'Tip #12', mark: 'Tip #{n}' },
  { id: 'no', label: 'No. 12', mark: 'No. {n}' },
  { id: 'part', label: 'Part 12', mark: 'Part {n}' },
];

// Which choice a stored mark is: a preset when it is exactly one, else Custom.
export function markPreset(mark: string): MarkPreset {
  const m = mark.trim();
  return MARK_PRESETS.find((p) => p.mark === m)?.id ?? 'custom';
}

// The mark a choice writes; Custom keeps what is there, so a preset can be started from and changed.
export function markFor(preset: MarkPreset, current: string): string {
  return preset === 'custom' ? current : MARK_PRESETS.find((p) => p.id === preset)!.mark;
}
