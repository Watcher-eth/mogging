ALTER TABLE payment_entitlements ADD COLUMN current_period_start timestamp;
ALTER TABLE payment_entitlements ADD COLUMN credit_expires_at timestamp;
--> statement-breakpoint
-- Historical Stripe purchases have a checkout creation date. RevenueCat purchase
-- dates must be reconciled from the provider before these credits can be spent.
UPDATE payment_entitlements SET credit_expires_at = created_at + interval '6 months'
WHERE product IN ('evaluation', 'evaluation_pack_3') AND coalesce(source, '') NOT IN ('revenuecat', 'admin_invite_code', 'admin_referral_code');
UPDATE payment_entitlements SET credit_expires_at = timestamp '1970-01-01'
WHERE product IN ('evaluation', 'evaluation_pack_3') AND source = 'revenuecat';
--> statement-breakpoint
CREATE TABLE scan_reservations (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entitlement_id text NOT NULL REFERENCES payment_entitlements(id),
  request_hash text NOT NULL,
  result jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'complete', 'failed')),
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX scan_reservations_user_status_created_idx ON scan_reservations (user_id, status, created_at);
ALTER TABLE payment_entitlements ADD CONSTRAINT payment_credit_balance_nonnegative CHECK (credit_balance >= 0);

--> statement-breakpoint
-- Keep transaction ownership tombstones after account deletion so a restore
-- cannot mint the same purchase again under a new account.
ALTER TABLE payment_entitlements DROP CONSTRAINT payment_entitlements_user_id_users_id_fk;
ALTER TABLE payment_entitlements ADD CONSTRAINT payment_entitlements_user_id_users_id_fk
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

--> statement-breakpoint
-- Current-period reports generated before enforcement already used an allowance.
ALTER TABLE users ADD COLUMN scan_credit_policy_started_at timestamp NOT NULL DEFAULT (now() AT TIME ZONE 'UTC');
