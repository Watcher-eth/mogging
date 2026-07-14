CREATE TYPE "public"."creator_social_platform" AS ENUM('tiktok', 'instagram');--> statement-breakpoint
CREATE TYPE "public"."creator_social_account_status" AS ENUM('pending', 'approved', 'missing_information');--> statement-breakpoint
CREATE TABLE "creator_social_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"creator_profile_id" text NOT NULL,
	"platform" "creator_social_platform" NOT NULL,
	"handle" text NOT NULL,
	"profile_url" text,
	"status" "creator_social_account_status" DEFAULT 'pending' NOT NULL,
	"review_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "creator_social_accounts" ADD CONSTRAINT "creator_social_accounts_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "creator_social_accounts_creator_profile_id_idx" ON "creator_social_accounts" USING btree ("creator_profile_id");--> statement-breakpoint
CREATE INDEX "creator_social_accounts_status_idx" ON "creator_social_accounts" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "creator_social_accounts_creator_platform_handle_unique" ON "creator_social_accounts" USING btree ("creator_profile_id","platform","handle");
