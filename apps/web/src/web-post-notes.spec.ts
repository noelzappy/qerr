// How the AI's stored notes are told apart from warnings, and how the draft report reads (web/src/lib).
import { describe, expect, it } from 'vitest';
import { detailMessages, draftSummary, plainReason } from '../web/src/lib/ai-draft-note';
import { rewriteChangedText } from '../web/src/lib/labels';
import { isNote, splitNotes } from '../web/src/lib/post-notes';

describe('splitNotes', () => {
  it('keeps informational sentences as notes and everything that needs action as warnings', () => {
    expect(isNote('Demo figure, as the vault item states')).toBe(true);
    expect(isNote('No picture: the vault has no jam photo, so a layout without an image is used')).toBe(true);
    expect(isNote('Check the figures before publishing.')).toBe(true);
    for (const w of [
      'The contrast is too low for the label', 'The headline was shrunk to fit', 'uses unconfirmed item abc', 'uses a stale item x (valid until 2025-01-01)',
      'The post mentions another currency: $20', 'photo p1 is not confirmed', 'Something nobody has seen before',
    ]) expect(isNote(w)).toBe(false);
  });

  it('never turns a server-computed warning into a note, even when it reads like one', () => {
    const r = splitNotes(['No picture: the vault has no jam photo', 'Demo figure, as the vault item states', 'x: caption is 400 characters, x allows 280'], ['Demo figure, as the vault item states', 'x: caption is 400 characters, x allows 280']);
    expect(r.notes).toEqual(['Demo figure, as the vault item states']);
    expect(r.warnings).toEqual(['No picture: the vault has no jam photo', 'x: caption is 400 characters, x allows 280']);
  });

  it('lets a warning pattern win over a note pattern', () => {
    expect(splitNotes(['No picture: the rights are not confirmed'], ['No picture: the rights are not confirmed']).warnings).toHaveLength(1);
  });
});

describe('draftSummary', () => {
  it('says what really happened when every post was delivered after a rewrite', () => {
    const s = draftSummary({ requested: 6, delivered: 6, rejected: [{ id: '03-returning-walkers', reasons: ['03-returning-walkers: image text (big) has numbers not found in its sources: 7, 10'] }] });
    expect(s.headline).toBe('6 of 6 posts drafted.');
    expect(s.followUp).toBe('1 draft was thrown out by the checks and written again.');
    expect(s.why).toEqual(['03-returning-walkers: The big number has numbers not found in its sources: 7, 10']);
  });

  it('says so when posts were asked for but not delivered', () => {
    const s = draftSummary({ requested: 6, delivered: 5, rejected: [{ id: 'a', reasons: ['caption is missing'] }] });
    expect(s.headline).toBe('5 of 6 posts drafted.');
    expect(s.followUp).toBe('1 could not be made to pass the checks.');
    expect(draftSummary({ requested: 3, delivered: 3 }).followUp).toBeNull();
  });

  it('drops the post key however often it is repeated, and keeps the reason', () => {
    expect(plainReason('post a1: a1: date 2026-13-40 is not a real date', 'a1')).toBe('Date 2026-13-40 is not a real date');
    expect(detailMessages({ messages: ['only 5 of 6 requested posts passed the checks', 'drafted in 2 calls'] })).toEqual(['drafted in 2 calls']);
  });
});

describe('rewriteChangedText', () => {
  it('names the changed parts in plain words', () => {
    expect(rewriteChangedText(['caption'])).toBe('Caption');
    expect(rewriteChangedText(['caption', 'networks'])).toBe('Caption and captions for single networks');
    expect(rewriteChangedText(['caption', 'design', 'networks'])).toBe('Caption, words on the image and captions for single networks');
    expect(rewriteChangedText([])).toBe('Nothing needed changing');
    expect(rewriteChangedText(undefined)).toBeNull();
  });
});
