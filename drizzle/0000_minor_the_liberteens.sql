CREATE TYPE "public"."analysis_status" AS ENUM('pending', 'processing', 'complete', 'failed');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('male', 'female', 'other');--> statement-breakpoint
CREATE TYPE "public"."photo_set_type" AS ENUM('single', 'before_after', 'multi_angle');--> statement-breakpoint
CREATE TYPE "public"."photo_source" AS ENUM('user', 'seeded', 'instagram');--> statement-breakpoint
CREATE TYPE "public"."photo_type" AS ENUM('face', 'body', 'outfit');--> statement-breakpoint
CREATE TYPE "public"."rating_algorithm" AS ENUM('trueskill_v1');--> statement-breakpoint
CREATE TABLE "accounts" (
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "analyses" (
	"id" text PRIMARY KEY NOT NULL,
	"photo_id" text NOT NULL,
	"status" "analysis_status" DEFAULT 'complete' NOT NULL,
	"psl_score" real,
	"harmony_score" real,
	"dimorphism_score" real,
	"angularity_score" real,
	"percentile" real,
	"tier" text,
	"tier_description" text,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"landmarks" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"model" text,
	"prompt_version" text,
	"failure_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analysis_shares" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"analysis_id" text NOT NULL,
	"photo_id" text NOT NULL,
	"owner_user_id" text,
	"include_leaderboard" boolean DEFAULT false NOT NULL,
	"leaderboard_snapshot" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comparisons" (
	"id" text PRIMARY KEY NOT NULL,
	"winner_photo_id" text NOT NULL,
	"loser_photo_id" text NOT NULL,
	"voter_user_id" text,
	"anonymous_actor_id" text,
	"winner_mu_before" real NOT NULL,
	"winner_sigma_before" real NOT NULL,
	"loser_mu_before" real NOT NULL,
	"loser_sigma_before" real NOT NULL,
	"winner_mu_after" real NOT NULL,
	"winner_sigma_after" real NOT NULL,
	"loser_mu_after" real NOT NULL,
	"loser_sigma_after" real NOT NULL,
	"winner_display_rating_after" integer NOT NULL,
	"loser_display_rating_after" integer NOT NULL,
	"algorithm" "rating_algorithm" DEFAULT 'trueskill_v1' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "person_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"anonymous_actor_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photo_ratings" (
	"photo_id" text PRIMARY KEY NOT NULL,
	"algorithm" "rating_algorithm" DEFAULT 'trueskill_v1' NOT NULL,
	"mu" real DEFAULT 25 NOT NULL,
	"sigma" real DEFAULT 8.333333 NOT NULL,
	"conservative_score" real DEFAULT 0 NOT NULL,
	"display_rating" integer DEFAULT 1000 NOT NULL,
	"win_count" integer DEFAULT 0 NOT NULL,
	"loss_count" integer DEFAULT 0 NOT NULL,
	"comparison_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photo_sets" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"anonymous_actor_id" text,
	"type" "photo_set_type" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photos" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"anonymous_actor_id" text,
	"photo_set_id" text,
	"person_group_id" text,
	"image_url" text NOT NULL,
	"image_storage_key" text,
	"image_hash" text NOT NULL,
	"name" text,
	"caption" text,
	"gender" "gender" DEFAULT 'other' NOT NULL,
	"source" "photo_source" DEFAULT 'user' NOT NULL,
	"photo_type" "photo_type" DEFAULT 'face' NOT NULL,
	"position" text,
	"is_public" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_stats" (
	"id" text PRIMARY KEY DEFAULT 'global' NOT NULL,
	"total_comparisons" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"email_verified" timestamp,
	"image" text,
	"password_hash" text,
	"bio" text,
	"state" varchar(2),
	"verified" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_photo_id_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_shares" ADD CONSTRAINT "analysis_shares_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_shares" ADD CONSTRAINT "analysis_shares_photo_id_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_shares" ADD CONSTRAINT "analysis_shares_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_winner_photo_id_photos_id_fk" FOREIGN KEY ("winner_photo_id") REFERENCES "public"."photos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_loser_photo_id_photos_id_fk" FOREIGN KEY ("loser_photo_id") REFERENCES "public"."photos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_voter_user_id_users_id_fk" FOREIGN KEY ("voter_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_groups" ADD CONSTRAINT "person_groups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_ratings" ADD CONSTRAINT "photo_ratings_photo_id_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_sets" ADD CONSTRAINT "photo_sets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_photo_set_id_photo_sets_id_fk" FOREIGN KEY ("photo_set_id") REFERENCES "public"."photo_sets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_person_group_id_person_groups_id_fk" FOREIGN KEY ("person_group_id") REFERENCES "public"."person_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "analyses_photo_id_unique" ON "analyses" USING btree ("photo_id");--> statement-breakpoint
CREATE INDEX "analyses_status_idx" ON "analyses" USING btree ("status");--> statement-breakpoint
CREATE INDEX "analyses_psl_score_idx" ON "analyses" USING btree ("psl_score");--> statement-breakpoint
CREATE INDEX "analyses_created_at_idx" ON "analyses" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "analysis_shares_token_unique" ON "analysis_shares" USING btree ("token");--> statement-breakpoint
CREATE INDEX "analysis_shares_analysis_id_idx" ON "analysis_shares" USING btree ("analysis_id");--> statement-breakpoint
CREATE INDEX "analysis_shares_photo_id_idx" ON "analysis_shares" USING btree ("photo_id");--> statement-breakpoint
CREATE INDEX "analysis_shares_owner_user_id_idx" ON "analysis_shares" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "comparisons_winner_photo_id_idx" ON "comparisons" USING btree ("winner_photo_id");--> statement-breakpoint
CREATE INDEX "comparisons_loser_photo_id_idx" ON "comparisons" USING btree ("loser_photo_id");--> statement-breakpoint
CREATE INDEX "comparisons_voter_user_id_idx" ON "comparisons" USING btree ("voter_user_id");--> statement-breakpoint
CREATE INDEX "comparisons_created_at_idx" ON "comparisons" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "person_groups_user_id_idx" ON "person_groups" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "person_groups_anonymous_actor_id_idx" ON "person_groups" USING btree ("anonymous_actor_id");--> statement-breakpoint
CREATE INDEX "photo_ratings_conservative_score_idx" ON "photo_ratings" USING btree ("conservative_score");--> statement-breakpoint
CREATE INDEX "photo_ratings_display_rating_idx" ON "photo_ratings" USING btree ("display_rating");--> statement-breakpoint
CREATE INDEX "photo_sets_user_id_idx" ON "photo_sets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "photo_sets_anonymous_actor_id_idx" ON "photo_sets" USING btree ("anonymous_actor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "photos_image_hash_unique" ON "photos" USING btree ("image_hash");--> statement-breakpoint
CREATE INDEX "photos_user_id_idx" ON "photos" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "photos_anonymous_actor_id_idx" ON "photos" USING btree ("anonymous_actor_id");--> statement-breakpoint
CREATE INDEX "photos_person_group_id_idx" ON "photos" USING btree ("person_group_id");--> statement-breakpoint
CREATE INDEX "photos_source_idx" ON "photos" USING btree ("source");--> statement-breakpoint
CREATE INDEX "photos_public_type_idx" ON "photos" USING btree ("is_public","photo_type");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");