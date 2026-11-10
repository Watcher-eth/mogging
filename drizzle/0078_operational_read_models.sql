CREATE TABLE backend_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  environment text NOT NULL,
  occurred_at timestamp NOT NULL,
  properties jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX backend_events_reporting_idx ON backend_events(environment, event_name, occurred_at);
--> statement-breakpoint
CREATE INDEX backend_events_trace_idx ON backend_events((properties->>'trace_id'), occurred_at)
  WHERE environment = 'production' AND event_name = 'backend_request';
--> statement-breakpoint
CREATE TABLE navigation_memberships (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  checked_at timestamp NOT NULL,
  active boolean,
  expires_at timestamp
);
