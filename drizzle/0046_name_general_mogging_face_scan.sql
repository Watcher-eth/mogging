-- Rename the current campaign format without changing its ID or historical
-- submission snapshots and review decisions.
UPDATE creator_sprints AS campaign
SET terms = jsonb_set(campaign.terms, '{formats}', (
  SELECT jsonb_agg(
    CASE WHEN format->>'id' = 'general-creator-video-v1'
               AND format->>'name' = 'General Creator Content'
      THEN jsonb_set(format, '{name}', '"General Mogging Face Scan"'::jsonb)
      ELSE format
    END ORDER BY position
  )
  FROM jsonb_array_elements(campaign.terms->'formats') WITH ORDINALITY AS formats(format, position)
)), updated_at = now()
WHERE EXISTS (
  SELECT 1 FROM jsonb_array_elements(campaign.terms->'formats') AS format
  WHERE format->>'id' = 'general-creator-video-v1'
    AND format->>'name' = 'General Creator Content'
);
