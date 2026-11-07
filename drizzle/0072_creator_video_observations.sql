CREATE TABLE creator_video_observations (
  post_key text NOT NULL,
  source text NOT NULL CHECK(source IN ('tiktok_api','verified_recording','reported_threshold')),
  observed_at timestamp NOT NULL,
  submission_id text NOT NULL REFERENCES creator_submissions(id) ON DELETE CASCADE,
  measured_at timestamp,
  views bigint NOT NULL CHECK(views >= 0 AND views <= 9007199254740991),
  likes bigint CHECK(likes >= 0),
  comments bigint CHECK(comments >= 0),
  shares bigint CHECK(shares >= 0),
  PRIMARY KEY(post_key,source,observed_at)
);
CREATE INDEX creator_video_observations_submission_idx ON creator_video_observations(submission_id,observed_at);
--> statement-breakpoint
CREATE TABLE creator_video_sync_state (
  account_id text PRIMARY KEY REFERENCES creator_social_accounts(id) ON DELETE CASCADE,
  status text NOT NULL,
  cursor integer NOT NULL DEFAULT 0 CHECK(cursor >= 0),
  checked_at timestamp NOT NULL,
  synced_at timestamp,
  next_attempt_at timestamp NOT NULL
);
