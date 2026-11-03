CREATE TABLE creator_private_studio_workspaces (
  id text PRIMARY KEY,
  creator_profile_id text NOT NULL UNIQUE REFERENCES creator_profiles(id) ON DELETE CASCADE
);
--> statement-breakpoint
DO $$
DECLARE owner_id text; matches integer;
BEGIN
  SELECT count(*),min(p.id) INTO matches,owner_id FROM creator_profiles p
  WHERE p.auth_status <> 'suspended' AND (
    lower(ltrim(p.social_handle,'@'))='rizzlord.ratings' OR EXISTS (
      SELECT 1 FROM creator_social_accounts a WHERE a.creator_profile_id=p.id AND lower(ltrim(a.handle,'@'))='rizzlord.ratings'
    )
  );
  IF matches <> 1 THEN RAISE EXCEPTION 'Private Studio requires exactly one existing rizzlord.ratings creator'; END IF;
  INSERT INTO creator_private_studio_workspaces(id,creator_profile_id) VALUES ('rizzlord',owner_id);
END $$;
--> statement-breakpoint
CREATE TABLE creator_private_characters (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES creator_private_studio_workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  title text NOT NULL DEFAULT '',
  avatar text NOT NULL,
  status text NOT NULL CHECK(status IN ('writing','draft','speaking','ready','failed')),
  payload jsonb NOT NULL,
  quota_day date,
  created_at timestamp NOT NULL DEFAULT (now() AT TIME ZONE 'UTC'),
  updated_at timestamp NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')
);
CREATE INDEX creator_private_characters_workspace_idx ON creator_private_characters(workspace_id,created_at);
