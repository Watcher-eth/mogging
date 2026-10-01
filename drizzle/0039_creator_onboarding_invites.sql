CREATE TABLE "creator_onboarding_invites" (
	"id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"display_name" text NOT NULL,
	"handle" text NOT NULL,
	"profile_url" text NOT NULL,
	"avatar_url" text,
	"evidence_url" text NOT NULL,
	"verified_by" text NOT NULL,
	"verified_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"claimed_by_user_id" text,
	"claimed_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "creator_onboarding_invites_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "creator_onboarding_invites" ADD CONSTRAINT "creator_onboarding_invites_claimed_by_user_id_users_id_fk" FOREIGN KEY ("claimed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;