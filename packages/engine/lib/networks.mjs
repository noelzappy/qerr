// The networks Qerr knows. Our names, not Buffer's: the routing (Settings, Channels in the web app) maps each to a channel.
export const NETWORKS = ['instagram', 'linkedin', 'facebook', 'x'];
// Where a post goes when it does not say otherwise. X is opt-in so batches written before X existed keep their meaning.
export const CLASSIC_NETWORKS = ['instagram', 'linkedin', 'facebook'];
// x: 280 is Buffer's free X tier; a paid X tier allows more, so an account can raise it (captionLimits).
// The most images (or items) one post takes per network, as far as is known: Instagram 10 items in one post, X 4 images. A post over
// the limit cannot be approved for that network (the web app's approval treats these warnings as blockers). LinkedIn and Facebook
// limits through Buffer are not known, so none is set for them.
export const MEDIA_LIMITS = { instagram: 10, x: 4 };
export const LIMITS = { instagram: { chars: 2200, hashtags: 30 }, linkedin: { chars: 3000 }, facebook: { chars: 63206 }, x: { chars: 280 } };
