ALTER TYPE creator_attribution_event_type ADD VALUE IF NOT EXISTS 'claim';
--> statement-breakpoint
ALTER TABLE creator_submissions ADD COLUMN IF NOT EXISTS is_draft boolean NOT NULL DEFAULT false;
ALTER TABLE creator_tracking_link_aliases ADD COLUMN IF NOT EXISTS submission_id text REFERENCES creator_submissions(id) ON DELETE CASCADE;
ALTER TABLE creator_attribution_clicks ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'browser';
ALTER TABLE creator_attribution_clicks ADD COLUMN IF NOT EXISTS placement text;
ALTER TABLE creator_attribution_clicks ADD COLUMN IF NOT EXISTS submission_id text REFERENCES creator_submissions(id) ON DELETE SET NULL;
ALTER TABLE mobile_creator_attributions ADD COLUMN IF NOT EXISTS method text NOT NULL DEFAULT 'direct';
ALTER TABLE subscription_events ADD COLUMN IF NOT EXISTS creator_attribution_status text NOT NULL DEFAULT 'pending';
ALTER TABLE subscription_events ADD COLUMN IF NOT EXISTS creator_attribution_checked_at timestamp;
CREATE TABLE IF NOT EXISTS creator_referral_handoffs (
  token_hash text PRIMARY KEY,
  verifier_hash text NOT NULL,
  click_id text NOT NULL REFERENCES creator_attribution_clicks(id) ON DELETE CASCADE,
  expires_at timestamp NOT NULL,
  consumed_at timestamp,
  consumed_by_install_id text,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS creator_referral_handoffs_expiry_idx ON creator_referral_handoffs(expires_at);
CREATE INDEX IF NOT EXISTS creator_attribution_clicks_submission_idx ON creator_attribution_clicks(submission_id);
CREATE INDEX IF NOT EXISTS creator_attribution_events_billing_idx ON creator_attribution_events((metadata->>'billingEventId')) WHERE metadata->>'billingEventId' IS NOT NULL;
CREATE INDEX IF NOT EXISTS subscription_events_creator_pending_idx ON subscription_events(creator_attribution_checked_at, occurred_at) WHERE environment = 'production' AND creator_attribution_status <> 'allocated';
