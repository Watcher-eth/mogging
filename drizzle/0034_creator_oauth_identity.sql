ALTER TABLE "creator_social_accounts" ALTER COLUMN "handle" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "creator_social_accounts" ADD COLUMN IF NOT EXISTS "display_name" text;
