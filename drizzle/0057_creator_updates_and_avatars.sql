ALTER TABLE creator_social_accounts ADD COLUMN avatar_checked_at timestamp;
--> statement-breakpoint
CREATE TABLE creator_submission_updates (
  id text PRIMARY KEY NOT NULL,
  submission_id text NOT NULL REFERENCES creator_submissions(id) ON DELETE CASCADE,
  type text NOT NULL,
  note text,
  created_at timestamp DEFAULT now() NOT NULL,
  CONSTRAINT creator_submission_updates_type_check CHECK (type IN ('submitted', 'pending', 'in_review', 'approved', 'rejected', 'paid', 'rereview_requested', 'feedback'))
);
--> statement-breakpoint
CREATE INDEX creator_submission_updates_submission_time_idx ON creator_submission_updates (submission_id, created_at);
