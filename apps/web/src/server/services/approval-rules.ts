// Engine warnings (lib/batch.mjs warningsFor) that mean a post cannot go out on that network. The rest are shown as warnings.
// Pure: no database, so the rule can be tested on its own.
export const HARD_WARNINGS: readonly RegExp[] = [
  /^caption is \d+ characters/,
  /^Instagram needs media/,
  // more images than the network takes in one post (the engine's MEDIA_LIMITS): Instagram 10 items, X 4 images
  /^\d+ items, Instagram allows \d+ in one post/,
  /^\d+ images, X allows \d+/,
];

export const isHardWarning = (w: string): boolean => HARD_WARNINGS.some((re) => re.test(w));
