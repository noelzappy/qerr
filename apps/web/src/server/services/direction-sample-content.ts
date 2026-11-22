// The words of the sample posts that show a design direction (services/direction-samples.ts).
//
// A statement carries the brand's own name and tagline. The figure and the list carry neutral text that says plainly it is an
// example: nothing here is ever a claim about the brand, its numbers or its customers.
import { engineImport } from '../engine/root.js';

interface PostSpec { POST_FIELDS: Record<string, { max: number }>; POST_ITEMS: { min: number; max: number; chars: number } }
const postSpec = await engineImport<PostSpec>('design/post-spec');

export const SAMPLE_FIGURE = { big: '3', unit: 'steps', sub: 'A neutral example, not a claim about your brand' } as const;
export const SAMPLE_LIST = { headline: 'Three things to check', items: ['First thing', 'Second thing', 'Third thing'] } as const;

// What is seen of a text: the asterisks of an emphasis do not count.
const seen = (t: string) => Array.from(t.replace(/\*/g, ''));

// `text` on one line, without emphasis marks, cut at a word boundary to at most `max` characters.
export function clipWords(text: string, max: number): { text: string; cut: boolean } {
  const plain = text.replace(/\*/g, '').replace(/\s+/g, ' ').trim();
  const chars = Array.from(plain);
  if (chars.length <= max) return { text: plain, cut: false };
  const head = chars.slice(0, max).join('');
  // Back to the last space when the cut falls inside a word (when the next character is a space the head is whole words).
  const whole = chars[max] === ' ' ? head : head.slice(0, Math.max(head.lastIndexOf(' '), 0)) || head;
  return { text: whole.replace(/[\s,;:.\-]+$/u, ''), cut: true };
}

// The brand's name as a label.
export const sampleLabel = (name: string): string => clipWords(name, postSpec.POST_FIELDS.label!.max).text;

// The brand's tagline as a statement headline: whole, with its last two words emphasised when it has three or more, or cut at a
// word boundary (and then left without emphasis) when it is longer than a headline may be.
export function sampleHeadline(tagline: string): string {
  const max = postSpec.POST_FIELDS.headline!.max;
  const { text, cut } = clipWords(tagline, max);
  const words = text.split(' ');
  if (cut || words.length < 3) return text;
  const out = `${words.slice(0, -2).join(' ')} *${words.slice(-2).join(' ')}*`;
  return seen(out).length <= max ? out : text;
}
