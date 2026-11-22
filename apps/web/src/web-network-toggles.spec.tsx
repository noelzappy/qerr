// The network chips and the caption tabs, drawn as static markup (no browser): which chips are on, that a filter is one radio
// group with "All", and that the caption has a tab only for a network that is on, with wording kept for one that is off said
// out loud. How they behave under the pointer was not run here; see the screenshots of phase 1.
import { renderToString as render } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NetworkFilter, NetworkToggles, networksSummary } from '@/components/network-toggles';
import { CaptionFields, captionTabs, overLimit } from '../web/src/pages/batches/editor/CaptionFields';

const noop = () => {};
// The markup without React's text separators.
const renderToString = (node: React.ReactNode) => render(node).replace(/<!-- -->/g, '');

describe('network toggles', () => {
  it('is one checkbox per network, checked for the ones that are on', () => {
    const html = renderToString(<NetworkToggles value={['instagram', 'x']} onChange={noop} />);
    expect(html.match(/type="checkbox"/g)?.length).toBe(4);
    expect(html.match(/checked=""/g)?.length).toBe(2);
    expect(html).toContain('data-network="instagram" data-on="true"');
    expect(html).toContain('data-network="linkedin" data-on="false"');
    for (const name of ['Instagram', 'LinkedIn', 'Facebook', 'X']) expect(html).toContain(`>${name}</span>`);
    expect(html).toContain('<legend');
  });
  it('says which networks are on in words', () => {
    expect(networksSummary([])).toBe('No network');
    expect(networksSummary(['instagram', 'linkedin'])).toBe('Instagram and LinkedIn');
    expect(networksSummary(['instagram', 'linkedin', 'x'])).toBe('3 networks');
  });
  it('shows its error', () => {
    const html = renderToString(<NetworkToggles value={[]} onChange={noop} error="Choose at least one network" />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('Choose at least one network');
  });
});

describe('the channel filter', () => {
  it('is one radio group with All first and one choice per network', () => {
    const html = renderToString(<NetworkFilter value="linkedin" onChange={noop} />);
    expect(html.match(/type="radio"/g)?.length).toBe(5);
    expect(html).not.toContain('role="combobox"');
    expect(html).toMatch(/<input[^>]*value="linkedin"[^>]*checked=""|<input[^>]*checked=""[^>]*value="linkedin"/);
    expect(html.match(/checked=""/g)?.length).toBe(1);
    expect(html).toContain('All<span class="sr-only"> channels</span>');
  });
});

describe('caption tabs', () => {
  const on = { instagram: true, linkedin: true, facebook: false, x: false };
  it('has a tab only for a network that is on, and keeps wording typed for one that is off', () => {
    expect(captionTabs(on, { facebook: 'Hello', x: ' ' })).toEqual({ tabs: ['instagram', 'linkedin'], kept: ['facebook'] });
  });
  it('draws Same for all and one tab per network that is on, never one for a network that is off', () => {
    const html = renderToString(<CaptionFields caption="Hi" onCaption={noop} caps={{}} onCaps={noop} on={on} />);
    expect(html.match(/role="tab"/g)?.length).toBe(3);
    expect(html).toContain('Same for all');
    expect(html).toContain('data-network="instagram"');
    expect(html).toContain('data-network="linkedin"');
    expect(html).not.toContain('data-network="facebook"');
    expect(html).not.toContain('data-network="x"');
    // the counters stay, one per network that uses the shared caption
    expect(html).toContain('Instagram </span>2 / 2200');
    expect(html).toContain('LinkedIn </span>2 / 3000');
  });
  it('says when wording for a network that is off is kept', () => {
    const html = renderToString(<CaptionFields caption="Hi" onCaption={noop} caps={{ facebook: 'Only on Facebook' }} onCaps={noop} on={on} />);
    expect(html).toContain('Your Facebook wording is kept while that network is off. It is saved with the post but not sent.');
    expect(html).toContain('Remove that wording');
    const none = renderToString(<CaptionFields caption="Hi" onCaption={noop} caps={{}} onCaps={noop} on={on} />);
    expect(none).not.toContain('is kept while');
  });
  it('marks a network whose text is over its limit', () => {
    expect(overLimit('a'.repeat(281), {}, 'x')).toBe(true);
    expect(overLimit('a'.repeat(281), { x: 'short' }, 'x')).toBe(false);
    const html = renderToString(<CaptionFields caption={'a'.repeat(300)} onCaption={noop} caps={{}} onCaps={noop} on={{ x: true }} />);
    expect(html).toContain(', too long');
  });
});
