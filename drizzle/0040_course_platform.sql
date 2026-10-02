CREATE TABLE "course_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"duration_seconds" integer DEFAULT 0 NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"bunny_video_id" text,
	"bunny_library_id" text,
	"storage_key" text,
	"upload_expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_user_id" text,
	"seller_id" text,
	"course_id" text,
	"action" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_contacts" (
	"user_id" text PRIMARY KEY NOT NULL,
	"email" text,
	"verified_at" timestamp with time zone,
	"pending_email" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_emails" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"recipient" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_enrollments" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"user_id" text NOT NULL,
	"order_id" text,
	"source" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"seller_id" text NOT NULL,
	"buyer_id" text NOT NULL,
	"stripe_account_id" text NOT NULL,
	"livemode" boolean NOT NULL,
	"stripe_checkout_id" text,
	"stripe_payment_intent_id" text,
	"stripe_charge_id" text,
	"automatic_tax" boolean NOT NULL,
	"amount" integer NOT NULL,
	"total_amount" integer,
	"stripe_price_id" text NOT NULL,
	"buyer_email" text NOT NULL,
	"currency" text NOT NULL,
	"access_days" integer NOT NULL,
	"course_title" text NOT NULL,
	"refund_policy" text NOT NULL,
	"course_version" integer NOT NULL,
	"refunded_amount" integer DEFAULT 0 NOT NULL,
	"processing_fee" integer,
	"fee_currency" text,
	"disputed" boolean DEFAULT false NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_orders_money_valid" CHECK ("course_orders"."amount" >= 0 and "course_orders"."refunded_amount" >= 0 and "course_orders"."refunded_amount" <= coalesce("course_orders"."total_amount", "course_orders"."amount"))
);
--> statement-breakpoint
CREATE TABLE "course_progress" (
	"user_id" text NOT NULL,
	"course_id" text NOT NULL,
	"lesson_id" text NOT NULL,
	"position_seconds" integer DEFAULT 0 NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_progress_user_id_course_id_lesson_id_pk" PRIMARY KEY("user_id","course_id","lesson_id"),
	CONSTRAINT "course_progress_position_valid" CHECK ("course_progress"."position_seconds" >= 0)
);
--> statement-breakpoint
CREATE TABLE "course_refunds" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"request_key" text NOT NULL,
	"amount" integer NOT NULL,
	"stripe_refund_id" text,
	"state" text DEFAULT 'requested' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_sellers" (
	"id" text PRIMARY KEY NOT NULL,
	"creator_profile_id" text NOT NULL,
	"slug" text NOT NULL,
	"country" text NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"support_email" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"stripe_account_id" text,
	"stripe_connected" boolean DEFAULT false NOT NULL,
	"stripe_livemode" boolean,
	"charges_enabled" boolean DEFAULT false NOT NULL,
	"payouts_enabled" boolean DEFAULT false NOT NULL,
	"requirements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"stripe_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" text PRIMARY KEY NOT NULL,
	"seller_id" text NOT NULL,
	"slug" text NOT NULL,
	"catalog" jsonb,
	"draft" jsonb NOT NULL,
	"published" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"published_version" integer,
	"submitted_version" integer,
	"status" text DEFAULT 'draft' NOT NULL,
	"content_blocked" boolean DEFAULT false NOT NULL,
	"listed" boolean DEFAULT true NOT NULL,
	"sales_enabled" boolean DEFAULT true NOT NULL,
	"review_note" text,
	"stripe_product_id" text,
	"stripe_price_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "courses_version_positive" CHECK ("courses"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "course_assets" ADD CONSTRAINT "course_assets_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_audit" ADD CONSTRAINT "course_audit_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_audit" ADD CONSTRAINT "course_audit_seller_id_course_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."course_sellers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_audit" ADD CONSTRAINT "course_audit_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_contacts" ADD CONSTRAINT "course_contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_emails" ADD CONSTRAINT "course_emails_order_id_course_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."course_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_order_id_course_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."course_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_orders" ADD CONSTRAINT "course_orders_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_orders" ADD CONSTRAINT "course_orders_seller_id_course_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."course_sellers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_orders" ADD CONSTRAINT "course_orders_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_progress" ADD CONSTRAINT "course_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_progress" ADD CONSTRAINT "course_progress_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_refunds" ADD CONSTRAINT "course_refunds_order_id_course_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."course_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_sellers" ADD CONSTRAINT "course_sellers_creator_profile_id_creator_profiles_id_fk" FOREIGN KEY ("creator_profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_seller_id_course_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."course_sellers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "course_assets_course_idx" ON "course_assets" USING btree ("course_id");--> statement-breakpoint
CREATE UNIQUE INDEX "course_assets_bunny_unique" ON "course_assets" USING btree ("bunny_library_id","bunny_video_id");--> statement-breakpoint
CREATE UNIQUE INDEX "course_assets_storage_unique" ON "course_assets" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "course_assets_pending_idx" ON "course_assets" USING btree ("state","updated_at");--> statement-breakpoint
CREATE INDEX "course_audit_course_date_idx" ON "course_audit" USING btree ("course_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "course_emails_order_unique" ON "course_emails" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "course_emails_pending_idx" ON "course_emails" USING btree ("next_attempt_at") WHERE "course_emails"."sent_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "course_enrollments_user_course_unique" ON "course_enrollments" USING btree ("user_id","course_id");--> statement-breakpoint
CREATE INDEX "course_enrollments_course_idx" ON "course_enrollments" USING btree ("course_id");--> statement-breakpoint
CREATE UNIQUE INDEX "course_enrollments_order_unique" ON "course_enrollments" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "course_orders_checkout_unique" ON "course_orders" USING btree ("stripe_account_id","stripe_checkout_id","livemode");--> statement-breakpoint
CREATE UNIQUE INDEX "course_orders_payment_unique" ON "course_orders" USING btree ("stripe_account_id","stripe_payment_intent_id","livemode");--> statement-breakpoint
CREATE UNIQUE INDEX "course_orders_pending_buyer_unique" ON "course_orders" USING btree ("buyer_id","course_id") WHERE "course_orders"."state" = 'pending';--> statement-breakpoint
CREATE INDEX "course_orders_seller_date_idx" ON "course_orders" USING btree ("seller_id","created_at");--> statement-breakpoint
CREATE INDEX "course_orders_buyer_idx" ON "course_orders" USING btree ("buyer_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "course_refunds_order_request_unique" ON "course_refunds" USING btree ("order_id","request_key");--> statement-breakpoint
CREATE UNIQUE INDEX "course_refunds_stripe_unique" ON "course_refunds" USING btree ("stripe_refund_id");--> statement-breakpoint
CREATE UNIQUE INDEX "course_sellers_creator_unique" ON "course_sellers" USING btree ("creator_profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "course_sellers_slug_unique" ON "course_sellers" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "course_sellers_stripe_unique" ON "course_sellers" USING btree ("stripe_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "courses_seller_slug_unique" ON "courses" USING btree ("seller_id","slug");--> statement-breakpoint
CREATE INDEX "courses_catalog_idx" ON "courses" USING btree ("status","listed","published_at");--> statement-breakpoint
CREATE INDEX "courses_seller_idx" ON "courses" USING btree ("seller_id");