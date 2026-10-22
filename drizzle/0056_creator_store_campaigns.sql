CREATE TABLE IF NOT EXISTS creator_store_campaign_metrics (
  campaign text NOT NULL,
  day text NOT NULL,
  territory text NOT NULL DEFAULT 'ALL',
  tracking_link_id text REFERENCES creator_tracking_links(id) ON DELETE SET NULL,
  downloads integer,
  sales numeric(20,6),
  currency text NOT NULL DEFAULT 'UNK',
  source_hash text NOT NULL,
  imported_at timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign, day, territory, currency)
);
