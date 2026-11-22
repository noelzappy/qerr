// The post editor's small choices, drawn as static markup (no browser): two to four options are one row of radio buttons (one tab
// stop, arrow keys move) rather than a dropdown, the info rows are added from chips, the headline's icons are a grid, and no native
// <select> is left. How they behave under the pointer was not run here; see the screenshots of phase 1.
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DesignFields } from '../web/src/pages/batches/DesignFields';
import { ArtefactEditor } from '../web/src/pages/batches/editor/ArtefactEditor';
import { HeadlineField } from '../web/src/pages/batches/editor/HeadlineField';
import { ImageOptions } from '../web/src/pages/batches/editor/ImageOptions';
import { InfoEditor } from '../web/src/pages/batches/editor/InfoEditor';
import { LayoutChooser } from '../web/src/pages/batches/editor/LayoutChooser';

const noop = () => {};
const draw = (node: React.ReactNode) => renderToString(<TooltipProvider>{node}</TooltipProvider>).replace(/<!-- -->/g, '');
// Native selects a person would see (the kit's select keeps a hidden one for forms, marked aria-hidden).
const nativeSelects = (html: string) => (html.match(/<select(?![^>]*aria-hidden="true")/g) ?? []).length;
// The radio group a legend names: its options, and the one that is checked.
function radioGroup(html: string, legend: string) {
  const at = html.indexOf(`<span>${legend}</span>`);
  expect(at, legend).toBeGreaterThan(-1);
  const group = html.slice(at, html.indexOf('</fieldset>', at));
  const labels = [...group.matchAll(/type="radio"[^>]*\/>([^<]+)</g)].map((m) => m[1]);
  const checked = /type="radio"[^>]*checked=""[^>]*\/>([^<]+)</.exec(group)?.[1];
  return { labels, checked };
}

describe('image options', () => {
  it('asks the photo questions with one tap each', () => {
    const html = draw(<ImageOptions design={{ template: 'photo', textAt: 'bottom' }} onChange={noop} brandLayouts={[]} />);
    expect(radioGroup(html, 'Where the text sits')).toEqual({ labels: ['Automatic', 'Top', 'Bottom'], checked: 'Bottom' });
    expect(radioGroup(html, 'Dark fade behind the text')).toEqual({ labels: ['Automatic', 'On', 'Off'], checked: 'Automatic' });
  });
  it('asks the screen questions with one tap each, Yes and No left to the layout until chosen', () => {
    const html = draw(<ImageOptions design={{ template: 'screen', device: 'phone', glow: false }} onChange={noop} brandLayouts={[]} />);
    expect(radioGroup(html, 'Kind of screen')).toEqual({ labels: ['Automatic', 'Phone', 'Desktop'], checked: 'Phone' });
    expect(radioGroup(html, 'Glow behind the phone')).toEqual({ labels: ['Automatic', 'Yes', 'No'], checked: 'No' });
    expect(radioGroup(html, 'Fade the phone out at the bottom').checked).toBe('Automatic');
  });
  it('keeps a value set for each size as a choice of its own, to change in Advanced', () => {
    const html = draw(<ImageOptions design={{ template: 'photo', textAt: { feed: 'top', story: 'bottom' } }} onChange={noop} brandLayouts={[]} />);
    expect(radioGroup(html, 'Where the text sits')).toEqual({ labels: ['Automatic', 'Top', 'Bottom', 'Per size'], checked: 'Per size' });
  });
});

describe('the table or card of a Text layout', () => {
  it('chooses the kind and the tick colour with one tap', () => {
    const html = draw(<ArtefactEditor value={{ type: 'passbook', days: 30, ticked: 3, tick: 'gold' }} onChange={noop} />);
    expect(radioGroup(html, 'Table or card')).toEqual({ labels: ['None', 'Ledger table', 'Passbook page', 'Member card'], checked: 'Passbook page' });
    expect(radioGroup(html, 'Tick colour')).toEqual({ labels: ['Dark ink', 'Gold'], checked: 'Gold' });
    expect(radioGroup(html, 'Days in the month')).toEqual({ labels: ['28', '29', '30', '31'], checked: '30' });
    expect(nativeSelects(html)).toBe(0);
  });
  it('has no native select in a ledger table', () => {
    const html = draw(<ArtefactEditor value={{ type: 'ledger', columns: [{ label: 'Day', align: 'start' }, { label: 'Amount', align: 'end' }], rows: [['Mon', '£10']], marks: [{ row: 0, col: 1 }] }} onChange={noop} />);
    expect(nativeSelects(html)).toBe(0);
    expect(html).toContain('aria-label="Column 1 alignment"');
  });
});

describe('info rows', () => {
  it('adds a row by tapping its label; a label in use is not offered again', () => {
    const html = draw(<InfoEditor value={[{ key: 'When', value: '12 Dec' }]} onChange={noop} keys={['When', 'Where', 'Price']} min={1} max={4} maxChars={40} />);
    expect(nativeSelects(html)).toBe(0);
    expect(html).toContain('aria-label="Add a Where row"');
    expect(html).toContain('aria-label="Add a Price row"');
    expect(html).not.toContain('aria-label="Add a When row"');
    expect(html).toContain('aria-label="Remove the When row"');
  });
  it('offers no label once the rows are full', () => {
    const html = draw(<InfoEditor value={[{ key: 'When', value: 'a' }, { key: 'Where', value: 'b' }]} onChange={noop} keys={['When', 'Where', 'Price']} min={1} max={2} maxChars={40} />);
    expect(html).not.toContain('Add a Price row');
  });
});

describe('the headline', () => {
  it('offers its icons from a button, not a dropdown', () => {
    const html = draw(<HeadlineField value="Hi" onChange={noop} marks icons={['arrow-right', 'star']} />);
    expect(nativeSelects(html)).toBe(0);
    expect(html).toContain('aria-label="Put an icon at the cursor"');
    expect(html).toContain('aria-haspopup="dialog"');
  });
});

describe('the layout chooser', () => {
  it('is the kit select, not a native one', () => {
    const html = draw(<LayoutChooser value="text" onChange={noop} brandLayouts={[]} />);
    expect(nativeSelects(html)).toBe(0);
    expect(html).toContain('role="combobox"');
  });
});

describe('the designed image switch', () => {
  it('is a switch, marked Auto while it is on for a new post', () => {
    const html = draw(<DesignFields design={{ template: 'post', kind: 'statement' }} jsonError="" onChange={noop} autoOn />);
    expect(html).toContain('role="switch"');
    expect(html).toContain('data-auto-tag');
    expect(html).toContain('On for a new post because the brand has a look.');
  });
  it('has no Auto mark once it is the choice of the person', () => {
    const html = draw(<DesignFields design={{ template: 'post', kind: 'statement' }} jsonError="" onChange={noop} />);
    expect(html).toContain('role="switch"');
    expect(html).not.toContain('data-auto-tag');
  });
});
