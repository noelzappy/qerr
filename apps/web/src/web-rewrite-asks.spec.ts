// The quick asks of Rewrite with AI and the one instruction they make.
import { describe, expect, it } from 'vitest';
import { extraRoom, QUICK_ASKS, REWRITE_MAX, rewriteInstruction } from '../web/src/pages/batches/rewrite-asks';

describe('the rewrite quick asks', () => {
  it('become one instruction, in the order shown, with the person\'s own words last', () => {
    expect(rewriteInstruction(['warmer', 'shorter'], '')).toBe('Make it shorter. Make the tone warmer.');
    expect(rewriteInstruction(['cta'], 'Mention the free plan')).toBe('End with a clear call to action. Also: Mention the free plan');
    expect(rewriteInstruction([], '  Mention the free plan ')).toBe('Mention the free plan');
    expect(rewriteInstruction([], ' ')).toBe('');
  });
  it('leave room for the person\'s words within the route\'s limit', () => {
    expect(extraRoom([])).toBe(REWRITE_MAX);
    const all = QUICK_ASKS.map((a) => a.id);
    expect(rewriteInstruction(all, 'x'.repeat(extraRoom(all))).length).toBe(REWRITE_MAX);
  });
});
