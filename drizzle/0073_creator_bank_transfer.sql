ALTER TYPE creator_payment_option ADD VALUE IF NOT EXISTS 'bank_transfer';
--> statement-breakpoint
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS bank_transfer_details text;
