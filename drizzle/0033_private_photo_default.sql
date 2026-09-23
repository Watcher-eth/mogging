-- Existing photo visibility is unchanged. Publishing requires an explicit choice.
ALTER TABLE "photos" ALTER COLUMN "is_public" SET DEFAULT false;
