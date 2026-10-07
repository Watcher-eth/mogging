-- Raise the minimum only for campaigns with the exact old A/B/C/D ladder.
-- Historical submission snapshots and already approved earnings are unchanged.
UPDATE creator_sprints AS campaign
SET terms = jsonb_set(
  jsonb_set(campaign.terms, '{minimumTier1Percent}', '10'::jsonb),
  '{milestones}', (
    SELECT jsonb_agg(
      jsonb_set(milestone, '{audienceRates,0,audiencePercent}', '10'::jsonb)
      ORDER BY position
    )
    FROM jsonb_array_elements(campaign.terms->'milestones')
      WITH ORDINALITY AS milestones(milestone, position)
  )
), updated_at = now()
WHERE campaign.status IN ('draft', 'published')
  AND campaign.terms->'minimumTier1Percent' = '0'::jsonb
  AND campaign.terms->'maximumTier1Percent' = '40'::jsonb
  AND jsonb_array_length(campaign.terms->'milestones') > 0
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(campaign.terms->'milestones') AS milestone
    WHERE milestone->'audienceRates' IS DISTINCT FROM jsonb_build_array(
      jsonb_build_object('audiencePercent', 0, 'amountCents', round((milestone->>'amountCents')::numeric * 0.20)),
      jsonb_build_object('audiencePercent', 15, 'amountCents', round((milestone->>'amountCents')::numeric * 0.40)),
      jsonb_build_object('audiencePercent', 22.5, 'amountCents', round((milestone->>'amountCents')::numeric * 0.65)),
      jsonb_build_object('audiencePercent', 30, 'amountCents', (milestone->>'amountCents')::numeric),
      jsonb_build_object('audiencePercent', 40, 'amountCents', (milestone->>'amountCents')::numeric)
    )
  );
