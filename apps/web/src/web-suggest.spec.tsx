// The AI suggestion components (web/src/components/suggest): how a picture suggestion is merged into a card, and the cards drawn
// as static markup. How they behave in a browser was looked at with screenshots, not run here.
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BrandSiteSuggest } from '../web/src/components/suggest/BrandSiteSuggest';
import { DescribeAllButton, PictureSuggest, PictureSuggestProvider, pictureSuggestionPatch } from '../web/src/components/suggest/PictureSuggest';

const S = { title: 'Hands pouring coffee', description: 'Hands pouring coffee into a cup.', tags: ['coffee', 'hands'], peopleVisible: true };

describe('pictureSuggestionPatch', () => {
  it('replaces a title made from the file name, keeps one a person typed, and adds the tags to the ones there', () => {
    expect(pictureSuggestionPatch({ title: 'IMG 2041', tags: '' }, S, 'IMG 2041')).toEqual({ title: 'Hands pouring coffee', body: S.description, tags: 'coffee, hands' });
    expect(pictureSuggestionPatch({ title: 'Our Tuesday roast', tags: 'news, coffee' }, S, 'IMG 2041')).toEqual({ title: 'Our Tuesday roast', body: S.description, tags: 'news, coffee, hands' });
    // an emptied title is filled; a suggestion without a title leaves the title as it is
    expect(pictureSuggestionPatch({ title: '', tags: '' }, S, 'IMG 2041').title).toBe('Hands pouring coffee');
    expect(pictureSuggestionPatch({ title: 'IMG 2041', tags: '' }, { ...S, title: undefined }, 'IMG 2041').title).toBe('IMG 2041');
  });

  it('never says anything about people or consent: those stay the person\'s to set', () => {
    expect(Object.keys(pictureSuggestionPatch({ title: 'x', tags: '' }, S, 'x')).sort()).toEqual(['body', 'tags', 'title']);
  });
});

describe('static markup', () => {
  it('a picture card offers "Describe with AI", and "Describe all" is a labelled button', () => {
    const file = new File([new Uint8Array([1])], 'a.png');
    const html = renderToString(
      <PictureSuggestProvider>
        <DescribeAllButton />
        <PictureSuggest id="r1" source={{ file }} hasDescription={false} onUse={() => {}} />
      </PictureSuggestProvider>,
    );
    expect(html).toContain('Describe all with AI');
    expect(html).toContain('Describe with AI');
  });

  it('"Suggest from website" waits for a website and says where to add one', () => {
    const html = renderToString(<BrandSiteSuggest website="" values={{}} onUse={() => {}} />);
    expect(html).toContain('Suggest from website');
    expect(html).toContain('disabled');
    expect(html).toContain('Add your website under Identity first.');
  });
});
