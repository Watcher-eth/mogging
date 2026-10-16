ALTER TABLE users ADD COLUMN IF NOT EXISTS analytics_internal boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS users_analytics_internal_idx ON users(id) WHERE analytics_internal;
