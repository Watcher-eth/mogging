-- Preserve earned money in its original budget when a post moves for rereview.
CREATE TABLE creator_campaign_transfers (
  submission_id text PRIMARY KEY REFERENCES creator_submissions(id),
  from_sprint_id text NOT NULL REFERENCES creator_sprints(id),
  to_sprint_id text NOT NULL REFERENCES creator_sprints(id),
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  reason text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  CHECK (from_sprint_id <> to_sprint_id)
);
--> statement-breakpoint
CREATE INDEX creator_campaign_transfers_from_idx ON creator_campaign_transfers(from_sprint_id);
--> statement-breakpoint
CREATE INDEX creator_campaign_transfers_to_idx ON creator_campaign_transfers(to_sprint_id);
