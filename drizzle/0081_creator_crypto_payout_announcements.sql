CREATE TABLE creator_crypto_payout_announcements (
  channel_id text NOT NULL,
  creator_profile_id text NOT NULL REFERENCES creator_profiles(id) ON DELETE CASCADE,
  payout_day date NOT NULL,
  message_id text NOT NULL,
  amount_cents bigint NOT NULL,
  PRIMARY KEY (channel_id, creator_profile_id, payout_day)
);
