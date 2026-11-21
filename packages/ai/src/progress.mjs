// Progress reporting for the long tasks (draft, research). The callback is optional and best effort: a callback that
// throws must never break the task, so errors from it are ignored.
export const reporter = (fn) => (p) => {
  if (typeof fn !== 'function') return;
  try { fn(p); } catch { /* progress is best effort */ }
};
