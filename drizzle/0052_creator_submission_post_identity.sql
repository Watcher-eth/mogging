ALTER TABLE creator_submissions ADD COLUMN IF NOT EXISTS post_key text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS creator_submissions_post_key_unique
  ON creator_submissions (post_key) WHERE status <> 'rejected';
