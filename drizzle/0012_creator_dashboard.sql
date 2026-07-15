CREATE TYPE "public"."creator_auth_status" AS ENUM('pending', 'verified', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."creator_payment_option" AS ENUM('paypal', 'crypto');--> statement-breakpoint
CREATE TYPE "public"."creator_payment_status" AS ENUM('pending', 'processing', 'paid', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."creator_submission_status" AS ENUM('pending', 'in_review', 'approved', 'rejected', 'paid');--> statement-breakpoint
CREATE TABLE "creator_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"display_name" text NOT NULL,
	"social_handle" text,
	"auth_status" "creator_auth_status" DEFAULT 'pending' NOT NULL,
	"payment_option" "creator_payment_option" DEFAULT 'paypal' NOT NULL,
	"paypal_email" text,
	"crypto_network" text,
	"crypto_wallet_address" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creator_submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"creator_profile_id" text NOT NULL,
	"title" text NOT NULL,
	"platform" text NOT NULL,
	"caption" text,
	"post_url" text,
	"video_url" text NOT NULL,
	"video_storage_key" text NOT NULL,
	"video_content_type" text NOT NULL,
	"video_size_bytes" integer NOT NULL,
	"status" "creator_submission_status" DEFAULT 'pending' NOT NULL,
	"review_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creator_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"creator_profile_id" text NOT NULL,
	"submission_id" text,
	"amount_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"status" "creator_payment_status" DEFAULT 'pending' NOT NULL,
	"payment_option" "creator_payment_option" NOT NULL,
	"provider_reference" text,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD CONSTRAINT "creator_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_submissions" ADD CONSTRAINT "creator_submissions_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_payments" ADD CONSTRAINT "creator_payments_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_payments" ADD CONSTRAINT "creator_payments_submission_id_creator_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."creator_submissions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "creator_profiles_user_id_unique" ON "creator_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "creator_profiles_auth_status_idx" ON "creator_profiles" USING btree ("auth_status");--> statement-breakpoint
CREATE INDEX "creator_submissions_creator_profile_id_idx" ON "creator_submissions" USING btree ("creator_profile_id");--> statement-breakpoint
CREATE INDEX "creator_submissions_status_idx" ON "creator_submissions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "creator_submissions_created_at_idx" ON "creator_submissions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "creator_payments_creator_profile_id_idx" ON "creator_payments" USING btree ("creator_profile_id");--> statement-breakpoint
CREATE INDEX "creator_payments_submission_id_idx" ON "creator_payments" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "creator_payments_status_idx" ON "creator_payments" USING btree ("status");
