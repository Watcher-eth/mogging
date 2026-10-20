CREATE TABLE "mobile_guests" (
  "user_id" text PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "claimed_by_user_id" text REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "mobile_guest_keys" (
  "key_hash" text PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "mobile_guests"("user_id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE "mobile_guest_purchases" (
  "original_transaction_id" text NOT NULL,
  "environment" text NOT NULL,
  "user_id" text NOT NULL REFERENCES "mobile_guests"("user_id") ON DELETE CASCADE,
  PRIMARY KEY ("original_transaction_id", "environment")
);
