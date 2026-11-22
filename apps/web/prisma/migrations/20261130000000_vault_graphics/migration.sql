-- Brand graphics: a picture item (kind 'photo') has a role: 'photo' (an ordinary photo), 'cutout' (a person or product on a
-- transparent background) or 'graphic' (a shape, sticker or mark). Existing rows are photos (and screens, which keep role 'photo').
-- tintable: single-colour artwork a look may recolour with a brand colour role. width/height: read from the file header when it
-- is uploaded (null for older files). brandId is the owner, the same plain indexed column the looks use.
ALTER TABLE "vault_items" ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'photo';
ALTER TABLE "vault_items" ADD COLUMN IF NOT EXISTS "tintable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "vault_items" ADD COLUMN IF NOT EXISTS "width" INTEGER;
ALTER TABLE "vault_items" ADD COLUMN IF NOT EXISTS "height" INTEGER;
ALTER TABLE "vault_items" ADD COLUMN IF NOT EXISTS "brandId" TEXT NOT NULL DEFAULT 'brand';
CREATE INDEX IF NOT EXISTS "vault_items_brandId_role_idx" ON "vault_items"("brandId", "role");
