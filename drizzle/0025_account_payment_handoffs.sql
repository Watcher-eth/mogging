CREATE TABLE IF NOT EXISTS "payment_handoffs" (
	"id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" text NOT NULL,
	"stripe_checkout_session_id" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"consumed_at" timestamp,
	"consumed_by_install_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payment_handoffs" ADD CONSTRAINT "payment_handoffs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_handoffs_token_hash_unique" ON "payment_handoffs" USING btree ("token_hash");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_handoffs_checkout_session_unique" ON "payment_handoffs" USING btree ("stripe_checkout_session_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_handoffs_user_id_idx" ON "payment_handoffs" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_handoffs_expires_at_idx" ON "payment_handoffs" USING btree ("expires_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "analytics_events" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"event_name" text NOT NULL,
	"account_id" text,
	"mobile_install_id" text,
	"anonymous_id" text,
	"session_id" text,
	"platform" text NOT NULL,
	"source" text,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp NOT NULL,
	"received_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_account_id_users_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "analytics_events_event_id_unique" ON "analytics_events" USING btree ("event_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_events_account_id_idx" ON "analytics_events" USING btree ("account_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_events_name_occurred_at_idx" ON "analytics_events" USING btree ("event_name","occurred_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_events_mobile_install_id_idx" ON "analytics_events" USING btree ("mobile_install_id");
