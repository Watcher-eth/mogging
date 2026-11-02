CREATE TABLE IF NOT EXISTS creator_submission_analytics (
  submission_id text NOT NULL REFERENCES creator_submissions(id) ON DELETE CASCADE,
  storage_key text NOT NULL,
  assessed_at timestamp NOT NULL,
  data jsonb NOT NULL,
  PRIMARY KEY (submission_id, storage_key)
);
CREATE INDEX IF NOT EXISTS creator_submission_analytics_time_idx
  ON creator_submission_analytics (submission_id, assessed_at);

-- Retain existing readings without claiming that their optional metrics were verified.
INSERT INTO creator_submission_analytics (submission_id, storage_key, assessed_at, data)
SELECT id, audience_check->>'storageKey', (audience_check->>'checkedAt')::timestamptz AT TIME ZONE 'UTC', audience_check
FROM creator_submissions
WHERE audience_check->>'status' IN ('verified', 'needs_review')
  AND audience_check->>'storageKey' IS NOT NULL AND audience_check->>'checkedAt' IS NOT NULL
ON CONFLICT DO NOTHING;
