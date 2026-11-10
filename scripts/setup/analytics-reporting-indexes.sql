\set ON_ERROR_STOP on
SET lock_timeout = '2s';
SET statement_timeout = '15min';

CREATE INDEX CONCURRENTLY IF NOT EXISTS analytics_events_reporting_time_brin
  ON analytics_events USING brin(occurred_at) WITH (autosummarize = on);
CREATE INDEX CONCURRENTLY IF NOT EXISTS analytics_events_reporting_identity_idx
  ON analytics_events(account_id, mobile_install_id, anonymous_id) WHERE account_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS analytics_events_reporting_sandbox_session_idx
  ON analytics_events(session_id) WHERE session_id IS NOT NULL
    AND (properties->>'runtime_environment' = 'sandbox' OR properties->>'store_environment' = 'sandbox');
CREATE INDEX CONCURRENTLY IF NOT EXISTS analytics_events_reporting_session_tx_idx
  ON analytics_events((properties->>'transaction_id')) INCLUDE (session_id)
  WHERE session_id IS NOT NULL AND properties->>'transaction_id' IS NOT NULL;

SELECT indexrelid::regclass AS reporting_index, indisvalid AS valid
FROM pg_index WHERE indrelid = 'analytics_events'::regclass
  AND indexrelid::regclass::text LIKE 'analytics_events_reporting_%';

-- A cancelled concurrent build can leave an invalid index behind.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indrelid = 'analytics_events'::regclass
    AND indexrelid::regclass::text LIKE 'analytics_events_reporting_%' AND NOT indisvalid)
  THEN RAISE EXCEPTION 'Drop invalid reporting indexes concurrently and rerun this script';
  END IF;
END
$$;
