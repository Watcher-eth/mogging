CREATE TABLE creator_referral_links (
  creator_profile_id text PRIMARY KEY REFERENCES creator_profiles(id),
  code text NOT NULL UNIQUE,
  created_at timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE creator_referrals (
  invitee_id text PRIMARY KEY REFERENCES creator_profiles(id),
  inviter_id text NOT NULL REFERENCES creator_profiles(id),
  blocked_reason text,
  checked_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT creator_referrals_not_self CHECK (invitee_id <> inviter_id)
);
CREATE INDEX creator_referrals_inviter_idx ON creator_referrals(inviter_id);
--> statement-breakpoint
CREATE TABLE creator_referral_awards (
  id text PRIMARY KEY,
  invitee_id text NOT NULL REFERENCES creator_referrals(invitee_id),
  submission_id text NOT NULL UNIQUE REFERENCES creator_submissions(id),
  slot integer NOT NULL CHECK (slot BETWEEN 1 AND 5),
  issued_cents integer NOT NULL DEFAULT 0,
  paid_basis_cents integer NOT NULL DEFAULT 0,
  approved_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT creator_referral_awards_slot_unique UNIQUE(invitee_id, slot),
  CONSTRAINT creator_referral_awards_nonnegative CHECK (issued_cents >= 0 AND paid_basis_cents >= 0)
);
--> statement-breakpoint
ALTER TABLE creator_payments ADD COLUMN creator_referral_award_id text REFERENCES creator_referral_awards(id);
ALTER TABLE creator_payments DROP CONSTRAINT creator_payments_bonus_shape;
ALTER TABLE creator_payments ADD CONSTRAINT creator_payments_bonus_shape CHECK (
  (bonus_sprint_id IS NULL AND bonus_key IS NULL AND bonus_note IS NULL AND creator_referral_award_id IS NULL)
  OR (creator_referral_award_id IS NOT NULL AND bonus_sprint_id IS NULL AND bonus_key IS NULL AND bonus_note IS NOT NULL AND submission_id IS NULL AND currency = 'USD' AND amount_cents > 0)
  OR (creator_referral_award_id IS NULL AND bonus_sprint_id IS NOT NULL AND bonus_key IS NOT NULL AND bonus_note IS NOT NULL AND submission_id IS NULL AND currency = 'USD' AND amount_cents > 0)
);
CREATE INDEX creator_payments_referral_award_idx ON creator_payments(creator_referral_award_id);
