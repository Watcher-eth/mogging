CREATE TABLE IF NOT EXISTS billing_reconciliation_state (
  provider text PRIMARY KEY,
  state jsonb,
  lease_id text,
  lease_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
