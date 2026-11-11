ALTER TABLE creator_internal_warnings ADD COLUMN category text NOT NULL DEFAULT 'other';
--> statement-breakpoint
ALTER TABLE creator_internal_warnings ADD COLUMN penalty_points integer NOT NULL DEFAULT 0 CHECK (penalty_points >= 0 AND penalty_points <= 200);
--> statement-breakpoint
ALTER TABLE creator_internal_warnings ADD COLUMN submission_id text REFERENCES creator_submissions(id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX creator_warning_active_category_unique ON creator_internal_warnings (creator_profile_id, category, coalesce(submission_id, '')) WHERE resolved_at IS NULL AND category <> 'other';
--> statement-breakpoint
CREATE TABLE creator_score_history (
  id text PRIMARY KEY,
  creator_profile_id text NOT NULL REFERENCES creator_profiles(id) ON DELETE CASCADE,
  score jsonb NOT NULL,
  source_hash text NOT NULL,
  delta integer NOT NULL,
  reason text NOT NULL,
  actor text,
  created_at timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX creator_score_history_latest_idx ON creator_score_history(creator_profile_id, created_at DESC, id DESC);
