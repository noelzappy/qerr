-- A post keeps its other design (the look's, or the AI's) so a person can switch back per post.
ALTER TABLE "posts" ADD COLUMN "designAlt" JSONB;
