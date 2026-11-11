SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "creator_submissions" ADD COLUMN IF NOT EXISTS "analytics_video_request" jsonb;
