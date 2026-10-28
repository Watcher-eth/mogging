ALTER TABLE creator_sprints ADD COLUMN audience jsonb NOT NULL DEFAULT '{"mode":"all","creatorIds":[]}'::jsonb;
--> statement-breakpoint
ALTER TABLE creator_sprints ADD CONSTRAINT creator_campaign_audience_shape CHECK (
  jsonb_typeof(audience) = 'object'
  AND audience ? 'mode' AND audience ? 'creatorIds'
  AND audience->>'mode' IN ('all', 'selected', 'except')
  AND jsonb_typeof(audience->'creatorIds') = 'array'
);
