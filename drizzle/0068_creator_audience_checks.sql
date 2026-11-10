ALTER TABLE creator_submissions ADD COLUMN audience_check jsonb;
--> statement-breakpoint
CREATE INDEX creator_audience_check_queue_idx ON creator_submissions ((audience_check->>'status'), created_at)
WHERE analytics_storage_key IS NOT NULL AND is_draft = false;
