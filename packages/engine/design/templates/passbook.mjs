// passbook: a headline, a sub line and a passbook page of 28 to 31 days (ticks for the days paid, a heavy box on today), with an
// optional register card beside it.
// Unused: drawn from its layouts (lib/design/builtin/artefacts.mjs); the function stays until every template is converted.
import { artefactPage } from './artefactPage.mjs';

export const passbook = (spec, ctx) => artefactPage(spec, ctx, { type: 'passbook', days: spec.days, ticked: spec.ticked, today: spec.today, tick: spec.tick, register: spec.register });
