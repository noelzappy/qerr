-- Whether a screen picture is a pre-framed phone capture (true: it has transparency, the way the engine tests it), a plain
-- screenshot (false), or not known yet (null: read from the stored file the next time it is needed).
ALTER TABLE "vault_items" ADD COLUMN IF NOT EXISTS "phoneFramed" BOOLEAN;
