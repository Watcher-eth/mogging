ALTER TABLE creator_sprints ADD COLUMN budget_pool_id text REFERENCES creator_sprints(id);
--> statement-breakpoint
ALTER TABLE creator_sprints ADD CONSTRAINT creator_budget_pool_not_self CHECK (budget_pool_id IS NULL OR budget_pool_id <> id);
--> statement-breakpoint
CREATE INDEX creator_sprints_budget_pool_idx ON creator_sprints(budget_pool_id);
--> statement-breakpoint
-- Mirror sprintPayoutCents for pending requests, including saved audience tiers.
CREATE FUNCTION creator_campaign_expected_payout(terms jsonb, views integer, audience real)
RETURNS integer LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE milestone jsonb; rate jsonb;
BEGIN
  IF terms IS NULL OR views IS NULL OR views < 0 OR audience IS NULL
    OR audience < (terms->>'minimumTier1Percent')::numeric OR audience > 100 THEN RETURN 0; END IF;
  SELECT item INTO milestone FROM jsonb_array_elements(coalesce(terms->'milestones', '[]'::jsonb)) WITH ORDINALITY AS m(item, ord)
    WHERE (item->>'views')::bigint <= views ORDER BY ord DESC LIMIT 1;
  IF milestone IS NULL THEN RETURN 0; END IF;
  IF jsonb_typeof(milestone->'audienceRates') = 'array' THEN
    SELECT item INTO rate FROM jsonb_array_elements(milestone->'audienceRates') WITH ORDINALITY AS r(item, ord)
      WHERE (item->>'audiencePercent')::numeric <= audience ORDER BY ord DESC LIMIT 1;
    RETURN coalesce((rate->>'amountCents')::integer, 0);
  END IF;
  RETURN round((milestone->>'amountCents')::numeric * least(audience::numeric / (terms->>'maximumTier1Percent')::numeric, 1))::integer;
END $$;
--> statement-breakpoint
-- Link MGC to its original campaign without rewriting money or submissions.
UPDATE creator_sprints variant SET budget_pool_id = source.id, updated_at = now()
FROM creator_sprints source
WHERE variant.terms->>'mgcSourceCampaignId' = source.id AND variant.id <> source.id AND source.budget_pool_id IS NULL;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_creator_bonus_budget() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE budget bigint; committed bigint; pool_id text;
BEGIN
  IF TG_TABLE_NAME = 'creator_sprints' THEN
    pool_id := coalesce(NEW.budget_pool_id, NEW.id);
    SELECT coalesce(sum(p.amount_cents), 0) INTO committed FROM creator_payments p JOIN creator_sprints c ON c.id = p.bonus_sprint_id WHERE coalesce(c.budget_pool_id, c.id) = pool_id AND p.status <> 'cancelled';
    IF NEW.budget_pool_id IS NULL THEN budget := coalesce((NEW.terms->>'bonusBudgetCents')::bigint, 0);
    ELSE SELECT coalesce((terms->>'bonusBudgetCents')::bigint, 0) INTO budget FROM creator_sprints WHERE id = pool_id FOR UPDATE; END IF;
    IF committed > budget THEN
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
  SELECT coalesce(budget_pool_id, id) INTO pool_id FROM creator_sprints WHERE id = NEW.bonus_sprint_id;
  SELECT coalesce((terms->>'bonusBudgetCents')::bigint, 0) INTO budget FROM creator_sprints WHERE id = pool_id FOR UPDATE;
  SELECT coalesce(sum(p.amount_cents), 0) INTO committed FROM creator_payments p JOIN creator_sprints c ON c.id = p.bonus_sprint_id WHERE coalesce(c.budget_pool_id, c.id) = pool_id AND p.id <> NEW.id AND p.status <> 'cancelled';
  IF committed + NEW.amount_cents > budget THEN
    RAISE EXCEPTION 'Campaign bonus budget is fully committed' USING ERRCODE = '23514', CONSTRAINT = 'creator_bonus_budget_limit';
  END IF;
  RETURN NEW;
END $$;
