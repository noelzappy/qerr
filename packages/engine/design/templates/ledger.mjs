// ledger: a headline, a sub line and a ledger card (ruled mono rows, gold underlines on chosen cells) on the panel.
// Unused: drawn from its layout (lib/design/builtin/artefacts.mjs); the function stays until every template is converted.
import { artefactPage } from './artefactPage.mjs';

export const ledger = (spec, ctx) => artefactPage(spec, ctx, { type: 'ledger', columns: spec.columns, rows: spec.rows, mark: spec.mark, notes: spec.notes });
