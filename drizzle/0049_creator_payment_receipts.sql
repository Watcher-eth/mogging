CREATE TABLE IF NOT EXISTS creator_payment_receipts (
  payment_id text PRIMARY KEY REFERENCES creator_payments(id) ON DELETE CASCADE,
  image text NOT NULL
);
