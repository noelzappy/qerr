// The post editor's phase 3 controls, drawn as static markup (no browser): the headline shows styled words and never its markup (that is
// one switch away under Fine-tune), the picture is shown with its focus and the frame of each size, and the design of a post is chosen as
// "Kind of post" (a series is one) and "Design", with the classic Layout and Post type under the same two names. How they behave under the
// pointer and the keyboard was tried in a browser; see the screenshots of phase 3.
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DesignChooser } from '../web/src/pages/batches/editor/DesignChooser';
import { HeadlineField } from '../web/src/pages/batches/editor/HeadlineField';
import { KindChooser, type SeriesSlot } from '../web/src/pages/batches/editor/KindChooser';
import { PageFields } from '../web/src/pages/batches/editor/PageFields';
import { PictureFocus } from '../web/src/pages/batches/editor/PictureFocus';
import { PostFields } from '../web/src/pages/batches/editor/PostFields';
import type { SeriesInfo } from '../web/src/pages/batches/editor/series-model';

const noop = () => {};
const draw = (node: React.ReactNode) => renderToString(<TooltipProvider>{node}</TooltipProvider>).replace(/<!-- -->/g, '');
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
// The options of the radio group a legend names, and the one that is checked.
function radios(html: string, legend: string) {
  const at = html.indexOf(`>${legend}</`);
  expect(at, legend).toBeGreaterThan(-1);
  const group = html.slice(at, html.indexOf('</fieldset>', at));
  const items = [...group.matchAll(/<label[^>]*>([\s\S]*?)<\/label>/g)].map((m) => ({ label: text(m[1]!).trim(), checked: /checked=""/.test(m[1]!) }));
  return { labels: items.map((i) => i.label), checked: items.find((i) => i.checked)?.label };
}

describe('the headline', () => {
  const value = 'Save together, *see every* [[euro]] {{arrow-right}}';
  it('shows styled words, not the markup', () => {
    const html = draw(<HeadlineField value={value} onChange={noop} marks icons={['arrow-right', 'star']} />);
    expect(html).toContain('contentEditable="true"');
    expect(html).toContain('role="textbox"');
    expect(html).toMatch(/<span data-m="em"[^>]*>see every<\/span>/);
    expect(html).toMatch(/<span data-m="pill"[^>]*>euro<\/span>/);
    expect(html).toMatch(/data-m="icon" data-name="arrow-right"[^>]*role="img" aria-label="arrow right icon"/);
    for (const mark of ['*see', '[[', ']]', '{{', '}}']) expect(text(html), mark).not.toContain(mark);
    expect(html).toContain('Coloured: see every. In a pill: euro. Icon: arrow right.');
  });
  it('styles from a toolbar of Colour, Pill, Plain and Icon, with Edit as text under Fine-tune', () => {
    const html = draw(<HeadlineField value={value} onChange={noop} marks icons={['arrow-right']} />);
    expect(html).toContain('role="toolbar"');
    for (const b of ['Colour: set the selected words in the second colour', 'Pill: set the selected words in a pill', 'Plain: take the colour or pill off the selected words', 'Put an icon at the cursor']) expect(html).toContain(`aria-label="${b}"`);
    expect(html).toMatch(/aria-expanded="false"[^>]*>.*Fine-tune/);
    expect(html).not.toContain('<textarea');
  });
  it('offers only Colour and Plain on a classic layout', () => {
    const html = draw(<HeadlineField value="Every saving, *on record.*" onChange={noop} />);
    expect(html).toContain('aria-label="Colour: set the selected words in the second colour"');
    expect(html).not.toContain('Pill: set');
    expect(html).not.toContain('Put an icon at the cursor');
  });
  it('does not offer a mark no design of the kind draws, and names one the chosen design leaves plain', () => {
    const none = draw(<HeadlineField value="Plain words" onChange={noop} marks icons={['star']} offer={{ pills: false, icons: false }} />);
    expect(none).not.toContain('Pill: set');
    expect(none).not.toContain('Put an icon at the cursor');
    const kept = draw(<HeadlineField value="Some [[words]] here" onChange={noop} marks icons={['star']} offer={{ pills: true, icons: true }} draws={{ pills: false, icons: true }} />);
    expect(kept).toContain('Pill: set');
    expect(kept).toContain('The chosen design shows pill words as plain words.');
  });
  it('names what the engine would refuse, on screen', () => {
    const html = draw(<HeadlineField value="[[a]] [[b]] [[c]] d" onChange={noop} marks icons={['star']} />);
    expect(html).toContain('It has 3 pills; a headline takes two at most.');
    expect(html).toContain('aria-invalid="true"');
  });
  it('is edited as text, with the reason, when the buttons cannot show it exactly', () => {
    const html = draw(<HeadlineField value="5 * 3 rule" onChange={noop} marks icons={['star']} />);
    expect(html).toMatch(/<textarea[^>]*>5 \* 3 rule<\/textarea>/);
    expect(html).not.toContain('role="toolbar"');
    expect(html).toContain('This headline is edited as text because the styling buttons cannot show it exactly.');
    expect(html).toContain('It has an asterisk with no partner');
  });
});

describe('the picture focus', () => {
  it('shows the focus, the zoom and a frame for each size the post is made in', () => {
    const html = draw(<PictureFocus focal="62% 42%" zoom={1.2} sizes={['feed', 'story']} onChange={noop} />);
    expect(html).toContain('Picture focus');
    expect(text(html)).toContain('Focus 62% across, 42% down · zoom 1.2×');
    expect(html).toContain('Feed 4:5');
    expect(html).toContain('Story 9:16');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('type="range"');
    expect(html).toContain('left:62%;top:42%');
    expect(html).toContain('Use the layout&#x27;s focus');
  });
  it('says when the focus is the layout\'s own', () => {
    expect(text(draw(<PictureFocus focal={undefined} zoom={undefined} onChange={noop} />))).toContain("Focus 50% across, 50% down (the layout's) · zoom 1.0×");
  });
  it('leaves a focus set per size to Advanced', () => {
    const html = draw(<PictureFocus focal={{ feed: '10% 10%', story: '20% 20%' }} zoom={undefined} onChange={noop} />);
    expect(html).toContain('This focus is set for each size separately.');
    expect(html).not.toContain('role="application"');
  });
});

describe('Kind of post and Design', () => {
  const series: SeriesInfo = {
    id: 's1', slug: 'tip', name: 'Tip of the week', kind: 'statement', variants: [], mark: 'Tip #{n}', markField: 'label', cadence: 'weekly',
    weekday: 1, nextNumber: 12, nextMark: 'Tip #12', designsInLook: false, problems: [], enabled: true,
  };
  const slot = (value: SeriesSlot['value']): SeriesSlot => ({
    list: [series, { ...series, id: 's2', name: 'Old series', enabled: false }, { ...series, id: 's3', name: 'Undrawable', problems: ['The look in use draws no quote'] }],
    value, pick: noop, leave: noop, renumber: noop,
  });
  it('offers the series as kinds of post, and a number once in one', () => {
    const out = draw(<KindChooser value="statement" onChange={noop} series={slot(null)} />);
    expect(radios(out, 'Kind of post')).toEqual({ labels: ['Statement', 'Number', 'List', 'Quote', 'Picture', 'Event', 'Offer', 'Series: Tip of the week'], checked: 'Statement' });
    const inIt = draw(<KindChooser value="statement" onChange={noop} series={slot({ id: 's1', number: 12 })} />);
    expect(radios(inIt, 'Kind of post').checked).toBe('Series: Tip of the week');
    expect(inIt).toContain('Statement · weekly on Tuesdays · next Tip #12');
    expect(inIt).toMatch(/<label[^>]*>Number<\/label><input[^>]*type="number"[^>]*value="12"/);
  });
  it('chooses the design from cards, named when there is no picture, with Automatic first', () => {
    const html = draw(<DesignChooser options={[{ variant: 0, name: 'Shout', describe: 'Big.' }, { variant: 1, name: 'Letter', describe: 'A letter.' }]} value={1} onChange={noop} pictures={{ 0: 'data:image/jpeg;base64,AA==' }} />);
    expect(radios(html, 'Design')).toEqual({ labels: ['Automatic', 'Shout', 'Letter'], checked: 'Letter' });
    expect(html).toContain('src="data:image/jpeg;base64,AA=="');
    expect(html).toContain('A letter.');
  });
  it('says Kind of post and Design in the post form, never Look or Series', () => {
    const kinds = [{ kind: 'statement', fields: ['label', 'headline'], required: ['headline'], variants: [{ variant: 0, name: 'Shout', describe: '' }, { variant: 1, name: 'Letter', describe: '' }] }];
    const html = draw(<PostFields design={{ template: 'post', kind: 'statement', headline: 'Hi' }} onChange={noop} direction="loud" kinds={kinds} offered={['statement']} />);
    expect(radios(html, 'Kind of post').checked).toBe('Statement');
    expect(radios(html, 'Design').labels).toEqual(['Automatic', 'Shout', 'Letter']);
    expect(text(html)).not.toMatch(/\bLook\b|\bSeries\b/);
  });
  it('names the classic post type and layout Kind of post and Design', () => {
    const html = draw(<PageFields design={{ template: 'text', headline: 'Hi' }} onChange={noop} brandLayouts={[]} series={[{ key: 'tip', name: 'Tip' }] as never} />);
    expect(html).toContain('>Kind of post<');
    expect(html).toContain('>Design<');
    expect(text(html)).not.toMatch(/Post type|\bLayout\b/);
  });
});
