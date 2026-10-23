ALTER TABLE creator_profiles ADD COLUMN bonus_checked_at timestamp;
--> statement-breakpoint
ALTER TABLE creator_submissions ADD COLUMN exclusivity_confirmed boolean NOT NULL DEFAULT false, ADD COLUMN bonus_placement jsonb;
--> statement-breakpoint
ALTER TABLE creator_payments ADD COLUMN bonus_sprint_id text REFERENCES creator_sprints(id), ADD COLUMN bonus_key text, ADD COLUMN bonus_note text;
--> statement-breakpoint
CREATE UNIQUE INDEX creator_payments_bonus_identity_unique ON creator_payments(creator_profile_id, bonus_sprint_id, bonus_key);
--> statement-breakpoint
ALTER TABLE creator_payments ADD CONSTRAINT creator_payments_bonus_shape CHECK (
  (bonus_sprint_id IS NULL AND bonus_key IS NULL AND bonus_note IS NULL)
  OR (bonus_sprint_id IS NOT NULL AND bonus_key IS NOT NULL AND bonus_note IS NOT NULL AND submission_id IS NULL AND currency = 'USD' AND amount_cents > 0)
);
--> statement-breakpoint
CREATE FUNCTION guard_creator_bonus_budget() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE budget bigint; committed bigint;
BEGIN
  IF TG_TABLE_NAME = 'creator_sprints' THEN
    SELECT coalesce(sum(amount_cents), 0) INTO committed FROM creator_payments WHERE bonus_sprint_id = NEW.id AND status <> 'cancelled';
    IF committed > coalesce((NEW.terms->>'bonusBudgetCents')::bigint, 0) THEN
      RAISE EXCEPTION 'Bonus budget cannot be below committed earnings' USING ERRCODE = '23514', CONSTRAINT = 'creator_bonus_budget_limit';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.bonus_sprint_id IS NOT NULL AND
    (NEW.creator_profile_id, NEW.bonus_sprint_id, NEW.bonus_key, NEW.amount_cents, NEW.currency) IS DISTINCT FROM
    (OLD.creator_profile_id, OLD.bonus_sprint_id, OLD.bonus_key, OLD.amount_cents, OLD.currency) THEN
    RAISE EXCEPTION 'Bonus award identity and amount cannot be changed' USING ERRCODE = '23514', CONSTRAINT = 'creator_bonus_award_immutable';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.bonus_sprint_id IS NOT NULL AND OLD.status = 'paid' AND NEW.status <> 'paid' THEN
    RAISE EXCEPTION 'Completed bonus payments cannot be changed' USING ERRCODE = '23514', CONSTRAINT = 'creator_bonus_award_immutable';
  END IF;
  IF NEW.bonus_sprint_id IS NULL OR NEW.status = 'cancelled' THEN RETURN NEW; END IF;
  SELECT coalesce((terms->>'bonusBudgetCents')::bigint, 0) INTO budget FROM creator_sprints WHERE id = NEW.bonus_sprint_id FOR UPDATE;
  SELECT coalesce(sum(amount_cents), 0) INTO committed FROM creator_payments WHERE bonus_sprint_id = NEW.bonus_sprint_id AND id <> NEW.id AND status <> 'cancelled';
  IF committed + NEW.amount_cents > budget THEN
    RAISE EXCEPTION 'Campaign bonus budget is fully committed' USING ERRCODE = '23514', CONSTRAINT = 'creator_bonus_budget_limit';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER creator_bonus_budget_payment BEFORE INSERT OR UPDATE ON creator_payments FOR EACH ROW EXECUTE FUNCTION guard_creator_bonus_budget();
--> statement-breakpoint
CREATE TRIGGER creator_bonus_budget_campaign BEFORE UPDATE OF terms ON creator_sprints FOR EACH ROW EXECUTE FUNCTION guard_creator_bonus_budget();
