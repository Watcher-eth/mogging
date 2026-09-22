CREATE TABLE "push_devices" (
  "install_id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token" text NOT NULL UNIQUE,
  "environment" text NOT NULL,
  "timezone" text NOT NULL,
  "session_expires_at" timestamptz NOT NULL,
  "protocol_days" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "push_devices_user_idx" ON "push_devices" ("user_id");
--> statement-breakpoint
CREATE TABLE "push_deliveries" (
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "slot" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY ("user_id", "kind", "slot")
);
