CREATE TABLE creator_campaign_display_adjustments (
  sprint_id text PRIMARY KEY REFERENCES creator_sprints(id) ON DELETE CASCADE,
  used_budget_cents integer NOT NULL CHECK (used_budget_cents >= 0),
  approved_submissions integer NOT NULL CHECK (approved_submissions >= 0)
);
