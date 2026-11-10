CREATE TABLE creator_crypto_payout_batches (
  id text PRIMARY KEY,
  chain text NOT NULL CHECK (chain IN ('solana', 'base', 'ethereum')),
  sender text NOT NULL,
  admin_user_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('prepared', 'submitted', 'paid', 'failed', 'partial')),
  outputs jsonb NOT NULL,
  proof jsonb NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX creator_crypto_payout_one_active_chain ON creator_crypto_payout_batches (chain)
  WHERE status IN ('prepared', 'submitted');
--> statement-breakpoint
ALTER TABLE creator_payments ADD COLUMN crypto_batch_id text REFERENCES creator_crypto_payout_batches(id);
--> statement-breakpoint
CREATE INDEX creator_payments_crypto_batch_idx ON creator_payments(crypto_batch_id) WHERE crypto_batch_id IS NOT NULL;
--> statement-breakpoint
CREATE TABLE creator_crypto_payout_hashes (
  chain text NOT NULL,
  hash text NOT NULL,
  batch_id text NOT NULL REFERENCES creator_crypto_payout_batches(id),
  PRIMARY KEY (chain, hash)
);
--> statement-breakpoint
CREATE FUNCTION guard_creator_crypto_payout() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.crypto_batch_id IS NOT NULL
    AND current_setting('mogging.crypto_payout_write', true) IS DISTINCT FROM OLD.crypto_batch_id
  THEN
    IF TG_OP = 'DELETE' THEN
      IF OLD.status = 'processing' THEN
        RAISE EXCEPTION 'An on-chain payout is in progress' USING ERRCODE = '23514';
      END IF;
    ELSIF (NEW.crypto_batch_id, NEW.creator_profile_id, NEW.submission_id, NEW.payout_request_id,
           NEW.amount_cents, NEW.currency, NEW.payment_option, NEW.status, NEW.provider_reference, NEW.paid_at)
          IS DISTINCT FROM
          (OLD.crypto_batch_id, OLD.creator_profile_id, OLD.submission_id, OLD.payout_request_id,
           OLD.amount_cents, OLD.currency, OLD.payment_option, OLD.status, OLD.provider_reference, OLD.paid_at)
    THEN
      RAISE EXCEPTION 'This payment is managed by on-chain reconciliation' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER creator_crypto_payout_guard BEFORE UPDATE OR DELETE ON creator_payments
  FOR EACH ROW EXECUTE FUNCTION guard_creator_crypto_payout();

--> statement-breakpoint
CREATE FUNCTION guard_creator_crypto_reference() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE payout_hash text;
BEGIN
  IF NEW.payment_option <> 'crypto' OR NEW.provider_reference IS NULL OR NEW.status <> 'paid' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND
    (OLD.payment_option, OLD.provider_reference, OLD.status) IS NOT DISTINCT FROM
    (NEW.payment_option, NEW.provider_reference, NEW.status)
  THEN RETURN NEW; END IF;
  payout_hash := CASE WHEN NEW.provider_reference ~* '^0x[0-9a-f]{64}$'
    THEN lower(NEW.provider_reference) ELSE NEW.provider_reference END;
  PERFORM pg_advisory_xact_lock(hashtextextended('creator-crypto-ref:' || payout_hash, 0));
  IF EXISTS (SELECT 1 FROM creator_crypto_payout_hashes h
    WHERE h.hash = payout_hash AND h.batch_id IS DISTINCT FROM NEW.crypto_batch_id)
  THEN RAISE EXCEPTION 'Transaction hash belongs to a verified crypto payout' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER creator_crypto_reference_guard BEFORE INSERT OR UPDATE ON creator_payments
  FOR EACH ROW EXECUTE FUNCTION guard_creator_crypto_reference();
