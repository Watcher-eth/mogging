ALTER TABLE creator_sprints ADD COLUMN IF NOT EXISTS audience jsonb NOT NULL DEFAULT '{"mode":"all","creatorIds":[]}'::jsonb;
--> statement-breakpoint
ALTER TABLE creator_profiles ADD COLUMN video_studio_access boolean NOT NULL DEFAULT false;
--> statement-breakpoint
CREATE TABLE creator_studio_generations (
  id text PRIMARY KEY,
  creator_profile_id text NOT NULL REFERENCES creator_profiles(id) ON DELETE CASCADE,
  sprint_id text NOT NULL REFERENCES creator_sprints(id),
  sprint_terms jsonb NOT NULL,
  format_id text NOT NULL,
  person_id text NOT NULL,
  story_id text NOT NULL,
  content_hash text NOT NULL,
  composition jsonb NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX creator_studio_generations_creator_idx ON creator_studio_generations(creator_profile_id, created_at);
--> statement-breakpoint
ALTER TABLE creator_submissions ADD COLUMN studio_generation_id text REFERENCES creator_studio_generations(id);
CREATE INDEX creator_submissions_studio_generation_idx ON creator_submissions(studio_generation_id);
--> statement-breakpoint
CREATE FUNCTION protect_creator_studio_generation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Studio generation attribution is immutable'; END;
$$;
CREATE TRIGGER creator_studio_generation_immutable BEFORE UPDATE ON creator_studio_generations FOR EACH ROW EXECUTE FUNCTION protect_creator_studio_generation();
