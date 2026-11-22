// A typeface of the font library chosen from its names, each name set in its own face (the files the server already serves for the
// typeface cards, load-fonts.ts). A radio group of chips, in place of a dropdown of names; a family whose files do not load shows
// its name in a generic face of the same kind.
import { useEffect } from 'react';
import { SegmentedField } from '@/components/kit/segmented-field';
import type { FontFamilyInfo } from '../look-types';
import { cardFontFamily, ensureFamily } from './load-fonts';

export function FontFaceChoice({ label, value, fonts, onChange, disabled, hint }: { label: string; value: string; fonts: FontFamilyInfo[]; onChange: (family: string) => void; disabled?: boolean; hint?: string }) {
  useEffect(() => { for (const f of fonts) ensureFamily(f); }, [fonts]);
  const known = fonts.some((f) => f.family === value);
  const options = [
    ...(value && !known ? [{ value, label: value }] : []),
    ...fonts.map((f) => ({ value: f.family, label: <span className="text-[14px] font-normal" style={{ fontFamily: cardFontFamily(f.family) }}>{f.family}</span> })),
  ];
  return <SegmentedField variant="chips" label={label} hint={hint} value={value} options={options} disabled={disabled} onValueChange={onChange} />;
}
