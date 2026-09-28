-- Read-only starter queries for Metabase. UTC; production only. Never sum currencies.
-- These are explicit measurement definitions, not a financial accounting system.

-- 1. Daily acquisition and product milestones (unique installs/browsers, not taps).
SELECT date_trunc('day', occurred_at) AS day, platform, event_name,
  coalesce(properties->>'creator_tracking_link_id', properties->>'first_utm_source', 'unknown') AS acquisition,
  count(DISTINCT coalesce(mobile_install_id, anonymous_id, account_id)) AS actors
FROM analytics_events
WHERE environment = 'production' AND occurred_at >= now() - interval '30 days'
GROUP BY 1,2,3,4 ORDER BY 1 DESC,2,3;

-- 2. Onboarding step completion. Scope to a fixed cohort/time range for experiment comparisons.
SELECT properties->>'step' AS step,
  count(DISTINCT properties->>'flow_id') FILTER (WHERE event_name = 'onboarding_step_viewed') AS viewed_flows,
  count(DISTINCT properties->>'flow_id') FILTER (WHERE event_name = 'onboarding_step_completed') AS completed_flows,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY (properties->>'duration_ms')::numeric)
    FILTER (WHERE event_name = 'onboarding_step_completed') AS median_completion_ms
FROM analytics_events
WHERE environment = 'production' AND occurred_at >= now() - interval '30 days'
  AND event_name IN ('onboarding_step_viewed','onboarding_step_completed')
GROUP BY 1;

-- 3. Billing lifecycle + gross cash movements. Refunds are negative. Amount NULL means unavailable.
SELECT date_trunc('day', occurred_at) AS day, provider, event_name, currency,
  count(*) AS events, count(DISTINCT coalesce(account_id, external_user_id)) AS customers,
  sum(amount) AS gross_currency_units, count(*) FILTER (WHERE amount IS NULL) AS missing_amount
FROM subscription_events WHERE environment = 'production'
  AND occurred_at >= now() - interval '90 days'
GROUP BY 1,2,3,4 ORDER BY 1 DESC;

-- 4. Cancellation timing relative to first evaluation (intent, not actual churn).
WITH activation AS (
  SELECT account_id, min(occurred_at) AS activated_at FROM analytics_events
  WHERE environment = 'production' AND event_name = 'evaluation_completed' AND account_id IS NOT NULL GROUP BY 1
), cancellations AS (
  SELECT account_id, min(occurred_at) AS cancelled_at FROM subscription_events
  WHERE environment = 'production' AND event_name = 'cancellation_scheduled' AND account_id IS NOT NULL GROUP BY 1
)
SELECT CASE WHEN activated_at IS NULL THEN 'no recorded evaluation'
  WHEN cancelled_at < activated_at THEN 'before first evaluation'
  WHEN cancelled_at < activated_at + interval '1 day' THEN 'within 24h of first evaluation'
  WHEN cancelled_at < activated_at + interval '7 days' THEN 'within 7d of first evaluation'
  ELSE 'later' END AS timing, count(*) AS customers
FROM cancellations LEFT JOIN activation USING(account_id) GROUP BY 1;

-- 5. D7 meaningful retention, only cohorts with a full observation window.
WITH activated AS (
  SELECT account_id, min(occurred_at) AS at FROM analytics_events
  WHERE environment = 'production' AND event_name = 'evaluation_completed' AND account_id IS NOT NULL GROUP BY 1
), observed AS (
  SELECT a.*, EXISTS (SELECT 1 FROM analytics_events e WHERE e.account_id = a.account_id
    AND e.environment = 'production' AND e.event_name IN ('report_viewed','protocol_task_completed','evaluation_completed')
    AND e.occurred_at >= a.at + interval '7 days' AND e.occurred_at < a.at + interval '8 days') AS retained
  FROM activated a WHERE a.at < now() - interval '8 days'
)
SELECT date_trunc('week', at) AS cohort, count(*) AS activated_accounts,
  count(*) FILTER (WHERE retained) AS retained_accounts, avg(retained::int) AS d7_retention
FROM observed GROUP BY 1 ORDER BY 1;

-- 6. Processing and export health. Expose through authenticated /api/admin/analytics-health.
SELECT provider, environment, count(*) FILTER (WHERE exported_at IS NULL) AS pending,
  min(received_at) FILTER (WHERE exported_at IS NULL) AS oldest_pending,
  max(received_at) AS newest_received FROM subscription_events GROUP BY 1,2;
