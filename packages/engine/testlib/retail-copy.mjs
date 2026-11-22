// The retail direction's test copy, shared by the retail tests: the prototype's two brands as colours, its normal copy (sample), its longest
// copy that holds (stress), the least a post of each kind needs (minimal), and hostile text. Fictional: Emberwell Coffee and Larder & Loom.
import { loadBrand } from '../lib/design/brand.mjs';

export const PICS = { photo: 'design/assets/demo/object-jar.jpg', offer: 'design/assets/demo/scene-market.jpg', event: 'design/assets/demo/scene-market.jpg' };
// The prototype's two brands, as colours the brand pack would hold (primary = the field, gold = the sticker).
export const PALETTES = {
  A: { name: 'Emberwell Coffee', light: '#F7EFE3', ink: '#22140D', primary: '#B8431A', gold: '#F6C344', deep: '#8A5A00' },
  B: { name: 'Larder & Loom', light: '#F6F0E1', ink: '#1F1F17', primary: '#4E5B2A', gold: '#E3A72F', deep: '#7A5200' },
};
export const paletteBrand = ({ name, light, ink, primary, gold, deep }) => { const b = loadBrand(); return { name, grounds: { ...b.grounds, light, dark: ink }, text: { ...b.text, ink }, accents: { ...b.accents, primary, gold, goldDeep: deep } }; };
// Normal copy (the prototype's) and its longest copy that holds (the prototype's stress sheet), by composition.
export const NORMAL = {
  'retail/statement/0': { headline: 'Roasted in small batches, *never in a hurry.*' },
  'retail/statement/1': { headline: 'Small batches. *No shortcuts.*', sub: 'Every roast is 12 kg or less, watched by a person from first crack to cooling tray.' },
  'retail/figure/0': { label: 'Per batch', big: '12 kg', unit: 'in every roast', sub: 'Our drum could take far more. We load 12 kg so each bag gets the same close attention.' },
  'retail/list/0': { headline: 'Four steps. *Zero shortcuts.*', items: ['Sort the green beans by hand', 'Roast 12 kg, never more', 'Cool in four minutes flat', 'Bag it the same day'] },
  'retail/quote/0': { quote: 'We don’t roast fast. We roast right.', by: 'Emberwell house notes' },
  'retail/photo/0': { headline: 'Winter filter coffee, *slow and sweet.*', sub: 'Cocoa, baked apple and a little orange. Brewed by the cup, all season.', tag: 'New' },
  'retail/photo/1': { headline: 'Roasted Monday. *In your cup by Friday.*', sub: 'Small batches go from drum to doorstep in five days.', tag: 'Fresh this week' },
  'retail/event/0': { headline: 'Cupping evening: *taste with us.*', meta: '12 Dec · 6pm · The roastery', sub: 'Six coffees, one table, no experience needed.' },
  'retail/offer/0': { headline: 'Meet *Ember No. 1.*', tag: '£9.50', sub: 'Our house blend. Chocolate, toasted hazelnut and a little orange peel. 250 g, roasted this week.' },
};
export const STRESS = {
  'retail/statement/0': { headline: 'We roast every single batch by hand, *and we never ever rush it.*' },
  'retail/statement/1': { headline: 'Nothing leaves early. *Not until we would drink it ourselves.*', sub: 'Every roast is 12 kg or less, watched by a person from first crack to cooling tray, then rested for two days before it is bagged.' },
  'retail/figure/0': { label: 'Roasted per single batch', big: '1,250 kg', unit: 'in a single roast run', sub: 'Our drum could take far more. We load only what we can watch, so each and every bag gets the same close attention, always.' },
  'retail/list/0': { headline: 'How we roast, bean to bag, *step by step.*', items: ['Sort the green beans by hand, every time', 'Roast 12 kg at a time, and never more', 'Cool the beans in under four minutes', 'Rest them for two days before we bag', 'Bag it, label it and send it the same day'] },
  'retail/quote/0': { quote: 'We do not roast fast and we do not roast cheap. We roast right, in small batches, by hand, every single day, and we taste every one.', by: 'Emberwell house notes, long form' },
  'retail/photo/0': { headline: 'Our winter filter coffee is here, *slow, sweet and brewed by the cup.*', sub: 'Cocoa, baked apple and a little orange. Brewed by the cup all season, never batch brewed and left to sit on a hot plate.', tag: 'New this winter' },
  'retail/photo/1': { headline: 'Roasted on a Monday morning, *in your cup by Friday at the latest.*', sub: 'Small batches go from drum to doorstep in five days, so what you taste is what we roasted, and never what was left on a shelf.', tag: 'Fresh this week!' },
  'retail/event/0': { headline: 'Our big cupping evening, *taste six coffees.*', meta: '12 Dec · 6pm · The roastery, Unit 4', sub: 'Six coffees, one table, no experience needed. Bring a friend.' },
  'retail/offer/0': { headline: 'Ember No. 1, our *house blend, now in a big bag.*', tag: '£9.50 a bag', sub: 'Chocolate, toasted hazelnut and a little orange peel in every cup. 250 g, roasted this week.' },
};
// The least each composition needs: the required fields of its kind, as short as can be (a Mantra still needs a first part of at most 22 characters).
export const MINIMAL = {
  'retail/statement/0': { headline: 'Hello' },
  'retail/statement/1': { headline: 'Go *now*' },
  'retail/figure/0': { big: '7' },
  'retail/list/0': { headline: 'Three', items: ['One', 'Two'] },
  'retail/quote/0': { quote: 'Said' },
  'retail/photo/0': { headline: 'Look' },
  'retail/photo/1': { headline: 'Look' },
  'retail/event/0': { headline: 'Night', meta: '12 Dec' },
  'retail/offer/0': { headline: 'Half', tag: '-50%' },
};
export const HOSTILE = [
  '"><script>window.__pwn=1</script>', '</style><script>window.__pwn=2</script>', '<img src=x onerror="window.__pwn=3">', "';alert(1);//",
  '</div><svg onload=window.__pwn=4>', 'javascript:alert(5)', '`${window.__pwn=6}`', 'url(http://evil.example/x.png)', '*<b>x</b>* \\n <i>y</i>',
];
// A post design of a retail composition from its copy (a picture where the composition draws one).
export const retailSpec = (comp, copy) => ({ template: 'post', kind: comp.id.split('/')[1], variant: Number(comp.id.split('/')[2]), name: 'retail-test', ...copy, ...(comp.fields.includes('image') ? { image: PICS[comp.id.split('/')[1]] } : {}) });
// MINIMAL as the checks accept it: for two compositions the bare required fields leave an empty area the page checks refuse (the code
// compositions refuse them too), so these carry the one extra field that fills it. MINIMAL itself is the recorded markup fixtures' copy.
export const MINIMAL_CHECKED = { ...MINIMAL, 'retail/figure/0': { big: '7 kg', unit: 'per bag', sub: 'One bag, always.' }, 'retail/photo/1': { headline: 'Look', sub: 'Small batches.', tag: 'New' } };
