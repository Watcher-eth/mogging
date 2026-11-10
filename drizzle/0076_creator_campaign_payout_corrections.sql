ALTER TABLE creator_submissions ADD COLUMN campaign_payout_corrected boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE creator_payout_requests DROP CONSTRAINT creator_payout_requests_status_check;
--> statement-breakpoint
ALTER TABLE creator_payout_requests ADD CONSTRAINT creator_payout_requests_status_check CHECK (status IN ('pending', 'paid', 'cancelled'));
