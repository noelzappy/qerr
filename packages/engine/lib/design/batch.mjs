// The "design" block of a batch post: its validation inside a batch, and the stem its image files are named from.
import { slugify, validateDesign } from './spec.mjs';
import { layoutDesignProblems } from './layout.mjs';

const NAME_OK = /^[a-z0-9][a-z0-9._-]*$/;
export const stemOf = (post, spec) => spec.name ?? (NAME_OK.test(post.id) ? post.id : slugify(post.id));

// Errors for every design block in a batch (used by the batch validator too). opts: { series, layouts } of the brand file; a
// { template: "layout" } block is checked against the layout it names.
export function validateBatchDesigns(posts, opts = {}) {
  const errors = [];
  (posts ?? []).forEach((p, i) => {
    if (p?.design === undefined) return;
    const where = `post ${p.id ?? `#${i + 1}`}: design`;
    if (p.design?.template === 'layout') { errors.push(...layoutDesignProblems(p.design, where, opts)); return; }
    errors.push(...validateDesign(p.design, where, opts));
    if (p.design?.template === 'pagecover') errors.push(`${where}: page-cover makes profile and cover images, not post images, so it cannot be used in a batch`);
  });
  return errors;
}
