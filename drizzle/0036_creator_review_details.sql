ALTER TABLE "creator_attribution_metrics" ADD COLUMN "posted_at" timestamp;
--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD COLUMN "paypal_me_url" text;
