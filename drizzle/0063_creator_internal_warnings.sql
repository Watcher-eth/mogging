CREATE TABLE creator_internal_warnings (
  id text PRIMARY KEY,
  creator_profile_id text NOT NULL REFERENCES creator_profiles(id) ON DELETE CASCADE,
  note text NOT NULL,
  created_by_email text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  resolved_at timestamp,
  resolved_by_email text
);
CREATE INDEX creator_internal_warnings_creator_status_idx ON creator_internal_warnings(creator_profile_id, resolved_at, created_at);
