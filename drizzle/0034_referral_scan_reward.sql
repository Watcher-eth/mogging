CREATE TABLE "referral_signups" (
  "referred_user_id" text PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "inviter_user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "referral_signups_not_self" CHECK ("referred_user_id" <> "inviter_user_id")
);
CREATE INDEX "referral_signups_inviter_idx" ON "referral_signups" ("inviter_user_id");
