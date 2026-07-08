ALTER TABLE "payment_entitlements" ADD COLUMN IF NOT EXISTS "activation_code_hash" text;
--> statement-breakpoint
ALTER TABLE "payment_entitlements" ADD COLUMN IF NOT EXISTS "activation_code_last4" text;
--> statement-breakpoint
ALTER TABLE "payment_entitlements" ADD COLUMN IF NOT EXISTS "activation_code_redeemed_at" timestamp;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_entitlements_activation_code_hash_idx" ON "payment_entitlements" USING btree ("activation_code_hash");
