ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "hair_color" text;
--> statement-breakpoint
ALTER TABLE "anonymous_profiles" ADD COLUMN IF NOT EXISTS "hair_color" text;
--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN IF NOT EXISTS "hair_color" text;
--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN IF NOT EXISTS "age" integer;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "photos_hair_color_idx" ON "photos" USING btree ("hair_color");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "photos_age_idx" ON "photos" USING btree ("age");
