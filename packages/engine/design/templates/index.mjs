import { cover } from './cover.mjs';
import { ledger } from './ledger.mjs';
import { pagecover } from './pagecover.mjs';
import { passbook } from './passbook.mjs';
import { photo } from './photo.mjs';
import { photoStory } from './photo-story.mjs';
import { closing, mythFact, number, object, product } from './poster.mjs';
import { screen } from './screen.mjs';
import { stats } from './stats.mjs';
import { text } from './text.mjs';
import { builtinTemplate } from '../../lib/design/builtin-layouts.mjs';

// The templates' own functions. A template converted to a layout (lib/design/builtin-layouts.mjs) is drawn from its layout;
// its function stays here, unused, until every template is converted, and draws only the variants not converted yet.
export const LEGACY_FNS = { object, number, product, 'myth-fact': mythFact, closing, cover, text, ledger, passbook, stats, screen, 'photo-story': photoStory, photo, pagecover };
export const TEMPLATE_FNS = Object.fromEntries(Object.entries(LEGACY_FNS).map(([name, fn]) => [name, builtinTemplate(name, fn)]));
