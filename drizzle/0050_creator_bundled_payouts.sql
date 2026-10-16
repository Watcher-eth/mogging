ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS bundled_payouts boolean NOT NULL DEFAULT false;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS creator_payout_requests (
  id text PRIMARY KEY,
  creator_profile_id text NOT NULL REFERENCES creator_profiles(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  payment_option creator_payment_option NOT NULL,
  destination text NOT NULL,
  network text,
  requested_at timestamp NOT NULL DEFAULT now(),
  paid_at timestamp
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS creator_payout_requests_one_pending ON creator_payout_requests(creator_profile_id) WHERE status = 'pending';
--> statement-breakpoint
ALTER TABLE creator_payments ADD COLUMN IF NOT EXISTS payout_request_id text REFERENCES creator_payout_requests(id);
