// How a stored failure message is shown (web/src/lib/errors.ts): readable, never cut mid-sentence, advice kept.
import { describe, expect, it } from 'vitest';
import { failureLine, readableFailure } from '../web/src/lib/errors';

const RAW = '05-export-to-pdf-feed.jpg: screen: "out/app-render/6ed2d5f0-1a2b-4c3d-8e9f-0123456789ab/in/1-screen-desk.png" is not a pre-framed phone capture (it has no transparency, so it is a plain screenshot). Use a pre-framed phone capture: a transparent PNG or WebP with the phone already drawn around the screen.';

describe('readableFailure', () => {
  it('drops the image file name and the internal path, names the original file, and keeps the advice', () => {
    const f = readableFailure(RAW);
    expect(f.summary).toBe('screen: "screen-desk.png" is not a pre-framed phone capture (it has no transparency, so it is a plain screenshot).');
    expect(f.advice).toBe('Use a pre-framed phone capture: a transparent PNG or WebP with the phone already drawn around the screen.');
    expect(f.details).toBeNull();
    expect(JSON.stringify(f)).not.toContain('app-render');
    expect(failureLine(RAW)).toBe(`${f.summary} ${f.advice}`);
  });

  it('says "the picture" when the file name cannot be recovered, and handles a cut-off run folder', () => {
    expect(readableFailure('x.jpg: screen: "out/app-render/6ed2d5f0-…" is not a phone capture.').summary).toBe('screen: the picture is not a phone capture.');
    expect(readableFailure('Render: Could not read out/app-render/abc/out/1.png at all.').summary).toBe('Could not read the picture at all.');
  });

  it('puts the rest behind the details and never cuts a sentence', () => {
    const f = readableFailure('The design is not valid: headline is too long. Second thing happened. Third thing too.');
    expect(f.summary).toBe('The design is not valid: headline is too long.');
    expect(f.advice).toBeNull();
    expect(f.details).toBe('Second thing happened. Third thing too.');
    const long = `${'word '.repeat(300)}end.`;
    expect(readableFailure(long).summary).toBe(long.trim());
  });

  it('does not split inside a number and copes with empty text', () => {
    expect(readableFailure('The size is 1.5 times too big.').summary).toBe('The size is 1.5 times too big.');
    expect(readableFailure('').summary).toBe('No reason was given.');
    expect(readableFailure(null).details).toBeNull();
    expect(readableFailure('Render: The images could not be made: Add your logo.').summary).toBe('Add your logo.');
  });
});
