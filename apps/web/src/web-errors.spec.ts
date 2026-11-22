// How a stored failure message is shown (web/src/lib/errors.ts): readable, never cut mid-sentence, advice kept.
import { describe, expect, it } from 'vitest';
import { blockerKind, failureLine, readableFailure, tidyBlocker } from '../web/src/lib/errors';

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

describe('a failure the server stored cut short', () => {
  const CUT = 'The text does not fit the feed format: the label ("emberwellcoffee.example") runs 10 px past the right margin; the label ("emberwellcoffee.example") runs 19 px out of the right of its slot. Shorten the text (a shorter headline or sub line fits; the tool already shrank the hea';

  it('shows the whole first sentence, leaves out the unfinished one and says the text goes on', () => {
    const f = readableFailure(CUT);
    expect(f.summary).toBe('The text does not fit the feed format: the label ("emberwellcoffee.example") runs 10 px past the right margin; the label ("emberwellcoffee.example") runs 19 px out of the right of its slot.');
    expect(f.advice).toBeNull();
    expect(f.cutOff).toBe(true);
    expect(failureLine(CUT)).toBe(`${f.summary} …`);
    expect(failureLine(CUT)).not.toContain('hea');
  });

  it('applies the same to the line on the post card', () => {
    const line = tidyBlocker(`The images could not be made: ${CUT}`);
    expect(line.startsWith('The image could not be made: The text does not fit the feed format')).toBe(true);
    expect(line.endsWith('of its slot. …')).toBe(true);
  });

  it('keeps a whole message whole, even without a full stop', () => {
    expect(readableFailure('Add your logo').cutOff).toBe(false);
    expect(failureLine('Add your logo')).toBe('Add your logo');
  });
});

describe('tidyBlocker for problems that appear after the brand or the facts change', () => {
  it('says an unknown post type in plain words', () => {
    const raw = 'design: series "trip-notes" is not in brand.json (known: on-the-bar, the-roastery, beans, numbers, regulars)';
    expect(tidyBlocker(raw)).toBe('This post uses the post type "trip-notes", which the brand no longer has. Choose another post type.');
    expect(blockerKind(raw)).toBe('post-type');
  });

  it('says an unconfirmed fact in plain words', () => {
    const raw = '"Average group size" has not been confirmed by a person';
    expect(tidyBlocker(raw)).toBe('The fact "Average group size" is not confirmed. Confirm it in Facts, or link another fact.');
    expect(blockerKind(raw)).toBe('fact');
    expect(blockerKind('Pick a date')).toBeNull();
    expect(tidyBlocker('The scheduled time has already passed. Change the date')).toBe('The scheduled time has already passed. Change the date');
  });
});
