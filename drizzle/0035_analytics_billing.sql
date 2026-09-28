CREATE TABLE billing_webhook_receipts (
  id text PRIMARY KEY, lease_id text, leased_at timestamp, processed_at timestamp,
  received_at timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE subscription_events (
  id text PRIMARY KEY, provider text NOT NULL, provider_event_id text NOT NULL,
  provider_type text NOT NULL, environment text NOT NULL, event_name text NOT NULL,
  external_user_id text, account_id text REFERENCES users(id) ON DELETE SET NULL,
  subscription_id text, transaction_id text, product_id text, amount numeric(20,6), currency text,
  properties jsonb NOT NULL DEFAULT '{}', occurred_at timestamp NOT NULL,
  received_at timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX subscription_events_provider_event_unique ON subscription_events(provider, provider_event_id);
CREATE INDEX subscription_events_account_time_idx ON subscription_events(account_id, occurred_at);
CREATE INDEX subscription_events_subscription_time_idx ON subscription_events(provider, subscription_id, occurred_at);
CREATE INDEX subscription_events_event_time_idx ON subscription_events(environment, event_name, occurred_at);
CREATE INDEX subscription_events_external_user_idx ON subscription_events(provider, external_user_id);
CREATE INDEX subscription_events_transaction_idx ON subscription_events(provider, transaction_id);
CREATE INDEX subscription_events_environment_time_idx ON subscription_events(environment, occurred_at);
--> statement-breakpoint
ALTER TABLE analytics_events ADD COLUMN schema_version integer NOT NULL DEFAULT 1,
  ADD COLUMN environment text NOT NULL DEFAULT 'production', ADD COLUMN app_version text,
  ADD COLUMN exported_at timestamp;
CREATE INDEX analytics_events_pending_export_idx ON analytics_events(received_at) WHERE exported_at IS NULL;
CREATE INDEX analytics_events_environment_time_idx ON analytics_events(environment, occurred_at);
--> statement-breakpoint
ALTER TABLE subscription_events ADD COLUMN exported_at timestamp;
CREATE INDEX subscription_events_pending_export_idx ON subscription_events(received_at) WHERE exported_at IS NULL;
CREATE TABLE analytics_identity_links (
  account_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  anonymous_id text NOT NULL, platform text NOT NULL, linked_at timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY(account_id, anonymous_id)
);
