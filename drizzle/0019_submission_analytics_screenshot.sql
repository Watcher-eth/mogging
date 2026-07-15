ALTER TABLE "creator_submissions" ALTER COLUMN "video_url" DROP NOT NULL;
ALTER TABLE "creator_submissions" ALTER COLUMN "video_storage_key" DROP NOT NULL;
ALTER TABLE "creator_submissions" ALTER COLUMN "video_content_type" DROP NOT NULL;
ALTER TABLE "creator_submissions" ALTER COLUMN "video_size_bytes" DROP NOT NULL;
ALTER TABLE "creator_submissions" ADD COLUMN "analytics_screenshot_url" text;
ALTER TABLE "creator_submissions" ADD COLUMN "analytics_storage_key" text;
ALTER TABLE "creator_submissions" ADD COLUMN "analytics_content_type" text;
ALTER TABLE "creator_submissions" ADD COLUMN "analytics_size_bytes" integer;
