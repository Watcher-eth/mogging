CREATE TABLE "creator_attribution_metrics" (
	"submission_id" text PRIMARY KEY NOT NULL,
	"qualified_views" integer DEFAULT 0 NOT NULL,
	"link_clicks" integer DEFAULT 0 NOT NULL,
	"installs" integer DEFAULT 0 NOT NULL,
	"first_time_paid_customers" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "creator_attribution_metrics_submission_id_creator_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."creator_submissions"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "creator_attribution_metrics_qualified_views_nonnegative" CHECK ("qualified_views" >= 0),
	CONSTRAINT "creator_attribution_metrics_link_clicks_nonnegative" CHECK ("link_clicks" >= 0),
	CONSTRAINT "creator_attribution_metrics_installs_nonnegative" CHECK ("installs" >= 0),
	CONSTRAINT "creator_attribution_metrics_paid_customers_nonnegative" CHECK ("first_time_paid_customers" >= 0)
);
--> statement-breakpoint
CREATE TABLE "creator_program_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"monthly_subscription_cents" integer DEFAULT 999 NOT NULL,
	"ninety_day_contribution_margin_cents" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "creator_program_settings_monthly_price_nonnegative" CHECK ("monthly_subscription_cents" >= 0),
	CONSTRAINT "creator_program_settings_margin_nonnegative" CHECK ("ninety_day_contribution_margin_cents" >= 0)
);
--> statement-breakpoint
INSERT INTO "creator_program_settings" ("id", "monthly_subscription_cents", "ninety_day_contribution_margin_cents") VALUES ('default', 999, 0) ON CONFLICT ("id") DO NOTHING;
