// The swiss look's test copy (the prototype's own: sample = its normal pages, stress = its longest copy that holds, minimal = the least a post of each kind needs). Fictional: Emberwell Coffee.
export const NORMAL = {
  "swiss/statement/0": {"label":"Roastery","headline":"Small batches, roasted slowly.","sub":"Twelve kilos at a time, tasted at every stage and packed within days. If a batch misses the mark, it never leaves the roastery."},
  "swiss/statement/1": {"label":"How we work","headline":"We roast twelve kilos at a time and *taste every batch*","sub":"Small enough to watch closely. Big enough to keep the lights on."},
  "swiss/figure/0": {"label":"In numbers","big":"12","unit":"kg per batch","sub":"Our roaster holds twelve kilos and we never fill it past that. Smaller loads heat evenly and give us time to listen to every crack."},
  "swiss/list/0": {"label":"Process","headline":"How we roast, in four steps","items":["Sort and weigh the green beans","Roast twelve kilos, never more","Cool fast, then rest for three days","Cup every batch before it ships"]},
  "swiss/quote/0": {"label":"Our view","quote":"A good roast does not shout. It lets the bean speak, and it never hides a flaw behind the colour of the crust.","by":"Emberwell house notes"},
  "swiss/photo/0": {"label":"Winter menu","headline":"Winter filter coffee is back on the bar","sub":"A washed Ethiopian lot, roasted light and brewed slowly through paper. Warm, bright and quietly sweet."},
  "swiss/photo/1": {"label":"From the roaster","headline":"Straight from the *drum*, into your hands"},
  "swiss/event/0": {"label":"Event","headline":"Cupping evening: six roasts, one table","meta":"12 Dec · 6pm · The roastery","sub":"Taste six roasts side by side with the people who made them. Twelve seats, so book early."},
  "swiss/offer/0": {"label":"The house blend","headline":"Ember No. 1, our everyday house blend","tag":"£9.50","sub":"Chocolate, toasted hazelnut and a little orange peel. 250 g, roasted this week."},
};
export const STRESS = {
  "swiss/statement/0": {"label":"Roastery and the small batch","headline":"We roast a dozen kilos at a time, taste every batch and bin the rest","sub":"Twelve kilos at a time, tasted at every stage and packed within days. If a batch misses the mark, it never leaves the roastery. Ever."},
  "swiss/statement/1": {"label":"How we work, in our words","headline":"We roast twelve kilos at a time and *throw out any batch that misses*","sub":"Small enough to watch closely. Big enough to keep the lights on, and never bigger than that."},
  "swiss/figure/0": {"label":"In numbers, every batch","big":"1,250 kg","unit":"per week","sub":"Our roaster holds twelve kilos and we never fill it past that. Smaller loads heat evenly and give us time to listen to every crack, always."},
  "swiss/list/0": {"label":"Process, step by step","headline":"How we roast every batch, in five steps","items":["Sort and weigh the green beans by density","Roast twelve kilos, never a gram over that","Cool fast on the tray, rest for three days","Cup every single batch before it ships out","Pack within a week, roast date on every bag"]},
  "swiss/quote/0": {"label":"Our view on roasting","quote":"A good roast does not shout. It lets the bean speak, and it never hides a flaw behind the colour of the crust. Roast lighter, taste harder, be honest.","by":"Emberwell house notes, winter 2026"},
  "swiss/photo/0": {"label":"Winter menu on the bar","headline":"Winter filter coffee is back on the bar, and brighter","sub":"A washed Ethiopian lot, roasted light and brewed slowly through paper. Warm, bright and quietly sweet, with a long finish like stewed plums."},
  "swiss/photo/1": {"label":"From the roaster, daily","headline":"Straight from the *drum*, into your hands this same week"},
  "swiss/event/0": {"label":"Event at the roastery now","headline":"Cupping evening: taste six roasts side by side, with the roaster","meta":"12 Dec · 6pm · The roastery, Unit 4","sub":"Taste six roasts side by side with the people who made them. Twelve seats, so book early or you may miss out."},
  "swiss/offer/0": {"label":"The house blend, weekly","headline":"Ember No. 1, our everyday house blend, now in a bigger bag","tag":"£9.50 / 250 g","sub":"Chocolate, toasted hazelnut and a little orange peel. 250 g, roasted this week. Free delivery on three bags or more."},
};
// The least each composition needs: the required fields of its kind, as short as can be.
export const MINIMAL = {
  'swiss/statement/0': { headline: 'Hello' },
  'swiss/statement/1': { headline: 'Go' },
  'swiss/figure/0': { big: '7' },
  'swiss/list/0': { headline: 'Three', items: ['One', 'Two', 'Three'] },
  'swiss/quote/0': { quote: 'Said' },
  'swiss/photo/0': { headline: 'Look' },
  'swiss/photo/1': { headline: 'Look' },
  'swiss/event/0': { headline: 'Night', meta: '12 Dec' },
  'swiss/offer/0': { headline: 'Half', tag: '-50%' },
};
