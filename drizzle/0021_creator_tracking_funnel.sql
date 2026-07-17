CREATE TYPE "public"."creator_attribution_event_type" AS ENUM('signup', 'install', 'checkout', 'payment', 'refund', 'dispute');--> statement-breakpoint
CREATE TABLE "creator_tracking_links" (
	"id" text PRIMARY KEY NOT NULL,
	"social_account_id" text NOT NULL,
	"slug" text NOT NULL,
	"public_url" text NOT NULL,
	"deep_link_base_url" text NOT NULL,
	"ios_app_store_url" text NOT NULL,
	"android_app_store_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "creator_attribution_clicks" (
	"id" text PRIMARY KEY NOT NULL,
	"tracking_link_id" text NOT NULL,
	"anonymous_actor_id" text,
	"referrer" text,
	"user_agent" text,
	"is_bot" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "creator_attribution_events" (
	"id" text PRIMARY KEY NOT NULL,
	"tracking_link_id" text NOT NULL,
	"click_id" text,
	"first_tracking_link_id" text,
	"first_click_id" text,
	"event_type" "creator_attribution_event_type" NOT NULL,
	"attribution_key" text NOT NULL,
	"user_id" text,
	"anonymous_actor_id" text,
	"mobile_install_id" text,
	"stripe_checkout_session_id" text,
	"stripe_subscription_id" text,
	"stripe_payment_intent_id" text,
	"amount_cents" integer DEFAULT 0 NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"dedupe_key" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "creator_tracking_links" ADD CONSTRAINT "creator_tracking_links_social_account_id_creator_social_accounts_id_fk" FOREIGN KEY ("social_account_id") REFERENCES "public"."creator_social_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_attribution_clicks" ADD CONSTRAINT "creator_attribution_clicks_tracking_link_id_creator_tracking_links_id_fk" FOREIGN KEY ("tracking_link_id") REFERENCES "public"."creator_tracking_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_attribution_events" ADD CONSTRAINT "creator_attribution_events_tracking_link_id_creator_tracking_links_id_fk" FOREIGN KEY ("tracking_link_id") REFERENCES "public"."creator_tracking_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_attribution_events" ADD CONSTRAINT "creator_attribution_events_click_id_creator_attribution_clicks_id_fk" FOREIGN KEY ("click_id") REFERENCES "public"."creator_attribution_clicks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_attribution_events" ADD CONSTRAINT "creator_attribution_events_first_tracking_link_id_creator_tracking_links_id_fk" FOREIGN KEY ("first_tracking_link_id") REFERENCES "public"."creator_tracking_links"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_attribution_events" ADD CONSTRAINT "creator_attribution_events_first_click_id_creator_attribution_clicks_id_fk" FOREIGN KEY ("first_click_id") REFERENCES "public"."creator_attribution_clicks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_attribution_events" ADD CONSTRAINT "creator_attribution_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "creator_tracking_links_social_account_unique" ON "creator_tracking_links" USING btree ("social_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "creator_tracking_links_slug_unique" ON "creator_tracking_links" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "creator_attribution_clicks_link_id_idx" ON "creator_attribution_clicks" USING btree ("tracking_link_id");--> statement-breakpoint
CREATE INDEX "creator_attribution_clicks_anonymous_actor_id_idx" ON "creator_attribution_clicks" USING btree ("anonymous_actor_id");--> statement-breakpoint
CREATE INDEX "creator_attribution_clicks_created_at_idx" ON "creator_attribution_clicks" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "creator_attribution_events_link_id_idx" ON "creator_attribution_events" USING btree ("tracking_link_id");--> statement-breakpoint
CREATE INDEX "creator_attribution_events_click_id_idx" ON "creator_attribution_events" USING btree ("click_id");--> statement-breakpoint
CREATE INDEX "creator_attribution_events_first_link_id_idx" ON "creator_attribution_events" USING btree ("first_tracking_link_id");--> statement-breakpoint
CREATE INDEX "creator_attribution_events_user_id_idx" ON "creator_attribution_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "creator_attribution_events_mobile_install_id_idx" ON "creator_attribution_events" USING btree ("mobile_install_id");--> statement-breakpoint
CREATE INDEX "creator_attribution_events_checkout_session_id_idx" ON "creator_attribution_events" USING btree ("stripe_checkout_session_id");--> statement-breakpoint
CREATE INDEX "creator_attribution_events_subscription_id_idx" ON "creator_attribution_events" USING btree ("stripe_subscription_id");--> statement-breakpoint
CREATE INDEX "creator_attribution_events_payment_intent_id_idx" ON "creator_attribution_events" USING btree ("stripe_payment_intent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "creator_attribution_events_dedupe_key_unique" ON "creator_attribution_events" USING btree ("dedupe_key");
--> statement-breakpoint
INSERT INTO "creator_tracking_links" ("id", "social_account_id", "slug", "public_url", "deep_link_base_url", "ios_app_store_url", "is_active")
SELECT
	gen_random_uuid()::text,
	account."id",
	account."platform"::text || '-' || account."handle" || '-' || left(account."id", 8),
	'https://www.mogging.com/r/' || account."platform"::text || '-' || account."handle" || '-' || left(account."id", 8),
	'mogging://attribution',
	'https://apps.apple.com/us/app/mogging-face-rating/id6771414050?ct=' || left(account."platform"::text || '-' || account."handle" || '-' || left(account."id", 8), 40),
	true
FROM "creator_social_accounts" account
WHERE account."status" = 'approved'
ON CONFLICT ("social_account_id") DO NOTHING;
