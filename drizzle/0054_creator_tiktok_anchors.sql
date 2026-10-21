ALTER TABLE creator_social_accounts ADD COLUMN IF NOT EXISTS followers jsonb;
--> statement-breakpoint
ALTER TABLE creator_social_accounts ADD COLUMN IF NOT EXISTS tiktok_anchor_joined_at timestamp;
