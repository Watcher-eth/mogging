CREATE TABLE analytics_reporting_hours (
  hour timestamp PRIMARY KEY,
  revision integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE analytics_reporting_changes (
  hour timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX analytics_reporting_changes_hour_idx ON analytics_reporting_changes(hour);
--> statement-breakpoint
CREATE TABLE analytics_reporting_facts (
  hour timestamp NOT NULL,
  model text NOT NULL,
  event_name text NOT NULL,
  occurred_at timestamp NOT NULL,
  platform text NOT NULL,
  environment text NOT NULL,
  source text,
  account_id text,
  mobile_install_id text,
  anonymous_id text,
  session_id text,
  properties jsonb NOT NULL,
  event_count bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX analytics_reporting_facts_hour_model_idx ON analytics_reporting_facts(hour, model);
--> statement-breakpoint
CREATE FUNCTION analytics_mark_reporting_changes() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    TRUNCATE analytics_reporting_hours, analytics_reporting_facts, analytics_reporting_changes;
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    INSERT INTO analytics_reporting_changes(hour)
      SELECT DISTINCT date_trunc('hour', event.occurred_at)
      FROM old_events o FULL JOIN new_events n USING (id)
      CROSS JOIN LATERAL (VALUES (o.occurred_at, o.platform, o.source), (n.occurred_at, n.platform, n.source))
        AS event(occurred_at, platform, source)
      WHERE (o.event_name, o.occurred_at, o.platform, o.environment, o.source, o.account_id,
          o.mobile_install_id, o.anonymous_id, o.session_id, o.properties)
          IS DISTINCT FROM (n.event_name, n.occurred_at, n.platform, n.environment, n.source, n.account_id,
          n.mobile_install_id, n.anonymous_id, n.session_id, n.properties)
        AND event.occurred_at >= (now() AT TIME ZONE 'UTC')::date - 91
        AND (event.platform IN ('ios', 'android', 'web') OR (event.platform = 'server' AND event.source IS DISTINCT FROM 'backend'));
    RETURN NULL;
  END IF;
  IF TG_OP = 'DELETE' THEN
    INSERT INTO analytics_reporting_changes(hour)
      SELECT DISTINCT date_trunc('hour', o.occurred_at) FROM old_events o
      WHERE occurred_at >= (now() AT TIME ZONE 'UTC')::date - 91
        AND (platform IN ('ios', 'android', 'web') OR (platform = 'server' AND source IS DISTINCT FROM 'backend'));
  END IF;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO analytics_reporting_changes(hour)
      SELECT DISTINCT date_trunc('hour', n.occurred_at) FROM new_events n
      WHERE occurred_at >= (now() AT TIME ZONE 'UTC')::date - 91
        AND (platform IN ('ios', 'android', 'web') OR (platform = 'server' AND source IS DISTINCT FROM 'backend'));
  END IF;
  RETURN NULL;
END
$$;
--> statement-breakpoint
SET LOCAL lock_timeout = '1s';
--> statement-breakpoint
CREATE TRIGGER analytics_reporting_insert AFTER INSERT ON analytics_events
REFERENCING NEW TABLE AS new_events FOR EACH STATEMENT EXECUTE FUNCTION analytics_mark_reporting_changes();
--> statement-breakpoint
CREATE TRIGGER analytics_reporting_update AFTER UPDATE ON analytics_events
REFERENCING OLD TABLE AS old_events NEW TABLE AS new_events FOR EACH STATEMENT EXECUTE FUNCTION analytics_mark_reporting_changes();
--> statement-breakpoint
CREATE TRIGGER analytics_reporting_delete AFTER DELETE ON analytics_events
REFERENCING OLD TABLE AS old_events FOR EACH STATEMENT EXECUTE FUNCTION analytics_mark_reporting_changes();
--> statement-breakpoint
CREATE TRIGGER analytics_reporting_truncate AFTER TRUNCATE ON analytics_events
FOR EACH STATEMENT EXECUTE FUNCTION analytics_mark_reporting_changes();
