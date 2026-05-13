ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "country" varchar(2);--> statement-breakpoint
ALTER TABLE "anonymous_profiles" ADD COLUMN IF NOT EXISTS "country" varchar(2);--> statement-breakpoint
ALTER TABLE "anonymous_profiles" ADD COLUMN IF NOT EXISTS "state" varchar(2);
