CREATE TABLE IF NOT EXISTS "referral_links" (
  "user_id" text PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "code" text NOT NULL UNIQUE
);
