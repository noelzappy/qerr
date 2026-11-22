-- A brand saved from now on starts on the shipped Clean look. Brands already saved keep their choice; null still means classic layouts.
ALTER TABLE "brand_profiles" ALTER COLUMN "activeLookRef" SET DEFAULT 'shipped:clean';
