ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "gender" "gender";
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "age" integer;
--> statement-breakpoint
ALTER TABLE "anonymous_profiles" ADD COLUMN IF NOT EXISTS "gender" "gender";
--> statement-breakpoint
ALTER TABLE "anonymous_profiles" ADD COLUMN IF NOT EXISTS "age" integer;
--> statement-breakpoint
UPDATE "photos" SET "name" = 'Naiomi', "updated_at" = now() WHERE "name" IN ('Naiomo', 'Naimo');
--> statement-breakpoint
UPDATE "photos"
SET "gender" = 'female', "updated_at" = now()
WHERE "source" = 'seeded'
  AND "name" IN ('Vanta', 'Lizka', 'Sol', 'Lily', 'Thalia', 'Naiomi', 'Sable', 'Luma');
--> statement-breakpoint
UPDATE "photos"
SET "gender" = 'male', "updated_at" = now()
WHERE "source" = 'seeded'
  AND ("name" IS NULL OR "name" NOT IN ('Vanta', 'Lizka', 'Sol', 'Lily', 'Thalia', 'Naiomi', 'Sable', 'Luma'));
