-- Remove publication deadlines from current campaign terms. Historical submission
-- snapshots remain intact so their indexed review decisions keep their meaning.
UPDATE creator_sprints AS campaign
SET terms = jsonb_set(
  jsonb_set(campaign.terms - 'submissionWindowHours', '{rules}', (
    SELECT coalesce(jsonb_agg(rule ORDER BY position), '[]'::jsonb)
    FROM jsonb_array_elements(campaign.terms->'rules') WITH ORDINALITY AS rules(rule, position)
    WHERE rule #>> '{}' NOT LIKE 'Submit within%'
  )), '{formats}', (
    SELECT coalesce(jsonb_agg(jsonb_set(format, '{requirements}', (
      SELECT coalesce(jsonb_agg(requirement ORDER BY requirement_position), '[]'::jsonb)
      FROM jsonb_array_elements(format->'requirements') WITH ORDINALITY AS requirements(requirement, requirement_position)
      WHERE requirement #>> '{}' NOT LIKE 'Submit within%'
    )) ORDER BY position), '[]'::jsonb)
    FROM jsonb_array_elements(campaign.terms->'formats') WITH ORDINALITY AS formats(format, position)
  )
), updated_at = now()
WHERE campaign.terms ? 'submissionWindowHours'
   OR campaign.terms::text LIKE '%Submit within%';
