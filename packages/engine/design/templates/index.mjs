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

export const TEMPLATE_FNS = { object, number, product, 'myth-fact': mythFact, closing, cover, text, ledger, passbook, stats, screen, 'photo-story': photoStory, photo, pagecover };
