-- The files the style layer adds to a brand: a display font, a label font and brand artwork ({ display, label, artwork }).
ALTER TABLE "brand_profiles" ADD COLUMN IF NOT EXISTS "assets" JSONB NOT NULL DEFAULT '{}';
