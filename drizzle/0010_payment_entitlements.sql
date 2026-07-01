CREATE TABLE IF NOT EXISTS "payment_entitlements" (
  "id" text PRIMARY KEY NOT NULL,
  "mobile_install_id" text NOT NULL,
  "user_id" text,
  "anonymous_actor_id" text,
  "stripe_checkout_session_id" text NOT NULL,
  "stripe_customer_id" text,
  "stripe_subscription_id" text,
  "stripe_payment_intent_id" text,
  "product" text NOT NULL,
  "credit_balance" integer DEFAULT 0 NOT NULL,
  "subscription_status" text,
  "current_period_end" timestamp,
  "source" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "payment_entitlements_checkout_session_unique" UNIQUE("stripe_checkout_session_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payment_entitlements" ADD CONSTRAINT "payment_entitlements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_entitlements_mobile_install_id_idx" ON "payment_entitlements" USING btree ("mobile_install_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_entitlements_user_id_idx" ON "payment_entitlements" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_entitlements_anonymous_actor_id_idx" ON "payment_entitlements" USING btree ("anonymous_actor_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_entitlements_payment_intent_id_idx" ON "payment_entitlements" USING btree ("stripe_payment_intent_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stripe_webhook_events" (
  "id" text PRIMARY KEY NOT NULL,
  "type" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
