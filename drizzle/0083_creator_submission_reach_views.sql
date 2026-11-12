SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "creator_submissions" ADD COLUMN IF NOT EXISTS "manual_reach_view_counts" jsonb;
