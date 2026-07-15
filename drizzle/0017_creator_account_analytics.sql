ALTER TABLE "creator_social_accounts" ADD COLUMN "analytics_video_url" text;
ALTER TABLE "creator_social_accounts" ADD COLUMN "analytics_storage_key" text;
ALTER TABLE "creator_social_accounts" ADD COLUMN "analytics_content_type" text;
ALTER TABLE "creator_social_accounts" ADD COLUMN "analytics_size_bytes" integer;
ALTER TABLE "creator_social_accounts" ADD COLUMN "analytics_period_days" integer;
ALTER TABLE "creator_social_accounts" ADD COLUMN "analytics_confirmed_at" timestamp;
