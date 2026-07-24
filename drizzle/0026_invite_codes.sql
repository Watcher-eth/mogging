CREATE TABLE IF NOT EXISTS "invite_codes" (
  "id" text PRIMARY KEY NOT NULL,
  "code_hash" text NOT NULL,
  "code_last4" text NOT NULL,
  "label" text NOT NULL,
  "kind" text DEFAULT 'invite' NOT NULL,
  "attribution" text,
  "scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "max_redemptions" integer,
  "redemption_count" integer DEFAULT 0 NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "expires_at" timestamp,
  "created_by" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "invite_codes_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invite_code_redemptions" (
  "id" text PRIMARY KEY NOT NULL,
  "invite_code_id" text NOT NULL,
  "user_id" text,
  "mobile_install_id" text NOT NULL,
  "payment_entitlement_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "invite_code_redemptions_user_code_unique" UNIQUE("invite_code_id","user_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invite_code_redemptions" ADD CONSTRAINT "invite_code_redemptions_invite_code_id_invite_codes_id_fk" FOREIGN KEY ("invite_code_id") REFERENCES "invite_codes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invite_code_redemptions" ADD CONSTRAINT "invite_code_redemptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invite_code_redemptions" ADD CONSTRAINT "invite_code_redemptions_payment_entitlement_id_payment_entitlements_id_fk" FOREIGN KEY ("payment_entitlement_id") REFERENCES "payment_entitlements"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invite_codes_kind_idx" ON "invite_codes" USING btree ("kind");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invite_codes_active_idx" ON "invite_codes" USING btree ("active");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invite_codes_created_at_idx" ON "invite_codes" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invite_code_redemptions_invite_code_id_idx" ON "invite_code_redemptions" USING btree ("invite_code_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invite_code_redemptions_user_id_idx" ON "invite_code_redemptions" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invite_code_redemptions_mobile_install_id_idx" ON "invite_code_redemptions" USING btree ("mobile_install_id");
