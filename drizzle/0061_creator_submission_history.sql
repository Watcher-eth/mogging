-- Nullable for older events: never invent historical metrics or earnings.
ALTER TABLE creator_submission_updates ADD COLUMN IF NOT EXISTS history_snapshot jsonb;
