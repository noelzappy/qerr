// The audit log's filter by the kind of change: chips under five headings instead of a 15-option dropdown.
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AUDIT_FILTER_GROUPS, KindFilter } from '../web/src/pages/Audit';
import { AUDIT_GROUPS } from '../web/src/lib/labels';

describe('the kind of change filter', () => {
  it('puts every kind under exactly one heading', () => {
    const grouped = AUDIT_FILTER_GROUPS.flatMap((g) => g.values);
    expect([...grouped].sort()).toEqual(AUDIT_GROUPS.map((g) => g.value).sort());
    expect(new Set(grouped).size).toBe(grouped.length);
  });
  it('is one group of radio chips, Everything first, with the chosen one checked', () => {
    const html = renderToString(<KindFilter value="post" onChange={() => {}} />);
    expect(html).toMatch(/<legend[^>]*>What kind of change<\/legend>/);
    const radios = [...html.matchAll(/<input([^>]*)>/g)].map((m) => m[1]!);
    expect(radios).toHaveLength(AUDIT_GROUPS.length + 1);
    expect(new Set(radios.map((r) => r.match(/name="([^"]+)"/)![1])).size).toBe(1);
    expect(radios.filter((r) => r.includes('checked')).map((r) => r.match(/value="([^"]*)"/)![1])).toEqual(['post']);
    expect(html.indexOf('Everything')).toBeLessThan(html.indexOf('Invitations'));
    for (const g of AUDIT_FILTER_GROUPS) expect(html).toContain(`role="group" aria-label="${g.title}"`);
    expect(html).not.toContain('role="combobox"');
  });
});
